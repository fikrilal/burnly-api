import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { AUTH_METHOD_VALUES } from '../../../../../shared/auth/auth-method';

const MAX_PROFILE_FIELD_LENGTH = 100;
const MAX_URL_FIELD_LENGTH = 255;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function transformWebsiteUrl({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  let urlString = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    urlString = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return urlString;
    }
  } catch {
    // Ignore URL parse error; return trimmed so validator fails
  }
  return trimmed;
}

function transformGithubUrl({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  let raw = trimmed;
  if (raw.startsWith('@')) {
    raw = raw.slice(1);
  }
  if (raw.startsWith('https://')) {
    raw = raw.slice(8);
  } else if (raw.startsWith('http://')) {
    raw = raw.slice(7);
  }
  if (raw.startsWith('www.github.com/')) {
    raw = raw.slice(15);
  } else if (raw.startsWith('github.com/')) {
    raw = raw.slice(11);
  }
  if (raw.endsWith('/')) {
    raw = raw.slice(0, -1);
  }

  const githubUserRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  if (githubUserRegex.test(raw)) {
    return `https://github.com/${raw}`;
  }
  return trimmed;
}

function getConstraintFields(args: ValidationArguments): ReadonlyArray<string> {
  const [fields] = args.constraints;
  if (!Array.isArray(fields)) return [];
  return fields.filter((field): field is string => typeof field === 'string');
}

function AtLeastOneDefined(fields: ReadonlyArray<string>, validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'atLeastOneDefined',
      target: target.constructor,
      propertyName,
      constraints: [fields],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const keys = getConstraintFields(args);
          if (value === null || typeof value !== 'object') return false;
          const obj = isRecord(value) ? value : {};
          return keys.some((k) => obj[k] !== undefined);
        },
        defaultMessage(args: ValidationArguments): string {
          const keys = getConstraintFields(args);
          return `At least one of ${keys.join(', ')} must be provided`;
        },
      },
    });
  };
}

function AtLeastOneOfRoot(fields: ReadonlyArray<string>, validationOptions?: ValidationOptions) {
  return (target: object) => {
    registerDecorator({
      name: 'atLeastOneOfRoot',
      target: target.constructor,
      propertyName: fields[0] ?? 'body',
      constraints: [fields],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const keys = getConstraintFields(args);
          const obj = isRecord(args.object) ? args.object : {};
          return keys.some((k) => obj[k] !== undefined);
        },
        defaultMessage(args: ValidationArguments): string {
          const keys = getConstraintFields(args);
          return `At least one of ${keys.join(', ')} must be provided`;
        },
      },
    });
  };
}

const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'login',
  'register',
  'dashboard',
  'settings',
  'leaderboard',
  'reports',
  'download',
  'devices',
  'profile',
  'auth',
  'null',
  'undefined',
]);

export function transformUsername({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return null;
  return trimmed;
}

function IsNotReservedUsername(validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotReservedUsername',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'string') return false;
          return !RESERVED_USERNAMES.has(value.toLowerCase());
        },
        defaultMessage(args: ValidationArguments): string {
          return `username '${String(args.value)}' is reserved and cannot be used`;
        },
      },
    });
  };
}

export class MeProfileDto {
  @ApiPropertyOptional({
    type: String,
    example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0',
    nullable: true,
    description:
      'Current profile image stored file ID. Use `GET /v1/me/profile-image/url` to get a short-lived URL for rendering.',
  })
  @IsOptional()
  @IsString()
  profileImageFileId!: string | null;

  @ApiPropertyOptional({ type: String, example: 'Dante', nullable: true })
  @IsOptional()
  @IsString()
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, example: 'Dante', nullable: true })
  @IsOptional()
  @IsString()
  givenName!: string | null;

  @ApiPropertyOptional({ type: String, example: 'Alighieri', nullable: true })
  @IsOptional()
  @IsString()
  familyName!: string | null;

  @ApiPropertyOptional({ type: String, example: 'dante', nullable: true })
  @IsOptional()
  @IsString()
  username!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://github.com/dante',
    nullable: true,
    maxLength: MAX_URL_FIELD_LENGTH,
  })
  @IsOptional()
  @IsString()
  githubUrl!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://dante.example.com',
    nullable: true,
    maxLength: MAX_URL_FIELD_LENGTH,
  })
  @IsOptional()
  @IsString()
  websiteUrl!: string | null;
}

