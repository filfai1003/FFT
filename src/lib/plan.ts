import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * The account's plan and where its data lives (DECISIONS 42).
 * - free: everything on the device (the server holds only the email and password)
 * - supporter: + the data synced online, so the web app and every device see the same data
 * - premium: + the AI coach included in the app, paid from a monthly AI credit
 * The app always works on the device; features/premium/sync.ts keeps the server up to date in the
 * background. Plans are set by the admin panel for now; the server decides (`my_plan()`), and only
 * supporter and premium accounts can write data online (row level security).
 */
export type DataHome = 'device' | 'online';

export type Plan = 'free' | 'supporter' | 'premium';
export const isPlan = (v: unknown): v is Plan =>
  v === 'free' || v === 'supporter' || v === 'premium';

/** Monthly prices (shown on the plans page; payments come later). */
export const PLAN_PRICES_EUR: Record<Exclude<Plan, 'free'>, number> = { supporter: 2, premium: 20 };

type PlanState = {
  /** The account these values belong to. */
  userId: string | null;
  /** Last answer of the server; null = never asked on this device. */
  plan: Plan | null;
  /** The plan keeps data online (supporter or premium); null = never asked. */
  premium: boolean | null;
  home: DataHome;
};

export const usePlanStore = create<PlanState>(() => ({
  userId: null,
  plan: null,
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
  const premium = typeof saved.premium === 'boolean' ? saved.premium : null;
  const state: PlanState = {
    userId,
    // Saved before plans existed: "premium" meant the data was online.
    plan: isPlan(saved.plan) ? saved.plan : premium ? 'premium' : premium === false ? 'free' : null,
    premium,
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
      JSON.stringify({ plan: next.plan, premium: next.premium, home: next.home }),
    );
  } catch {
    // Still applies for this run.
  }
}

export function resetPlan() {
  usePlanStore.setState({ userId: null, plan: null, premium: null, home: 'device' });
}

export const isPremium = (): boolean => usePlanStore.getState().premium === true;
