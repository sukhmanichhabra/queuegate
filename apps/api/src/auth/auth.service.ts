import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { requireEnv } from '../env';
import { getSecret } from '../config/secrets';
import { TokenBlocklistService } from './token-blocklist.service';

/** How old (in ms) a revoked token's revoked_at must be before we treat
 *  a second use as a genuine theft (vs. a network-retry double-fire). */
const THEFT_GRACE_MS = 5_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenBlocklist: TokenBlocklistService,
  ) {}

  /**
   * Issues a new access + refresh token pair.
   *
   * @param userId    The user the tokens are issued for.
   * @param familyId  The refresh-token family UUID.
   *                  Pass an existing family_id on rotation so all tokens in
   *                  a rotation chain share the same value.
   *                  Omit (or pass undefined) on a fresh login — a new UUID
   *                  is generated automatically.
   */
  private async generateTokens(userId: string, familyId?: string) {
    const jti = randomUUID(); // unique per access-token issuance
    const resolvedFamilyId = familyId ?? randomUUID(); // new family on fresh login

    const payload = { sub: userId, jti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: requireEnv('JWT_ACCESS_SECRET'),
        expiresIn: getSecret('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync({ sub: userId }, {
        secret: requireEnv('JWT_REFRESH_SECRET'),
        expiresIn: getSecret('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        family_id: resolvedFamilyId,
      },
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password_hash: passwordHash,
        },
      });

      // For MERCHANT_ADMIN: auto-create a Merchant and link it.
      // For SHOPPER (or any other role): merchant_id stays null.
      let merchantId: string | null = null;
      if (dto.role === 'MERCHANT_ADMIN') {
        const merchant = await tx.merchant.create({
          data: {
            name: dto.email.split('@')[0], // sensible default; editable later
            owner_user_id: user.id,
          },
        });
        merchantId = merchant.id;
      }

      await tx.userRole.create({
        data: {
          user_id: user.id,
          role: dto.role ?? 'SHOPPER',
          merchant_id: merchantId,
        },
      });

      return user.id;
    });

    return this.generateTokens(userId);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Fresh login → new family_id (no argument → generateTokens creates one)
    return this.generateTokens(user.id);
  }

  async refresh(dto: RefreshDto) {
    // Step 1: Verify the JWT signature and expiry.
    let jwtPayload: any;
    try {
      jwtPayload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: requireEnv('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Step 2: Find the token row regardless of revoked_at so we can detect
    //         replay of an already-rotated token.
    const allTokens = await this.prisma.refreshToken.findMany({
      where: {
        user_id: jwtPayload.sub,
        expires_at: { gt: new Date() },
      },
    });

    let matchedToken: (typeof allTokens)[0] | null = null;
    for (const token of allTokens) {
      if (await bcrypt.compare(dto.refreshToken, token.token_hash)) {
        matchedToken = token;
        break;
      }
    }

    // Step 3: Not found at all → ordinary invalid / garbage token (not theft).
    if (!matchedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Step 4: Found but already revoked → potential theft attempt.
    if (matchedToken.revoked_at !== null) {
      const ageMs = Date.now() - matchedToken.revoked_at.getTime();

      if (ageMs <= THEFT_GRACE_MS) {
        // Within the grace window → treat as network retry, NOT theft.
        // Don't revoke the family; just reject this duplicate request.
        throw new UnauthorizedException('Token already rotated — please retry with your current refresh token');
      }

      // Outside grace window → genuine replay / theft detected.
      // Revoke every token in this family to force re-authentication.
      await this.prisma.refreshToken.updateMany({
        where: { family_id: matchedToken.family_id },
        data: { revoked_at: new Date() },
      });

      this.logger.warn(
        `Refresh-token replay detected — family revoked. ` +
        `user_id=${jwtPayload.sub} family_id=${matchedToken.family_id}`,
      );

      throw new UnauthorizedException('Session invalidated due to token reuse — please log in again');
    }

    // Step 5: Valid, non-revoked token → normal rotation.
    // Revoke the presented token and issue a new pair inheriting the family_id.
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { revoked_at: new Date() },
    });

    return this.generateTokens(jwtPayload.sub, matchedToken.family_id);
  }

  async logout(dto: LogoutDto) {
    // ── Access-token revocation ──────────────────────────────────────────────
    // Blocklist the access token so it stops working immediately, rather than
    // waiting for its natural 15-minute expiry.
    if (dto.accessToken) {
      try {
        const accessPayload = this.jwtService.decode(dto.accessToken) as any;
        if (accessPayload?.jti && accessPayload?.exp) {
          await this.tokenBlocklist.revoke(accessPayload.jti, accessPayload.exp);
        }
      } catch {
        // Malformed access token — skip blocklist write, still revoke refresh.
      }
    }

    // ── Refresh-token revocation ─────────────────────────────────────────────
    // Existing logic: find and revoke the matching refresh token.
    try {
      const payload = this.jwtService.decode(dto.refreshToken) as any;
      if (!payload) return { success: true };

      const tokens = await this.prisma.refreshToken.findMany({
        where: {
          user_id: payload.sub,
          revoked_at: null,
        },
      });

      for (const token of tokens) {
        const matches = await bcrypt.compare(dto.refreshToken, token.token_hash);
        if (matches) {
          await this.prisma.refreshToken.update({
            where: { id: token.id },
            data: { revoked_at: new Date() },
          });
          break;
        }
      }
    } catch {
      // ignore token revocation failure
    }

    return { success: true };
  }
}