export class MeLeaderboardDto {
  @ApiProperty({
    example: false,
    description:
      'When true, aggregated token totals and public profile fields may appear on the public leaderboard (ADR 0023). Default false.',
  })
  optIn!: boolean;

  @ApiPropertyOptional({
    type: String,
    example: '2026-07-23T12:00:00.000Z',
    nullable: true,
    format: 'date-time',
    description: 'When the user last opted in; null when opted out or never opted in.',
  })
  optedInAt!: string | null;
}

export class AccountDeletionDto {
  @ApiProperty({ example: '2026-01-10T12:34:56.789Z', format: 'date-time' })
  @IsString()
  requestedAt!: string;

  @ApiProperty({ example: '2026-02-09T12:34:56.789Z', format: 'date-time' })
  @IsString()
  scheduledFor!: string;
}

export class MeDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @ApiProperty({ example: ['USER'] })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];

  @ApiProperty({
    isArray: true,
    enum: AUTH_METHOD_VALUES,
    example: ['PASSWORD'],
    description: 'Linked authentication methods on this account.',
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(AUTH_METHOD_VALUES, { each: true })
  authMethods!: string[];

  @ApiProperty({ type: MeProfileDto })
  profile!: MeProfileDto;

  @ApiProperty({ type: MeLeaderboardDto })
  leaderboard!: MeLeaderboardDto;

  @ApiPropertyOptional({
    type: AccountDeletionDto,
    nullable: true,
    description:
      'When set, the account is scheduled for deletion. The request can be canceled until scheduledFor.',
  })
  accountDeletion!: AccountDeletionDto | null;
}

export class MeEnvelopeDto {
  @ApiProperty({ type: MeDto })
  data!: MeDto;
}

export class PatchMeProfileDto {
  @ApiPropertyOptional({
    type: String,
    example: 'Dante',
    nullable: true,
    minLength: 1,
    maxLength: MAX_PROFILE_FIELD_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROFILE_FIELD_LENGTH)
  displayName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Dante',
    nullable: true,
    minLength: 1,
    maxLength: MAX_PROFILE_FIELD_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROFILE_FIELD_LENGTH)
  givenName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Alighieri',
    nullable: true,
    minLength: 1,
    maxLength: MAX_PROFILE_FIELD_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROFILE_FIELD_LENGTH)
  familyName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'dante',
    nullable: true,
    minLength: 3,
    maxLength: 30,
  })
  @Transform(transformUsername)
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]{3,30}$/, {
    message:
      'username must be 3 to 30 characters long and contain only lowercase letters, numbers, hyphens, or underscores',
  })
  @IsNotReservedUsername()
  username?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://github.com/dante',
    nullable: true,
    maxLength: MAX_URL_FIELD_LENGTH,
  })
  @Transform(transformGithubUrl)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_URL_FIELD_LENGTH)
  @Matches(/^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/, {
    message: 'githubUrl must be a valid GitHub username or URL',
  })
  githubUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'https://dante.example.com',
    nullable: true,
    maxLength: MAX_URL_FIELD_LENGTH,
  })
  @Transform(transformWebsiteUrl)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_URL_FIELD_LENGTH)
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'websiteUrl must be a valid HTTP or HTTPS URL' },
  )
  websiteUrl?: string | null;
}

export class PatchMeLeaderboardDto {
  @ApiProperty({
    example: true,
    description: 'Set true to appear on the public leaderboard; false removes immediately.',
  })
  @IsBoolean()
  optIn!: boolean;
}

@AtLeastOneOfRoot(['profile', 'leaderboard'], {
  message: 'At least one of profile, leaderboard must be provided',
})
export class PatchMeRequestDto {
  @ApiPropertyOptional({ type: PatchMeProfileDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PatchMeProfileDto)
  @AtLeastOneDefined(
    ['displayName', 'givenName', 'familyName', 'username', 'githubUrl', 'websiteUrl'],
    {
      message: 'At least one profile field must be provided',
    },
  )
  profile?: PatchMeProfileDto;

  @ApiPropertyOptional({ type: PatchMeLeaderboardDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PatchMeLeaderboardDto)
  leaderboard?: PatchMeLeaderboardDto;
}
