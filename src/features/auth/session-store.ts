import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { LOCAL_USER_ID } from '@/lib/local-db';
import { setCurrentUserId } from '@/lib/current-user';
import { getMode, loadMode, setMode } from '@/lib/mode';
import { getAuthClient, isSupabaseConfigured } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn';

type State = {
  status: AuthStatus;
  session: Session | null;
  userId: string | null;
};

export const useSessionStore = create<State>(() => ({
  status: 'loading',
  session: null,
  userId: null,
}));

function apply(session: Session | null) {
  setCurrentUserId(session?.user.id ?? null);
  useSessionStore.setState({
    status: session ? 'signedIn' : 'signedOut',
    session,
    userId: session?.user.id ?? null,
  });
}

/** Offline mode: no account, the one local user is always "signed in". */
function applyOffline() {
  setCurrentUserId(LOCAL_USER_ID);
  useSessionStore.setState({
    status: 'signedIn',
    session: { user: { id: LOCAL_USER_ID } } as unknown as Session,
    userId: LOCAL_USER_ID,
  });
}

let started = false;
let subscribed = false;

/** Signs in to the server account side: restores the saved session and follows its changes. */
async function connectCloud() {
  if (!isSupabaseConfigured) {
    useSessionStore.setState({ status: 'unconfigured', session: null, userId: null });
    return;
  }
  const supabase = getAuthClient();
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      if (getMode() === 'cloud') apply(session);
    });
  }
  const { data } = await supabase.auth.getSession();
  apply(data.session);
}

/** Picks the saved mode (account or offline) and follows sign-in / sign-out. Call once. */
export function startAuthListener() {
  if (started) return;
  started = true;
  void loadMode().then((mode) => (mode === 'offline' ? applyOffline() : connectCloud()));
}

/** "Use without an account": from now on everything is saved on this device only. */
export async function enterOfflineMode(queryClient: { clear: () => void }) {
  await setMode('offline');
  queryClient.clear();
  applyOffline();
}

/** Back to the account screen. The data stays on the device for the next time. */
export async function leaveOfflineMode(queryClient?: { clear: () => void }) {
  await setMode('cloud');
  queryClient?.clear();
  useSessionStore.setState({ status: 'loading', session: null, userId: null });
  await connectCloud();
}
