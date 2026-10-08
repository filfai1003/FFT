import { decryptWithKey, encryptWithKey } from './secure-storage';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-crypto', () => ({}));

describe('session encryption', () => {
  const key = new Uint8Array(32).map((_, i) => i + 1);

  it('round-trips a long unicode session', () => {
    const session = JSON.stringify({ access_token: 'x'.repeat(3000), user: { name: 'Zoë ✓' } });
    const encrypted = encryptWithKey(session, key);
    expect(encrypted).not.toContain('access_token');
    expect(decryptWithKey(encrypted, key)).toBe(session);
  });

  it('a different key does not decrypt to the original', () => {
    const other = new Uint8Array(32).map((_, i) => 255 - i);
    expect(decryptWithKey(encryptWithKey('secret', key), other)).not.toBe('secret');
  });
});
