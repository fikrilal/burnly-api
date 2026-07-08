import {
  UNKNOWN_MODEL_IDENTITY_KEY,
  rawModelIdFromIdentityKey,
  toModelIdentityKey,
} from './model-identity';

describe('toModelIdentityKey', () => {
  it('maps null/undefined/blank to the unknown sentinel', () => {
    expect(toModelIdentityKey(null)).toBe(UNKNOWN_MODEL_IDENTITY_KEY);
    expect(toModelIdentityKey(undefined)).toBe(UNKNOWN_MODEL_IDENTITY_KEY);
    expect(toModelIdentityKey('')).toBe(UNKNOWN_MODEL_IDENTITY_KEY);
    expect(toModelIdentityKey('   ')).toBe(UNKNOWN_MODEL_IDENTITY_KEY);
  });

  it('trims and keeps concrete model ids', () => {
    expect(toModelIdentityKey('  claude-sonnet-4  ')).toBe('claude-sonnet-4');
  });
});

describe('rawModelIdFromIdentityKey', () => {
  it('round-trips known and unknown buckets', () => {
    expect(rawModelIdFromIdentityKey(UNKNOWN_MODEL_IDENTITY_KEY)).toBeNull();
    expect(rawModelIdFromIdentityKey('claude-sonnet-4')).toBe('claude-sonnet-4');
  });
});
