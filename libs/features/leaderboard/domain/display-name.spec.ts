import { publicHandleFromUserId, resolvePublicDisplayName } from './display-name';

describe('public display name', () => {
  const userId = '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0';

  it('prefers displayName', () => {
    expect(
      resolvePublicDisplayName(
        { displayName: '  Ahmad  ', givenName: 'X', familyName: 'Y' },
        userId,
      ),
    ).toBe('Ahmad');
  });

  it('falls back to given + family', () => {
    expect(
      resolvePublicDisplayName(
        { displayName: null, givenName: 'Ahmad', familyName: 'Fikril' },
        userId,
      ),
    ).toBe('Ahmad Fikril');
  });

  it('falls back to handle never email', () => {
    expect(
      resolvePublicDisplayName({ displayName: '  ', givenName: null, familyName: null }, userId),
    ).toBe(publicHandleFromUserId(userId));
    expect(publicHandleFromUserId(userId)).toBe('user_3d2c7b2a');
  });
});
