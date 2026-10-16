import { stepsFor } from './draft-store';
import { emptyDraft } from './logic';

describe('onboarding steps', () => {
  it('with an account the last step offers to connect Claude or ChatGPT', () => {
    expect(stepsFor(emptyDraft, true).slice(-2)).toEqual(['consent', 'ai']);
  });

  it('without an account there is nothing to connect', () => {
    expect(stepsFor(emptyDraft, false)).not.toContain('ai');
    expect(stepsFor(emptyDraft, false).at(-1)).toBe('consent');
  });
});
