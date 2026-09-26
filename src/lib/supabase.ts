import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { authStorage } from './session-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** False until `.env` has the project URL and publishable key; the app then runs local-only. */
export const cloudConfigured = !!url && !!key;

/** No request may hang forever: a stalled one (e.g. cut off when iOS suspends the app) fails. */
const TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Respect a caller's own abort signal too.
  init?.signal?.addEventListener('abort', () => controller.abort());
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

let client: SupabaseClient | null = null;

/** The shared client, created on first use (never at import, so tests and web prerender don't touch storage). */
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  client ??= createClient(url!, key!, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchWithTimeout },
  });
  return client;
}
