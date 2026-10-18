import { create } from 'zustand';
import { getMode } from '@/lib/mode';
import { bodyProblems, emptyDraft, type OnboardingDraft } from './logic';

export type StepId = 'body' | 'goal' | 'lifestyle' | 'target' | 'mode' | 'meals' | 'consent' | 'ai';

/**
 * Steps in order. "About you" comes first: it holds the only required inputs (name, "I am 18 or
 * older"), so "Skip setup" can be offered from there on (DECISIONS 103). "meals" only exists for
 * the fixed-meals mode, "ai" (connect Claude or ChatGPT, optional) only with an account: the
 * account-less mode has nothing to connect. After "Skip setup" only the health data consent is
 * left (it is required by law, so it cannot be skipped).
 */
export function stepsFor(
  draft: OnboardingDraft,
  withAccount = getMode() === 'cloud',
  skipped = false,
): StepId[] {
  if (skipped) return ['body', 'consent'];
  const steps: StepId[] = ['body', 'goal', 'lifestyle', 'target', 'mode'];
  if (draft.dietMode === 'fixed_meals') steps.push('meals');
  steps.push('consent');
  if (withAccount) steps.push('ai');
  return steps;
}

/** What "Skip" leaves on a step: its choices back to "not set" (the defaults apply). */
export const skipDefaults: Partial<Record<StepId, Partial<OnboardingDraft>>> = {
  goal: { goal: null },
  lifestyle: { activity: null, experience: null, location: null },
  target: { targetKcal: null, macroSplit: null, meals: null },
  mode: { dietMode: null, meals: null, workoutAfterId: null },
  meals: { meals: null, workoutAfterId: null },
};

type State = {
  draft: OnboardingDraft;
  step: number;
  /** "Skip setup" was chosen: only the consent is left. */
  skipped: boolean;
  patch: (p: Partial<OnboardingDraft>) => void;
  next: () => void;
  back: () => void;
  /** "Skip" on one step: clears its choices and moves on. */
  skipStep: (id: StepId) => void;
  /** "Skip setup": straight to the consent, then finish with what was entered so far. */
  skipSetup: () => void;
  reset: () => void;
};

const count = (s: { draft: OnboardingDraft; skipped: boolean }) =>
  stepsFor(s.draft, undefined, s.skipped).length;

export const useOnboardingStore = create<State>((set, get) => ({
  draft: emptyDraft,
  step: 0,
  skipped: false,
  patch: (p) => set({ draft: { ...get().draft, ...p } }),
  next: () => set({ step: Math.min(get().step + 1, count(get()) - 1) }),
  back: () => {
    const { step, skipped } = get();
    // Back from the consent after "Skip setup": the full list of steps again.
    if (skipped) set({ skipped: false, step: 0 });
    else set({ step: Math.max(step - 1, 0) });
  },
  skipStep: (id) => {
    const draft = { ...get().draft, ...skipDefaults[id] };
    set({ draft, step: Math.min(get().step + 1, count({ draft, skipped: false }) - 1) });
  },
  skipSetup: () =>
    set({ skipped: true, step: stepsFor(get().draft, undefined, true).indexOf('consent') }),
  reset: () => set({ draft: emptyDraft, step: 0, skipped: false }),
}));

/**
 * Whether the main button works on a step. Only the name and the 18+ confirmation are required;
 * the other steps can be skipped ("Skip") and every routine choice is optional (DECISIONS 103).
 */
export function canContinue(step: StepId, d: OnboardingDraft, today: Date): boolean {
  switch (step) {
    case 'goal':
      return d.goal != null;
    case 'body':
      return bodyProblems(d, today).length === 0;
    case 'mode':
      return d.dietMode != null;
    case 'meals':
      return d.meals == null || d.meals.every((m) => m.name.trim() !== '');
    case 'consent':
      return d.consentHealth;
    default:
      return true;
  }
}
