import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Where the signed-in account's data lives. Free accounts: on the device (the server holds only
 * the email and password). Premium accounts: on the server, so the web app and every phone see the
 * same data. Moving between the two is done by features/premium/transfer.ts when the plan changes.
 *
 * Premium today = VIP, made by the admin panel (paid plans later); the server decides it
 * (`is_premium()`), and only premium accounts can write data online (row level security).
 */
export type DataHome = 'device' | 'online';

type PlanState = {
  /** The account these values belong to. */
  userId: string | null;
  /** Last answer of the server; null = never asked on this device. */
  premium: boolean | null;
  home: DataHome;
};

export const usePlanStore = create<PlanState>(() => ({
  userId: null,
  premium: null,
  home: 'device',
}));

const key = (userId: string) => `fft.plan.${userId}`;

/** Reads what this device knows about the account (instant, works offline). */
export async function loadPlan(userId: string): Promise<PlanState> {
  let saved: Partial<PlanState> = {};
  try {
    saved = JSON.parse((await AsyncStorage.getItem(key(userId))) ?? '{}') as Partial<PlanState>;
  } catch {
    saved = {};
  }
  const state: PlanState = {
    userId,
    premium: typeof saved.premium === 'boolean' ? saved.premium : null,
    home: saved.home === 'online' ? 'online' : 'device',
  };
  usePlanStore.setState(state);
  return state;
}

export async function savePlan(userId: string, patch: Partial<Omit<PlanState, 'userId'>>) {
  const next = { ...usePlanStore.getState(), ...patch, userId };
  usePlanStore.setState(next);
  try {
    await AsyncStorage.setItem(
      key(userId),
      JSON.stringify({ premium: next.premium, home: next.home }),
    );
  } catch {
    // Still applies for this run.
  }
}

export function resetPlan() {
  usePlanStore.setState({ userId: null, premium: null, home: 'device' });
}

export const isPremium = (): boolean => usePlanStore.getState().premium === true;

/** True when this account's data is read and written on the server. */
export const dataHomeIsOnline = (userId: string | null): boolean => {
  const s = usePlanStore.getState();
  return userId != null && s.userId === userId && s.home === 'online';
};
