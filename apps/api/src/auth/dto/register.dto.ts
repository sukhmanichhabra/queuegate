import { IsEmail, IsString, IsOptional, IsIn, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Role chosen by the user on the registration page. Defaults to SHOPPER. */
  @IsOptional()
  @IsIn(['SHOPPER', 'MERCHANT_ADMIN'])
  role?: 'SHOPPER' | 'MERCHANT_ADMIN';
}
