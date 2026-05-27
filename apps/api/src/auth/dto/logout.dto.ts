import { IsString, IsOptional } from 'class-validator';

/**
 * LogoutDto — body for POST /auth/logout.
 *
 * `accessToken` is optional for backwards compatibility: existing clients
 * that only send `refreshToken` will still get the refresh token revoked;
 * the access-token blocklist entry is simply skipped if the field is absent.
 */
export class LogoutDto {
  @IsString()
  refreshToken: string;

  @IsString()
  @IsOptional()
  accessToken?: string;
}
