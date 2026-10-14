import { aiReady, effectiveAiSettings, euros } from './included';
import { defaultAiSettings } from './settings-store';

const own = { ...defaultAiSettings, apiKey: 'sk-test', model: 'some-model' };

describe('the AI included with Premium', () => {
  it('Premium without a key of its own uses it; an own key wins unless the included one was chosen', () => {
    expect(effectiveAiSettings(defaultAiSettings, 'premium').provider).toBe('included');
    expect(effectiveAiSettings(own, 'premium').provider).toBe('anthropic');
    expect(effectiveAiSettings({ ...own, provider: 'included' }, 'premium').provider).toBe(
      'included',
    );
    expect(effectiveAiSettings(defaultAiSettings, 'supporter').provider).toBe('anthropic');
  });

  it('is ready only for Premium; other plans need a key and a model', () => {
    expect(aiReady(defaultAiSettings, 'premium')).toBe(true);
    expect(aiReady(defaultAiSettings, 'supporter')).toBe(false);
    expect(aiReady({ ...defaultAiSettings, provider: 'included' }, 'free')).toBe(false);
    expect(aiReady(own, 'free')).toBe(true);
  });

  it('shows the credit in euros with cents, never below zero', () => {
    expect(euros(10_000_000)).toBe('10.00');
    expect(euros(8_421_000)).toBe('8.42');
    expect(euros(-5000)).toBe('0.00');
  });
});
