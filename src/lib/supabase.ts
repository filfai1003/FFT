import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient<Database> | null = null;

/**
 * The app-wide Supabase client. Created on first use so screens that do not need the backend
 * (like the component catalogue) work without a .env file.
 *
 * Session storage: AsyncStorage for now. Phase 1 (auth) decides whether to move the session to
 * an encrypted store, because the account holds health data.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured: copy .env.example to .env and fill in the URL and anon key (npx supabase status).',
    );
  }
  client ??= createClient<Database>(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
