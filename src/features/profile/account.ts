import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateWidgets } from '@/features/widgets/update';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { signOut } from '@/features/auth/api';
import { useConversations } from '@/features/ai/agent/conversations';
import { useSessionStore as useWorkout } from '@/features/session/store';
import { syncPendingSessions } from '@/features/session/sync';
import { getMode } from '@/lib/mode';
import { getAuthClient, getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import { POLICY_VERSION } from '@/features/onboarding/logic';

export type ConsentType = 'health_data' | 'analytics';
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
  if (userId) useConversations.getState().clearUser(userId);
  await signOut().catch(() => undefined);
  clearLocalUserData(queryClient);
  return null;
}
