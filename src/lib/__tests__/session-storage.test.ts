import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockKeychain = new Map<string, string>();
const mockValid = (key: string) => /^[\w.-]+$/.test(key);

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (key: string) => {
    if (!mockValid(key)) throw new Error(`invalid key ${key}`);
    return mockKeychain.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    if (!mockValid(key)) throw new Error(`invalid key ${key}`);
    if (new TextEncoder().encode(value).length > 2048) throw new Error('value over 2048 bytes');
    mockKeychain.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockKeychain.delete(key);
  },
}));

// eslint-disable-next-line import/first
import { authStorage, chunk, resetPreparedForTests } from '@/lib/session-storage';

const KEY = 'sb-xledzwoyhhhppcndaoch-auth-token';
/** A realistic session: long JWTs plus user metadata with emoji and accents. */
const SESSION = JSON.stringify({
  access_token: 'eyJ' + 'a'.repeat(1400),
  refresh_token: 'r'.repeat(40),
  user: { email: 'zoë@example.com', user_metadata: { name: '🏃‍♀️ Zoë 🔥'.repeat(40) } },
});

beforeEach(async () => {
  mockKeychain.clear();
  await AsyncStorage.clear();
  resetPreparedForTests();
});

describe('session storage', () => {
  it('round-trips a large session through chunks under the 2 KB limit', async () => {
    await authStorage.setItem(KEY, SESSION);
    expect(await authStorage.getItem(KEY)).toBe(SESSION);
    expect(Number(mockKeychain.get(KEY))).toBeGreaterThan(1);
    // Nothing about the session stays in AsyncStorage's plain files.
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('never splits an emoji across chunks', () => {
    const text = 'a' + '😀'.repeat(700);
    const parts = chunk(text, 600);
    expect(parts.join('')).toBe(text);
    for (const p of parts) expect(p).toBe(Buffer.from(p, 'utf8').toString('utf8'));
    for (const p of parts) expect(/[\uD800-\uDBFF]$/.test(p)).toBe(false);
  });

  it('moves a session saved by an older version out of AsyncStorage', async () => {
    await AsyncStorage.setItem(KEY, SESSION);
    expect(await authStorage.getItem(KEY)).toBe(SESSION);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    resetPreparedForTests(); // next launch
    expect(await authStorage.getItem(KEY)).toBe(SESSION);
  });

  it('drops a Keychain session left over from before a reinstall', async () => {
    await authStorage.setItem(KEY, SESSION);
    await AsyncStorage.clear(); // uninstall wipes AsyncStorage but not the Keychain
    resetPreparedForTests();
    expect(await authStorage.getItem(KEY)).toBeNull();
    expect(mockKeychain.size).toBe(0);
  });

  it('removes stale chunks when the session shrinks', async () => {
    await authStorage.setItem(KEY, SESSION);
    await authStorage.setItem(KEY, 'short');
    expect(await authStorage.getItem(KEY)).toBe('short');
    expect([...mockKeychain.keys()].sort()).toEqual([KEY, `${KEY}.0`]);
  });

  it('removes every chunk on sign-out', async () => {
    await authStorage.setItem(KEY, SESSION);
    await authStorage.removeItem(KEY);
    expect(await authStorage.getItem(KEY)).toBeNull();
    expect(mockKeychain.size).toBe(0);
  });

  it('cleans up a plaintext copy left by an interrupted move', async () => {
    await authStorage.setItem(KEY, SESSION);
    await AsyncStorage.setItem(KEY, SESSION);
    resetPreparedForTests();
    expect(await authStorage.getItem(KEY)).toBe(SESSION);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
