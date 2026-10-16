import { create } from 'zustand';
import { getMode } from '@/lib/mode';
import { emptyDraft, type OnboardingDraft } from './logic';

export type StepId = 'goal' | 'body' | 'lifestyle' | 'target' | 'mode' | 'meals' | 'consent' | 'ai';

/**
 * Steps in order; "meals" only exists for the fixed-meals mode, "ai" (connect Claude or ChatGPT,
 * optional) only with an account: the account-less mode has nothing to connect.
 */
export function stepsFor(draft: OnboardingDraft, withAccount = getMode() === 'cloud'): StepId[] {
  const steps: StepId[] = ['goal', 'body', 'lifestyle', 'target', 'mode'];
  if (draft.dietMode === 'fixed_meals') steps.push('meals');
  steps.push('consent');
  if (withAccount) steps.push('ai');
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
