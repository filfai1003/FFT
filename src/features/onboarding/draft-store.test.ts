import { canContinue, stepsFor, useOnboardingStore } from './draft-store';
import { emptyDraft } from './logic';

const today = new Date(2026, 9, 8);

describe('onboarding steps', () => {
  it('with an account the last step offers to connect Claude or ChatGPT', () => {
    expect(stepsFor(emptyDraft, true).slice(-2)).toEqual(['consent', 'ai']);
  });

  it('without an account there is nothing to connect', () => {
    expect(stepsFor(emptyDraft, false)).not.toContain('ai');
    expect(stepsFor(emptyDraft, false).at(-1)).toBe('consent');
  });

  it('"About you" comes first; after "Skip setup" only the consent is left', () => {
    expect(stepsFor(emptyDraft, true)[0]).toBe('body');
    expect(stepsFor(emptyDraft, true, true)).toEqual(['body', 'consent']);
  });
});

describe('skipping (DECISIONS 103)', () => {
  beforeEach(() => useOnboardingStore.getState().reset());

  it('"About you" needs only the name and the 18+ confirmation', () => {
    const d = { ...emptyDraft, name: 'Alex' };
    expect(canContinue('body', d, today)).toBe(false);
    expect(canContinue('body', { ...d, adultConfirmed: true }, today)).toBe(true);
    // Routine choices are all optional.
    expect(canContinue('lifestyle', emptyDraft, today)).toBe(true);
  });

  it('the health data consent cannot be skipped', () => {
    expect(canContinue('consent', emptyDraft, today)).toBe(false);
    expect(canContinue('consent', { ...emptyDraft, consentHealth: true }, today)).toBe(true);
  });

  it('"Skip" clears the choices of a step and moves on', () => {
    const s = useOnboardingStore.getState();
    s.patch({ name: 'Alex', adultConfirmed: true, goal: 'lose_fat' });
    s.next(); // goal
    useOnboardingStore.getState().skipStep('goal');
    const after = useOnboardingStore.getState();
    expect(after.draft.goal).toBeNull();
    expect(after.step).toBe(2);
    expect(after.draft.name).toBe('Alex');
  });

  it('skipping the diet mode drops the meals step and its meals', () => {
    const s = useOnboardingStore.getState();
    s.patch({ dietMode: 'fixed_meals', meals: [] });
    s.skipStep('mode');
    const d = useOnboardingStore.getState().draft;
    expect(d.dietMode).toBeNull();
    expect(d.meals).toBeNull();
    expect(stepsFor(d, false)).not.toContain('meals');
  });

  it('"Skip setup" goes to the consent; Back returns to the full flow', () => {
    const s = useOnboardingStore.getState();
    s.patch({ name: 'Alex', adultConfirmed: true });
    s.skipSetup();
    let now = useOnboardingStore.getState();
    expect(now.skipped).toBe(true);
    expect(stepsFor(now.draft, true, now.skipped)[now.step]).toBe('consent');
    now.back();
    now = useOnboardingStore.getState();
    expect(now.skipped).toBe(false);
    expect(now.step).toBe(0);
  });
});
