import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportError } from '@/lib/error-report';
import { getAuthClient } from '@/lib/supabase';

/**
 * The health data consent, told to the server too (DECISIONS 81): while it is withdrawn the app is
 * paused, and so is its sync, so the server would never learn it from the synced consents. The
 * server then refuses the API, MCP, AI app sign-ins and the included AI for the account.
 * This is account state (like Keep a copy on the server), not user data: it goes through the auth
 * client. Only changes are sent: no row on the server means "given", as for every account so far.
 */
const keyOf = (userId: string) => `fft.consent-server.${userId}`;
/** Removed when the account is deleted. */
export const consentKeyOf = keyOf;
const RETRY_MS = 60_000;

const server = () => getAuthClient() as unknown as SupabaseClient;

/** What the server was last told for this account ('off' = withdrawn); null = never told (given). */
async function lastTold(userId: string): Promise<'on' | 'off' | null> {
  const v = await AsyncStorage.getItem(keyOf(userId)).catch(() => null);
  return v === 'off' || v === 'on' ? v : null;
}

/** Tells the server when it differs from what it was last told. True when they now agree. */
export async function syncHealthConsent(userId: string, withdrawn: boolean): Promise<boolean> {
  const want = withdrawn ? 'off' : 'on';
  const told = (await lastTold(userId)) ?? 'on';
  if (told === want) return true;
  const { error } = await server().rpc('set_health_consent', { p_granted: !withdrawn });
  if (error) return false;
  await AsyncStorage.setItem(keyOf(userId), want).catch(() => undefined);
  return true;
}

/** Keeps the server's copy of the consent in step, retrying every minute while offline. */
export function useHealthConsentOnServer(
  userId: string | null,
  enabled: boolean,
  withdrawn: boolean,
) {
  useEffect(() => {
    if (!userId || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const run = async () => {
      const ok = await syncHealthConsent(userId, withdrawn).catch((e: unknown) => {
        reportError(e, 'sync', { what: 'health consent' });
        return false;
      });
      if (!ok && !stopped) timer = setTimeout(() => void run(), RETRY_MS);
    };
    void run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, enabled, withdrawn]);
}
