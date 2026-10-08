import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn';

type State = {
  status: AuthStatus;
  session: Session | null;
  userId: string | null;
};

export const useSessionStore = create<State>(() => ({
  status: isSupabaseConfigured ? 'loading' : 'unconfigured',
  session: null,
  userId: null,
}));

function apply(session: Session | null) {
  useSessionStore.setState({
    status: session ? 'signedIn' : 'signedOut',
    session,
    userId: session?.user.id ?? null,
  });
}

let started = false;

/** Restores the saved session and follows sign-in / sign-out / token refresh. Call once. */
export function startAuthListener() {
  if (started || !isSupabaseConfigured) return;
  started = true;
  const supabase = getSupabase();
  void supabase.auth.getSession().then(({ data }) => apply(data.session));
  supabase.auth.onAuthStateChange((_event, session) => apply(session));
}
