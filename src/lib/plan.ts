import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DATA_CATEGORIES, normalizeCategories, type DataCategory } from '@/domain/data-categories';

/**
 * The account's plan and where its data lives (DECISIONS 42, 47, 62).
 * - free: every feature; with the copy on the server: sync (web app, every device), API and MCP
 * - supporter: + the community filters (friends, country, age and weight class)
 * - premium: + the AI coach included in the app, paid from a monthly AI credit
 * Every account keeps all its data on the device. The copy on the server is the user's choice
 * (`sync`); with it features/premium/sync.ts keeps the server up to date in the background. The
 * account-less mode stays on the phone. Plans are set by the admin panel for now; the server
 * decides (`my_plan()`, `my_sync()`).
 */
export type DataHome = 'device' | 'online';

// 'supporter' is back (DECISIONS 117): it unlocks the community filters, nothing else.
export type Plan = 'free' | 'supporter' | 'premium';
export const isPlan = (v: unknown): v is Plan =>
  v === 'free' || v === 'supporter' || v === 'premium';

/**
 * Keep a copy on the server (DECISIONS 62): 'on', 'off', or 'undecided' (a new account that has
 * not chosen yet: the app asks). Nothing is sent to the server unless it is 'on'.
 */
export type SyncChoice = 'on' | 'off' | 'undecided';
export const isSyncChoice = (v: unknown): v is SyncChoice =>
  v === 'on' || v === 'off' || v === 'undecided';

/** Monthly prices (shown on the plans page; payments come later). */
type PlanState = {
  /** The account these values belong to. */
  userId: string | null;
  /** Last answer of the server; null = never asked on this device. */
  plan: Plan | null;
  /** The copy on the server, as the server last said; null = never asked on this device. */
  sync: SyncChoice | null;
  /** Where this device last left the data: 'online' = the sync runs for it. */
  home: DataHome;
  /**
   * The categories kept on the server (DECISIONS 63), as the server last said; null = never
   * asked on this device (everything, as before categories existed).
   */
  categories: DataCategory[] | null;
  /** The copy on the server is end-to-end encrypted (DECISIONS 64), as this device last knew. */
  encrypted: boolean;
};

export const usePlanStore = create<PlanState>(() => ({
  userId: null,
  plan: null,
  sync: null,
  home: 'device',
  categories: null,
  encrypted: false,
}));

const key = (userId: string) => `fft.plan.${userId}`;
/** Where this device keeps an account's plan (removed when the account is deleted). */
export const planKeyOf = key;

/** Reads what this device knows about the account (instant, works offline). */
export async function loadPlan(userId: string): Promise<PlanState> {
  let saved: Partial<PlanState> & { premium?: unknown } = {};
  try {
    saved = JSON.parse((await AsyncStorage.getItem(key(userId))) ?? '{}') as typeof saved;
  } catch {
    saved = {};
  }
  // Saved before DECISIONS 62: "premium" meant the data was kept online (every account synced).
  const premium = typeof saved.premium === 'boolean' ? saved.premium : null;
  const state: PlanState = {
    userId,
    // Saved before plans existed: "premium" meant the data was online.
    plan: isPlan(saved.plan)
      ? saved.plan
      : saved.plan != null
        ? null
        : premium
          ? 'premium'
          : premium === false
            ? 'free'
            : null,
    sync: isSyncChoice(saved.sync) ? saved.sync : premium === true ? 'on' : null,
    home: saved.home === 'online' ? 'online' : 'device',
    categories: Array.isArray(saved.categories) ? normalizeCategories(saved.categories) : null,
    encrypted: saved.encrypted === true,
  };
  usePlanStore.setState(state);
  return state;
}

/**
 * An account's plan as this device knows it, without touching the store (the widget task, which
 * may run with the app closed: DECISIONS 118).
 */
export async function planOf(userId: string): Promise<Plan | null> {
  const s = usePlanStore.getState();
  if (s.userId === userId) return s.plan;
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(key(userId))) ?? '{}') as {
      plan?: unknown;
    };
    return isPlan(saved.plan) ? saved.plan : null;
  } catch {
    return null;
  }
}

export async function savePlan(userId: string, patch: Partial<Omit<PlanState, 'userId'>>) {
  const next = { ...usePlanStore.getState(), ...patch, userId };
  usePlanStore.setState(next);
  try {
    await AsyncStorage.setItem(
      key(userId),
      JSON.stringify({
        plan: next.plan,
        sync: next.sync,
        home: next.home,
        categories: next.categories,
        encrypted: next.encrypted,
      }),
    );
  } catch {
    // Still applies for this run.
  }
}

export function resetPlan() {
  usePlanStore.setState({
    userId: null,
    plan: null,
    sync: null,
    home: 'device',
    categories: null,
    encrypted: false,
  });
}

/** Whether this account's copy on the server is end-to-end encrypted (as this device knows). */
export function copyEncrypted(userId: string): boolean {
  const s = usePlanStore.getState();
  return s.userId === userId && s.encrypted;
}

/** The current account's copy on the server is end-to-end encrypted. */
export const useCopyEncrypted = () => usePlanStore((s) => s.userId != null && s.encrypted);

/** The categories an account keeps on the server (all of them when not known yet). */
export function sharedCategories(userId: string): DataCategory[] {
  const s = usePlanStore.getState();
  return s.userId === userId && s.categories ? s.categories : [...DATA_CATEGORIES];
}

const ALL = [...DATA_CATEGORIES];
/** The current account's categories kept on the server (all when not known yet). */
export const useSharedCategories = () => usePlanStore((s) => s.categories ?? ALL);

/** The current account's copy on the server: 'on', 'off', 'undecided' or null (not known yet). */
export const useSyncChoice = () => usePlanStore((s) => (s.userId == null ? null : s.sync));
