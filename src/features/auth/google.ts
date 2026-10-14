import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { API_URL } from '@/features/premium/api-tokens';
import { getAuthClient } from '@/lib/supabase';

/**
 * Sign in with Google (the only way to sign in; DECISIONS 45). The auth service does the Google
 * part (PKCE): the browser opens its /authorize address, Google comes back to its /callback, and
 * the auth service sends the user back here with a one-time code that becomes the session.
 * Those two addresses are relayed by the api service (server/index.js), because the gateway asks
 * for the app's key, which a browser opening a page cannot send.
 *
 * An account made before with email and password has the same email as Google: the auth service
 * links them, same account, same data.
 */

export type GoogleResult = { ok: true } | { ok: false; cancelled?: boolean; message?: string };

/** Where Google sends the user back: the app (fft://auth-callback) or this web page. */
const backTo = () =>
  Platform.OS === 'web'
    ? window.location.origin + window.location.pathname
    : Linking.createURL('auth-callback');

/** The auth service's /authorize address, reached through the api service (no key needed there). */
const viaApi = (url: string) => {
  const u = new URL(url);
  return `${API_URL}${u.pathname}${u.search}`;
};

/** Opens Google, then turns the code that comes back into the session. */
async function run(
  start: Promise<{ data: { url: string | null }; error: Error | null }>,
): Promise<GoogleResult> {
  const { data, error } = await start;
  if (error || !data.url) return { ok: false, message: error?.message };
  const url = viaApi(data.url);
  if (Platform.OS === 'web') {
    // The page goes to Google and comes back with ?code= (handled by finishWebSignIn).
    window.location.assign(url);
    return { ok: true };
  }
  const res = await WebBrowser.openAuthSessionAsync(url, backTo());
  if (res.type !== 'success') return { ok: false, cancelled: true };
  const back = new URL(res.url);
  const code = back.searchParams.get('code');
  if (!code)
    return {
      ok: false,
      message: back.searchParams.get('error_description') ?? undefined,
    };
  const done = await getAuthClient().auth.exchangeCodeForSession(code);
  return done.error ? { ok: false, message: done.error.message } : { ok: true };
}

export const signInWithGoogle = () =>
  run(
    getAuthClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: backTo(), skipBrowserRedirect: true },
    }),
  );

/** Adds Google to the account signed in now (an older account whose email differs from Google). */
export const linkGoogle = () =>
  run(
    getAuthClient().auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: backTo(), skipBrowserRedirect: true },
    }),
  );

/** True when this account can already sign in with Google. */
export async function hasGoogle(): Promise<boolean> {
  const { data } = await getAuthClient().auth.getUserIdentities();
  return (data?.identities ?? []).some((i) => i.provider === 'google');
}

/** Web: back from Google with ?code= in the address: the session, then a clean address. */
export async function finishWebSignIn(): Promise<void> {
  if (Platform.OS !== 'web') return;
  const here = new URL(window.location.href);
  const code = here.searchParams.get('code');
  if (!code) return;
  await getAuthClient().auth.exchangeCodeForSession(code);
  here.searchParams.delete('code');
  window.history.replaceState(null, '', here.toString());
}
