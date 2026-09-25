import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** False until `.env` has the project URL and publishable key; the app then runs local-only. */
export const cloudConfigured = !!url && !!key;

let client: SupabaseClient | null = null;

/** The shared client, created on first use (never at import, so tests and web prerender don't touch storage). */
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  client ??= createClient(url!, key!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
