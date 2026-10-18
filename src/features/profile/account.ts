import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateWidgets } from '@/features/widgets/update';
import { enterOfflineMode, useSessionStore as useAuth } from '@/features/auth/session-store';
import { signOut } from '@/features/auth/api';
import { moveDeviceStores } from '@/features/auth/link-account';
import { haltSync, pull, resumeSync } from '@/features/premium/sync';
import { copyLocalData, LOCAL_USER_ID, wipeLocalData, type CopyResult } from '@/lib/local-db';
import { resetPlan } from '@/lib/plan';
import { forgetAccountOnDevice } from './forget-device';
import { useSessionStore as useWorkout } from '@/features/session/store';
import { syncPendingSessions } from '@/features/session/sync';
import { getMode } from '@/lib/mode';
import { getAuthClient, getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import { POLICY_VERSION } from '@/features/onboarding/logic';

/** `ai_coach`: sending messages and the data the user allows to the AI coach (DECISIONS 66). */
export type ConsentType = 'health_data' | 'analytics' | 'ai_coach';
export type Consent = {
  id: string;
  type: ConsentType;
  grantedAt: string;
  withdrawnAt: string | null;
};

export const consentKeys = { all: ['consents'] as const };

export function useConsents() {
  const userId = useAuth((s) => s.userId);
  return useQuery({
    queryKey: consentKeys.all,
    enabled: userId != null,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('consents')
        .select('id, type, granted_at, withdrawn_at')
        .order('granted_at', { ascending: false });
      if (error) throw error;
      return data.map<Consent>((c) => ({
        id: c.id,
        type: c.type as ConsentType,
        grantedAt: c.granted_at,
        withdrawnAt: c.withdrawn_at,
      }));
    },
  });
}

/** The consent of a type that is in force (granted and not withdrawn), newest first. */
export function activeConsent(
  consents: readonly Consent[] | undefined,
  type: ConsentType,
): Consent | null {
  return consents?.find((c) => c.type === type && c.withdrawnAt == null) ?? null;
}

export function useSetConsent() {
  const userId = useAuth((s) => s.userId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, granted }: { type: ConsentType; granted: boolean }) => {
      const supabase = getSupabase();
      if (granted) {
        const { error } = await supabase
          .from('consents')
          .insert({ id: newId(), user_id: userId!, type, policy_version: POLICY_VERSION });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('consents')
          .update({ withdrawn_at: new Date().toISOString() })
          .eq('type', type)
          .is('withdrawn_at', null);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consentKeys.all }),
  });
}

/** Local data of this device that belongs to the signed-in user (workout in progress, queue). */
export function clearLocalUserData(queryClient: { clear: () => void }) {
  const w = useWorkout.getState();
  w.discard();
  for (const id of Object.keys(w.finished)) w.forget(id);
  queryClient.clear();
  // The home screen widgets must not keep showing the account that left.
  void updateWidgets(null);
}

/**
 * Logs out. A workout that is finished but not uploaded yet is uploaded first; if that is not
 * possible (offline) the caller is told, so the user can decide.
 */
export async function logOut(queryClient: {
  clear: () => void;
}): Promise<{ ok: true } | { ok: false; reason: 'unsynced' }> {
  await syncPendingSessions();
  const pending = Object.values(useWorkout.getState().finished).some((f) => !f.synced);
  if (pending) return { ok: false, reason: 'unsynced' };
  await signOut();
  clearLocalUserData(queryClient);
  return { ok: true };
}

export async function logOutAnyway(queryClient: { clear: () => void }) {
  await signOut();
  clearLocalUserData(queryClient);
}

/**
 * Deletes the account (Edge Function with the service role: the email and password kept online)
 * and every piece of data on this device.
 */
export async function deleteAccount(queryClient: { clear: () => void }): Promise<string | null> {
  if (getMode() === 'cloud') {
    const online = await getAuthClient().functions.invoke('delete-account');
    if (online.error) return online.error.message;
  }
  // The server copy (premium) went with the account; now the device copy.
  const { error } = await getSupabase().functions.invoke('delete-account');
  if (error) return error.message;
  const userId = useAuth.getState().userId;
  // Every per-account key, the AI key, conversations and export files too (DECISIONS 82).
  if (userId) await forgetAccountOnDevice(userId);
  await signOut().catch(() => undefined);
  clearLocalUserData(queryClient);
  return null;
}

export type KeepDataResult =
  | { ok: true; missingFiles: number }
  /** `not-empty`: this phone already has account-less data (nothing was deleted). */
  | { ok: false; reason: 'not-empty' | 'failed'; message?: string };

/**
 * Deletes the online account but keeps its data on this phone: the app goes on in the
 * account-less mode with everything the account had here (DECISIONS 61). In this order, so that
 * nothing is lost when a step fails:
 * 1. finished workouts are written to the account's database and the newest rows and photos of
 *    other devices are fetched (best effort);
 * 2. the account's sync stops: nothing in its outbox is sent any more;
 * 3. the data is copied into the account-less database (if that fails, nothing is deleted);
 * 4. the server account is deleted (if that fails, the copy is removed and the sync goes on);
 * 5. the account's own database on this phone is erased, conversations and finished workouts
 *    move to the account-less user, the plan is forgotten and the account-less mode starts.
 */
export async function deleteAccountKeepData(queryClient: {
  clear: () => void;
}): Promise<KeepDataResult> {
  const userId = useAuth.getState().userId;
  if (getMode() !== 'cloud' || !userId || userId === LOCAL_USER_ID)
    return { ok: false, reason: 'failed' };

  await syncPendingSessions();
  await pull(userId).catch(() => undefined);
  haltSync(userId);

  let copied: CopyResult;
  try {
    copied = await copyLocalData(userId, LOCAL_USER_ID);
  } catch (e) {
    resumeSync(userId);
    return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
  if (!copied.ok) {
    resumeSync(userId);
    return { ok: false, reason: 'not-empty' };
  }

  const online = await getAuthClient()
    .functions.invoke('delete-account')
    .catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }));
  if (online.error) {
    // The account stays: the copy goes (the account-less database was empty before).
    await wipeLocalData(LOCAL_USER_ID);
    resumeSync(userId);
    return { ok: false, reason: 'failed', message: online.error.message };
  }

  await wipeLocalData(userId);
  moveDeviceStores(userId, LOCAL_USER_ID);
  // The account's own keys (sync, relay, encryption key…) go; the AI settings stay with the phone.
  await forgetAccountOnDevice(userId, { keepAiSettings: true });
  resetPlan();
  // Account-less first: the sign-out that follows is then not taken for "back to sign in".
  await enterOfflineMode(queryClient);
  await getAuthClient()
    .auth.signOut()
    .catch(() => undefined);
  return { ok: true, missingFiles: copied.missingFiles };
}
