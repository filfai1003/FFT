import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { getMode } from '@/lib/mode';
import { loadPlan, resetPlan, savePlan } from '@/lib/plan';
import { downloadToDevice, fetchPremium, uploadToServer } from './transfer';

export type PlanPhase =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'moving'; direction: 'up' | 'down' }
  | { kind: 'paywall' }
  | { kind: 'error'; direction: 'up' | 'down' };

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Before the app shows any data: asks the server whether the account is premium and, when the
 * answer changed, moves the data (phone -> server when premium starts, server -> phone when it
 * ends). On the web, accounts that are not premium only get the premium page.
 */
export function usePlanGate() {
  const queryClient = useQueryClient();
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.userId);
  const cloud = status === 'signedIn' && getMode() === 'cloud' && userId != null;
  const [phase, setPhase] = useState<PlanPhase & { for?: string | null }>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!cloud || !userId) {
      resetPlan();
      return;
    }
    let live = true;
    const set = (p: PlanPhase) => live && setPhase({ ...p, for: userId });
    void (async () => {
      const saved = await loadPlan(userId);
      set({ kind: 'checking' });
      const fetched = await withTimeout(fetchPremium(), 8000, null);
      if (fetched != null) await savePlan(userId, { premium: fetched });
      const premium = fetched ?? saved.premium ?? false;

      if (Platform.OS === 'web') {
        if (!premium) return set({ kind: 'paywall' });
        await savePlan(userId, { home: 'online' });
        return set({ kind: 'ready' });
      }

      const direction =
        fetched === true && saved.home === 'device'
          ? 'up'
          : fetched === false && saved.home === 'online'
            ? 'down'
            : null;
      if (!direction) return set({ kind: 'ready' });
      set({ kind: 'moving', direction });
      try {
        if (direction === 'up') await uploadToServer(userId);
        else await downloadToDevice(userId);
        await savePlan(userId, { home: direction === 'up' ? 'online' : 'device' });
        queryClient.clear();
        set({ kind: 'ready' });
      } catch {
        set({ kind: 'error', direction });
      }
    })();
    return () => {
      live = false;
    };
  }, [cloud, userId, attempt, queryClient]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  /** Premium started but the upload failed: keep working on the phone, try again next time. */
  const later = useCallback(() => setPhase({ kind: 'ready', for: userId }), [userId]);

  // Not signed in to an account (sign-in screens, account-less mode): nothing to decide.
  if (!cloud) return { phase: { kind: 'ready' } as PlanPhase, retry, later };
  // A phase computed for another account is stale until the effect runs again.
  if (phase.for !== userId) return { phase: { kind: 'checking' } as PlanPhase, retry, later };
  return { phase: phase as PlanPhase, retry, later };
}
