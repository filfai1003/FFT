import { useConversations } from '@/features/ai/agent/conversations';
import { useSessionStore as useWorkout } from '@/features/session/store';
import { LOCAL_USER_ID, moveLocalData } from '@/lib/local-db';
import { getAuthClient } from '@/lib/supabase';
import type { Credentials } from './api';
import { leaveOfflineMode } from './session-store';

export type LinkResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; error: 'taken' | 'failed'; message?: string };

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
 * Turns the account-less mode into an account: creates the email + password login, moves every
 * workout, meal, weight and photo of this device to it, then signs in (or, when the email must
 * be confirmed first, opens the sign-in screen: the data is already waiting for that account).
 */
export async function linkAccount(
  { email, password }: Credentials,
  queryClient: { clear: () => void },
): Promise<LinkResult> {
  const { data, error } = await getAuthClient().auth.signUp({ email: email.trim(), password });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return { ok: false, error: taken ? 'taken' : 'failed', message: error.message };
  }
  const user = data.user;
  // An address that already has an account comes back as a user without identities.
  if (!user || (user.identities && user.identities.length === 0))
    return { ok: false, error: 'taken' };

  await moveLocalData(LOCAL_USER_ID, user.id);
  moveDeviceStores(user.id);
  await leaveOfflineMode(queryClient);
  return { ok: true, needsConfirmation: data.session == null };
}
