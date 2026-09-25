import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * A local, on-device account. There is no server yet, so this only saves the sign-up on this
 * phone: the password is salted + SHA-256 hashed and kept in the OS keychain/keystore, never
 * in plain text and never in AsyncStorage. Swap this module for a real auth provider later.
 */
const KEY = 'riser.account';

export type AccountMethod = 'email' | 'phone';
export type Account = { method: AccountMethod; identifier: string };

export function validateIdentifier(method: AccountMethod, value: string) {
  const v = value.trim();
  if (method === 'email')
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Enter a valid email address.';
  return v.replace(/\D/g, '').length >= 10 ? null : 'Enter a phone number with area code.';
}

export function validatePassword(password: string) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Mix letters and numbers.';
  return null;
}

async function hash(salt: string, password: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

/** Saves the account credential securely. Returns the public part to keep in app state. */
export async function createAccount(
  method: AccountMethod,
  identifier: string,
  password: string
): Promise<Account> {
  const account: Account = {
    method,
    identifier:
      method === 'email' ? identifier.trim().toLowerCase() : identifier.replace(/[^\d+]/g, ''),
  };
  if (Platform.OS !== 'web') {
    const salt = Crypto.randomUUID();
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({
        ...account,
        salt,
        hash: await hash(salt, password),
        createdAt: new Date().toISOString(),
      })
    );
  }
  return account;
}

export async function deleteAccount() {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY);
}
