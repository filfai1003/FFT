import { create } from 'zustand';
import { emptyDraft, type OnboardingDraft } from './logic';

export type StepId = 'goal' | 'body' | 'lifestyle' | 'target' | 'mode' | 'meals' | 'consent';

/** Steps in order; "meals" only exists for the fixed-meals mode. */
export function stepsFor(draft: OnboardingDraft): StepId[] {
  const steps: StepId[] = ['goal', 'body', 'lifestyle', 'target', 'mode'];
  if (draft.dietMode === 'fixed_meals') steps.push('meals');
  steps.push('consent');
  return steps;
}

type State = {
  draft: OnboardingDraft;
  step: number;
  patch: (p: Partial<OnboardingDraft>) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
};

export const useOnboardingStore = create<State>((set, get) => ({
  draft: emptyDraft,
  step: 0,
  patch: (p) => set({ draft: { ...get().draft, ...p } }),
  next: () => set({ step: Math.min(get().step + 1, stepsFor(get().draft).length - 1) }),
  back: () => set({ step: Math.max(get().step - 1, 0) }),
  reset: () => set({ draft: emptyDraft, step: 0 }),
}));
