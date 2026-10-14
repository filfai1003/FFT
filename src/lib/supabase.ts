import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getCurrentUserId } from './current-user';
import { getLocalClient, LOCAL_USER_ID } from './local-db';
import { getMode } from './mode';
import { dataHomeIsOnline } from './plan';
import { authStorage } from './secure-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient<Database> | null = null;

/**
 * The server client: accounts (sign in / up / out, password reset) and the Edge Functions. Created
 * on first use so screens that do not need the backend work without a .env file. The session is
 * stored encrypted on devices (see secure-storage.ts).
 */
export function getAuthClient(): SupabaseClient<Database> {
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

/** True when the user's data lives on the server (premium); otherwise it stays on the device. */
export const dataIsOnline = () => getMode() === 'cloud' && dataHomeIsOnline(getCurrentUserId());

/**
 * Where the user's DATA lives (plans, workouts, food, body, photos…). Free accounts and the
 * account-less mode use the database on this device, one per user, with the same API as Supabase.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (dataIsOnline()) return getAuthClient();
  return getLocalClient(getCurrentUserId() ?? LOCAL_USER_ID) as unknown as SupabaseClient<Database>;
}
