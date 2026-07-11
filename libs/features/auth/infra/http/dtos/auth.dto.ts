import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AUTH_METHOD_VALUES } from '../../../../../shared/auth/auth-method';
import { MeDto } from '../../../../users/infra/http/dtos/me.dto';
import { AUTH_PASSWORD_MIN_LENGTH } from './password-policy';

const OIDC_PROVIDER_VALUES = ['GOOGLE'] as const;

export class AuthUserDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @ApiPropertyOptional({
    isArray: true,
    enum: AUTH_METHOD_VALUES,
    example: ['PASSWORD', 'GOOGLE'],
    description:
      'Linked authentication methods on this account. Omitted on token refresh responses.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(AUTH_METHOD_VALUES, { each: true })
  authMethods?: string[];
}

export class AuthResultDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ example: '<access-token>' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  refreshToken!: string;
}

export class AuthResultEnvelopeDto {
  @ApiProperty({ type: AuthResultDto })
  data!: AuthResultDto;
}

export class AuthResultWithMeDto {
  @ApiProperty({ type: MeDto })
  user!: MeDto;

  @ApiProperty({ example: '<access-token>' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  refreshToken!: string;
}

export class AuthResultWithMeEnvelopeDto {
  @ApiProperty({ type: AuthResultWithMeDto })
  data!: AuthResultWithMeDto;
}

export class PasswordRegisterRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  password!: string;

  @ApiProperty({ required: false, description: 'Stable per-device identifier (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Human-friendly device name (optional).' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class PasswordLoginRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiProperty({ required: false, description: 'Stable per-device identifier (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Human-friendly device name (optional).' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class OidcExchangeRequestDto {
  @ApiProperty({ enum: OIDC_PROVIDER_VALUES, example: 'GOOGLE' })
  @IsString()
  @IsIn(OIDC_PROVIDER_VALUES)
  provider!: (typeof OIDC_PROVIDER_VALUES)[number];

  @ApiProperty({ example: '<oidc-id-token>' })
  @IsString()
  @MinLength(1)
  idToken!: string;

  @ApiProperty({ required: false, description: 'Stable per-device identifier (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Human-friendly device name (optional).' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class OidcConnectRequestDto {
  @ApiProperty({ enum: OIDC_PROVIDER_VALUES, example: 'GOOGLE' })
  @IsString()
  @IsIn(OIDC_PROVIDER_VALUES)
  provider!: (typeof OIDC_PROVIDER_VALUES)[number];

  @ApiProperty({ example: '<oidc-id-token>' })
  @IsString()
  @MinLength(1)
  idToken!: string;
}

export class RefreshRequestDto {
  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class LogoutRequestDto {
  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class DesktopHandoffRequestDto {
  @ApiProperty({
    example: 'burnly://auth/callback',
    description: 'Must match AUTH_DESKTOP_REDIRECT_URIS allowlist exactly.',
  })
  @IsString()
  @MinLength(1)
  redirectUri!: string;

  @ApiProperty({
    description: 'PKCE S256 code_challenge (base64url(SHA256(code_verifier))).',
  })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  codeChallenge!: string;

  @ApiProperty({ enum: ['S256'], example: 'S256' })
  @IsString()
  @IsIn(['S256'])
  codeChallengeMethod!: 'S256';

  @ApiProperty({ description: 'Opaque CSRF state echoed back to the desktop.' })
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  state!: string;

  @ApiProperty({ enum: ['desktop'], example: 'desktop' })
  @IsString()
  @IsIn(['desktop'])
  client!: 'desktop';
}

export class DesktopHandoffDataDto {
  @ApiProperty({ description: 'One-time handoff code (send to desktop via redirect).' })
  code!: string;

  @ApiProperty({ example: 60 })
  expiresIn!: number;

  @ApiProperty({ example: 'burnly://auth/callback' })
  redirectUri!: string;

  @ApiProperty()
  state!: string;
}

export class DesktopHandoffEnvelopeDto {
  @ApiProperty({ type: DesktopHandoffDataDto })
  data!: DesktopHandoffDataDto;
}

export class DesktopTokenRequestDto {
  @ApiProperty({ description: 'One-time code from web redirect.' })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  code!: string;

  @ApiProperty({ description: 'PKCE code_verifier (43–128 chars).' })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  codeVerifier!: string;

  @ApiProperty({ example: 'burnly://auth/callback' })
  @IsString()
  @MinLength(1)
  redirectUri!: string;

  @ApiProperty({ enum: ['desktop'], example: 'desktop' })
  @IsString()
  @IsIn(['desktop'])
  client!: 'desktop';

  @ApiProperty({ required: false, description: 'Stable desktop install id (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class ChangePasswordRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  newPassword!: string;
}

export class VerifyEmailRequestDto {
  @ApiProperty({ example: '<verification-token>' })
  @IsString()
  @MinLength(1)
  token!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmRequestDto {
  @ApiProperty({ example: '<password-reset-token>' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  newPassword!: string;
}
