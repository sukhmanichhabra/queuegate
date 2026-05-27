import { Controller, Post, Get, Body, Request, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { RateLimitGuard } from '../fraud/rate-limit.guard';
import { RateLimit } from '../fraud/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 100, windowSec: 3600, keyStrategy: 'ip', keyPrefix: 'register' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowSec: 900, keyStrategy: 'ip+email', keyPrefix: 'login' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowSec: 900, keyStrategy: 'ip', keyPrefix: 'refresh' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  /**
   * GET /auth/me — returns the authenticated user's id, email, and primary role.
   * Requires a valid Bearer access token. JwtStrategy.validate() already loads
   * the full user+roles from Prisma, so no extra DB call is needed here.
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Request() req: any) {
    const user = req.user;
    // user.roles is an array of UserRole rows: [{ role, merchant_id, ... }]
    const primaryRole: string = user.roles?.[0]?.role ?? 'SHOPPER';
    return {
      id: user.id,
      email: user.email,
      role: primaryRole,
    };
  }
}
