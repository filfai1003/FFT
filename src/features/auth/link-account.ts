import { useConversations } from '@/features/ai/agent/conversations';
import { useSessionStore as useWorkout } from '@/features/session/store';
import { LOCAL_USER_ID, moveLocalData } from '@/lib/local-db';
import { getAuthClient } from '@/lib/supabase';
import { signInWithGoogle } from './google';
import { leaveOfflineMode } from './session-store';

export type LinkResult = { ok: true } | { ok: false; cancelled?: boolean; message?: string };

/** Anything else on the device that belongs to the account-less user follows the data. */
function moveDeviceStores(to: string) {
  useConversations.setState((s) => ({
    conversations: Object.fromEntries(
      Object.entries(s.conversations).map(([id, c]) => [
        id,
        c.userId === LOCAL_USER_ID ? { ...c, userId: to } : c,
      ]),
    ),
  }));
  useWorkout.setState((s) => ({
    finished: Object.fromEntries(
      Object.entries(s.finished).map(([id, f]) => [
        id,
        f.userId === LOCAL_USER_ID ? { ...f, userId: to } : f,
      ]),
    ),
  }));
}

/**
 * Turns the account-less mode into an account: signs in with Google (a new account, or one this
 * Google account already has), moves every workout, meal, weight and photo of this device to it
 * (added to what the account already has here), then opens the account.
 */
export async function linkAccount(queryClient: { clear: () => void }): Promise<LinkResult> {
  const signedIn = await signInWithGoogle();
  if (!signedIn.ok) return signedIn;
  const { data } = await getAuthClient().auth.getSession();
  const user = data.session?.user;
  if (!user) return { ok: false };
  await moveLocalData(LOCAL_USER_ID, user.id);
  moveDeviceStores(user.id);
  await leaveOfflineMode(queryClient);
  return { ok: true };
}
