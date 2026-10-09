import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getLocalClient } from './local-db';
import { getMode } from './mode';
import { authStorage } from './secure-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient<Database> | null = null;

/**
 * The app-wide Supabase client. Created on first use so screens that do not need the backend
 * (like the component catalogue) work without a .env file.
 *
 * The session is stored encrypted on devices (see secure-storage.ts).
 */
export function getSupabase(): SupabaseClient<Database> {
  // Offline mode: the same API, answered by the database on this device.
  if (getMode() === 'offline') return getLocalClient() as unknown as SupabaseClient<Database>;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured: copy .env.example to .env and fill in the URL and anon key (npx supabase status).',
    );
  }
  client ??= createClient<Database>(url, anonKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
