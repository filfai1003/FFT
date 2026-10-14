import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { getMode } from '@/lib/mode';
import { loadPlan, resetPlan, savePlan } from '@/lib/plan';
import { fetchPremium, startSync, stopSync } from './sync';

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
      // Known on this device: start at once (offline too) and ask the server in the background;
      // a different answer runs this again. Never asked yet: wait for the server (8 s at most).
      const asking = fetchPremium();
      let fetched: boolean | null = null;
      if (saved.premium == null) {
        fetched = await withTimeout(asking, 8000, null);
        if (fetched != null) await savePlan(userId, { premium: fetched });
      } else {
        void asking.then(async (answer) => {
          if (answer == null || !live) return;
          await savePlan(userId, { premium: answer });
          if (answer !== saved.premium) setAttempt((n) => n + 1);
        });
      }
      const premium = fetched ?? saved.premium ?? false;
      // Only a "no" from the server ends premium (now or on an earlier start), never a timeout.
      const confirmedFree = fetched === false || (fetched == null && saved.premium === false);

      if (premium) {
        // Premium: the device keeps working on its own database; the sync runs in the
        // background (use-sync.ts). The first time, everything on the device is queued to go up.
        if (saved.home === 'device') {
          await startSync(userId);
          await savePlan(userId, { home: 'online' });
        }
        return set({ kind: 'ready' });
      }
      // On the web the app is for premium accounts only.
      if (Platform.OS === 'web') return set({ kind: 'paywall' });
      // Premium ended (the server said so): keep everything here, clear the server.
      if (confirmedFree && saved.home === 'online') {
        set({ kind: 'moving', direction: 'down' });
        try {
          await stopSync(userId);
          await savePlan(userId, { home: 'device' });
          queryClient.clear();
          set({ kind: 'ready' });
        } catch {
          set({ kind: 'error', direction: 'down' });
        }
        return;
      }
      set({ kind: 'ready' });
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
