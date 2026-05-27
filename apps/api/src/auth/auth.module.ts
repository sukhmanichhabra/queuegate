import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { FraudModule } from '../fraud/fraud.module';
import { TokenBlocklistService } from './token-blocklist.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    FraudModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, TokenBlocklistService],
  exports: [AuthService, JwtStrategy, RolesGuard, TokenBlocklistService],
})
export class AuthModule {}
