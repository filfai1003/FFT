import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { getMode } from '@/lib/mode';
import type { DataCategory } from '@/domain/data-categories';
import { getLocalDb } from '@/lib/local-db';
import { loadPlan, resetPlan, savePlan, usePlanStore, type SyncChoice } from '@/lib/plan';
import {
  applyCategoryChange,
  detachSync,
  fetchPlan,
  fetchSyncState,
  finishServerCleanup,
  startSync,
  switchCopyMode,
} from './sync';
import { forgetVaultKey, vaultKey } from './vault-key';

export type PlanPhase =
  | { kind: 'checking' }
  | { kind: 'ready' }
  /** A new account that has not said yet whether to keep a copy on the server. */
  | { kind: 'choose' }
  /** The web app without a copy on the server: it has no data to show. */
  | { kind: 'webOff' }
  /** The copy is end-to-end encrypted and this device does not have the key yet. */
  | { kind: 'unlock' };

/** Accounts whose passphrase the user chose to enter later (this run only; phones only). */
const unlockLater = new Set<string>();
export const askUnlockLater = (userId: string) => unlockLater.add(userId);

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Before the app shows any data: asks the server for the account's plan and whether it keeps a
 * copy on the server (DECISIONS 62), and starts or ends the sync on this device when that
 * changed (turned on or off here, on another phone or on the web). A new account first chooses;
 * the web app, which has no data of its own, needs the copy on the server.
 */
export function usePlanGate() {
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
      const asking = Promise.all([fetchPlan(), fetchSyncState()]).then(([plan, state]) =>
        state == null
          ? null
          : {
              plan,
              sync: state.sync,
              categories: state.categories,
              encrypted: state.encrypted,
            },
      );
      const keep = async (answer: {
        plan: Awaited<ReturnType<typeof fetchPlan>>;
        sync: SyncChoice;
        categories: DataCategory[];
        encrypted: boolean;
      }) => {
        // Categories changed on another device (DECISIONS 63): what is no longer kept on the
        // server is not sent from here either; what is kept again goes up in full.
        const before = usePlanStore.getState().categories ?? answer.categories;
        const wasEncrypted = usePlanStore.getState().encrypted;
        await savePlan(userId, {
          ...(answer.plan ? { plan: answer.plan } : {}),
          sync: answer.sync,
          categories: answer.categories,
        });
        const db = getLocalDb(userId);
        await db.ready;
        applyCategoryChange(db, before, answer.categories);
        // Encryption turned on or off on another device (DECISIONS 64): everything here goes up
        // again in the new form (what the server refused meanwhile is not lost).
        if (answer.sync === 'on' && answer.encrypted !== wasEncrypted) {
          await switchCopyMode(userId, answer.encrypted);
          if (!answer.encrypted) await forgetVaultKey(userId);
          return true;
        }
        return false;
      };
      let fetched: SyncChoice | null = null;
      if (saved.sync == null || saved.plan == null) {
        const answer = await withTimeout(asking, 8000, null);
        if (answer) {
          fetched = answer.sync;
          await keep(answer);
        }
      } else {
        void asking.then(async (answer) => {
          if (answer == null || !live) return;
          const switched = await keep(answer);
          if (answer.sync !== saved.sync || switched) setAttempt((n) => n + 1);
        });
      }
      // null: never known here and the server could not be reached: nothing is synced meanwhile.
      const sync = fetched ?? saved.sync;

      if (sync === 'on') {
        // The device keeps working on its own database; the sync runs in the background
        // (use-sync.ts). The first time, everything on the device is queued to go up.
        if (saved.home === 'device') {
          await startSync(userId);
          await savePlan(userId, { home: 'online' });
        }
        // An encrypted copy and no key here yet: the passphrase is asked (on a phone it can wait;
        // the sync waits with it). The web app has nothing to show without it.
        if (
          usePlanStore.getState().encrypted &&
          !(await vaultKey(userId)) &&
          (Platform.OS === 'web' || !unlockLater.has(userId))
        )
          return set({ kind: 'unlock' });
        return set({ kind: 'ready' });
      }
      if (sync === 'off') {
        // Turned off elsewhere: the server copy is already gone; this device keeps everything.
        if (saved.home === 'online') {
          await detachSync(userId);
          await savePlan(userId, { home: 'device' });
        }
        // Files an earlier "turn off" on this device could not remove yet.
        void finishServerCleanup(userId);
      }
      if (sync === 'undecided') return set({ kind: 'choose' });
      if (Platform.OS === 'web') return set({ kind: 'webOff' });
      set({ kind: 'ready' });
    })();
    return () => {
      live = false;
    };
  }, [cloud, userId, attempt]);

  /** Runs the checks again (after a choice was saved, or to retry). */
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Not signed in to an account (sign-in screens, account-less mode): nothing to decide.
  if (!cloud) return { phase: { kind: 'ready' } as PlanPhase, retry };
  // A phase computed for another account is stale until the effect runs again.
  if (phase.for !== userId) return { phase: { kind: 'checking' } as PlanPhase, retry };
  return { phase: phase as PlanPhase, retry };
}
