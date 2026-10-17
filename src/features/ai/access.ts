import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useSessionStore } from '@/features/auth/session-store';

/**
 * What the AI coach may look at (DECISIONS 66). Every category is off until the user turns it on;
 * the system prompt and every tool respect it. Messages and files the user sends are always sent
 * (that is the user's own act). Kept on this device, per account.
 */
export const AI_CATEGORIES = ['profile', 'diet', 'training', 'photos'] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];
export type AiAccess = Record<AiCategory, boolean>;

export const NO_ACCESS: AiAccess = { profile: false, diet: false, training: false, photos: false };
export const FULL_ACCESS: AiAccess = { profile: true, diet: true, training: true, photos: true };

/** The coach's tables (query_data) by category. Tables not listed here are never readable. */
export const TABLE_CATEGORY: Record<string, AiCategory> = {
  profiles: 'profile',
  user_settings: 'profile',
  body_metrics: 'profile',
  body_goals: 'profile',
  progress_photos: 'photos',
  nutrition_goals: 'diet',
  food_logs: 'diet',
  daily_nutrition_totals: 'diet',
  water_logs: 'diet',
  supplements: 'diet',
  supplement_logs: 'diet',
  fixed_meal_plans: 'diet',
  fixed_meals: 'diet',
  fixed_meal_checks: 'diet',
  foods: 'diet',
  food_servings: 'diet',
  exercises: 'training',
  workout_plans: 'training',
  plan_days: 'training',
  plan_exercises: 'training',
  workout_sessions: 'training',
  session_exercises: 'training',
  session_sets: 'training',
  exercise_records: 'training',
  exercise_e1rm_daily: 'training',
};

/** How the model is told about a category. */
const WHAT: Record<AiCategory, string> = {
  profile: 'profile and body data (age, sex, height, weight, measurements, goal)',
  diet: 'diet data (targets, foods eaten, meals, water, supplements)',
  training: 'training data (workouts, plans, strength)',
  photos: 'progress photos',
};

export const describeCategory = (c: AiCategory) => WHAT[c];

/** What a tool of a category the user has not shared returns to the model. */
export function notShared(category: AiCategory) {
  return {
    not_shared: category,
    message: `The user has not shared their ${WHAT[category]} with you. Do not guess it. If it matters, tell them they can allow it in the app's AI coach settings.`,
  };
}

/** The category of a "not shared" tool result, or null. */
export function notSharedCategory(content: string): AiCategory | null {
  try {
    const r = JSON.parse(content) as { not_shared?: unknown };
    return typeof r?.not_shared === 'string' &&
      (AI_CATEGORIES as readonly string[]).includes(r.not_shared)
      ? (r.not_shared as AiCategory)
      : null;
  } catch {
    return null;
  }
}

type State = {
  byUser: Record<string, AiAccess>;
  set: (userId: string, category: AiCategory, value: boolean) => void;
  setAll: (userId: string, access: AiAccess) => void;
};

export const useAiAccessStore = create<State>()(
  persist(
    (set) => ({
      byUser: {},
      set: (userId, category, value) =>
        set((s) => ({
          byUser: {
            ...s.byUser,
            [userId]: { ...(s.byUser[userId] ?? NO_ACCESS), [category]: value },
          },
        })),
      setAll: (userId, access) => set((s) => ({ byUser: { ...s.byUser, [userId]: access } })),
    }),
    {
      name: 'fft.ai-access.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ byUser: s.byUser }),
    },
  ),
);

export const accessOf = (byUser: Record<string, AiAccess>, userId: string | null): AiAccess =>
  (userId && byUser[userId]) || NO_ACCESS;

/** What the coach may see for the signed-in account (all off when nothing was chosen). */
export function useAiAccess(): AiAccess {
  const userId = useSessionStore((s) => s.userId);
  const byUser = useAiAccessStore((s) => s.byUser);
  return accessOf(byUser, userId);
}
