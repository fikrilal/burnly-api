import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PatchMeProfileDto, transformUsername } from './me.dto';

describe('transformUsername', () => {
  it('trims and lowercases non-empty string', () => {
    expect(transformUsername({ value: '  Dante_99  ' })).toBe('dante_99');
  });

  it('converts empty string to null', () => {
    expect(transformUsername({ value: '   ' })).toBeNull();
  });

  it('passes null and undefined through', () => {
    expect(transformUsername({ value: null })).toBeNull();
    expect(transformUsername({ value: undefined })).toBeUndefined();
  });
});

describe('PatchMeProfileDto username validation', () => {
  it('validates a valid username handle', async () => {
    const plain = { username: '  Valid_User-123 ' };
    const dto = plainToInstance(PatchMeProfileDto, plain);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.username).toBe('valid_user-123');
  });

  it('allows unsetting username with null or empty string', async () => {
    const plain = { username: '' };
    const dto = plainToInstance(PatchMeProfileDto, plain);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.username).toBeNull();
  });

  it('rejects usernames shorter than 3 characters', async () => {
    const plain = { username: 'ab' };
    const dto = plainToInstance(PatchMeProfileDto, plain);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('username');
  });

  it('rejects usernames longer than 30 characters', async () => {
    const plain = { username: 'a'.repeat(31) };
    const dto = plainToInstance(PatchMeProfileDto, plain);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('username');
  });

  it('rejects invalid characters in username', async () => {
    const plain = { username: 'user@name!' };
    const dto = plainToInstance(PatchMeProfileDto, plain);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('username');
  });

  it('rejects reserved handles', async () => {
    const reservedNames = [
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
    ];

    for (const name of reservedNames) {
      const dto = plainToInstance(PatchMeProfileDto, { username: name });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('username');
    }
  });
});
