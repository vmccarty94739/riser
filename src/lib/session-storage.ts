import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where Supabase keeps the login session: the iOS Keychain / Android Keystore (expo-secure-store)
 * instead of AsyncStorage's plain files, so the refresh token is encrypted at rest.
 *
 * - SecureStore values are capped near 2 KB and a session is larger, so each value is split into
 *   chunks: `key` holds the chunk count, `key.0`, `key.1`… the pieces.
 * - Sessions saved by older versions sit in AsyncStorage. The first read moves them over, so
 *   nobody is signed out (a lost guest session would strand that guest's cloud data).
 * - The iOS Keychain survives uninstalling the app, but AsyncStorage doesn't. A key with no
 *   "prepared" marker in AsyncStorage is a fresh install (or the first run of this version), so
 *   any leftover Keychain value for it is dropped rather than resurrecting an old account.
 * - Web has no SecureStore and keeps using AsyncStorage (localStorage).
 */

/** Characters per chunk. UTF-8 needs at most 3 bytes per UTF-16 unit, so 600 stays under 2 KB. */
const CHUNK = 600;
const PREPARED = 'riser.session-secure.v1:';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/** Splits without cutting a surrogate pair (an emoji) in half. */
export function chunk(value: string, size = CHUNK) {
  const parts: string[] = [];
  let from = 0;
  while (from < value.length) {
    let to = Math.min(from + size, value.length);
    const last = value.charCodeAt(to - 1);
    if (to < value.length && last >= 0xd800 && last <= 0xdbff) to--;
    parts.push(value.slice(from, to));
    from = to;
  }
  return parts;
}

const partKey = (key: string, i: number) => `${key}.${i}`;

async function count(key: string) {
  const n = Number(await SecureStore.getItemAsync(key, OPTIONS));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function secureRemove(key: string, keep = 0) {
  const n = await count(key);
  for (let i = keep; i < n; i++) await SecureStore.deleteItemAsync(partKey(key, i), OPTIONS);
  if (keep === 0) await SecureStore.deleteItemAsync(key, OPTIONS);
}

async function secureGet(key: string) {
  const n = await count(key);
  if (!n) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(partKey(key, i), OPTIONS);
    if (part === null) return null; // torn write: treat as signed out
    parts.push(part);
  }
  return parts.join('');
}

async function secureSet(key: string, value: string) {
  const parts = chunk(value);
  const old = await count(key);
  for (let i = 0; i < parts.length; i++)
    await SecureStore.setItemAsync(partKey(key, i), parts[i], OPTIONS);
  await SecureStore.setItemAsync(key, String(parts.length), OPTIONS);
  for (let i = parts.length; i < old; i++)
    await SecureStore.deleteItemAsync(partKey(key, i), OPTIONS);
}

const prepared = new Map<string, Promise<void>>();

/** Once per key: drop Keychain leftovers from a previous install, then adopt a legacy session. */
function prepare(key: string) {
  let job = prepared.get(key);
  if (!job) {
    job = (async () => {
      if (await AsyncStorage.getItem(PREPARED + key)) {
        await AsyncStorage.removeItem(key); // a plaintext copy left by an interrupted move
        return;
      }
      await secureRemove(key);
      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) await secureSet(key, legacy);
      await AsyncStorage.setItem(PREPARED + key, '1');
      await AsyncStorage.removeItem(key);
    })();
    job.catch(() => prepared.delete(key)); // retry on the next call
    prepared.set(key, job);
  }
  return job;
}

/** The storage adapter handed to Supabase's `auth.storage`. */
export const authStorage =
  Platform.OS === 'web'
    ? AsyncStorage
    : {
        getItem: async (key: string) => {
          await prepare(key);
          return secureGet(key);
        },
        setItem: async (key: string, value: string) => {
          await prepare(key);
          await secureSet(key, value);
        },
        removeItem: async (key: string) => {
          await prepare(key);
          await secureRemove(key);
        },
      };

/** Tests only: forget which keys were prepared. */
export function resetPreparedForTests() {
  prepared.clear();
}
