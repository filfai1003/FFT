import { aiReady, creditPercent, effectiveAiSettings } from './included';
import { defaultAiSettings } from './settings-store';

const own = { ...defaultAiSettings, apiKey: 'sk-test', model: 'some-model' };

describe('the AI included with Premium', () => {
  it('Premium without a key of its own uses it; an own key wins unless the included one was chosen', () => {
    expect(effectiveAiSettings(defaultAiSettings, 'premium').provider).toBe('included');
    expect(effectiveAiSettings(own, 'premium').provider).toBe('anthropic');
    expect(effectiveAiSettings({ ...own, provider: 'included' }, 'premium').provider).toBe(
      'included',
    );
    expect(effectiveAiSettings(defaultAiSettings, 'free').provider).toBe('anthropic');
  });

  it('is ready only for Premium; other plans need a key and a model', () => {
    expect(aiReady(defaultAiSettings, 'premium')).toBe(true);
    expect(aiReady(defaultAiSettings, 'free')).toBe(false);
    expect(aiReady({ ...defaultAiSettings, provider: 'included' }, 'free')).toBe(false);
    expect(aiReady(own, 'free')).toBe(true);
  });

  it('shows the credit as a % of the monthly allowance, never below zero', () => {
    expect(creditPercent(10_000_000, 10_000_000)).toBe(100);
    expect(creditPercent(8_421_000, 10_000_000)).toBe(84);
    expect(creditPercent(15_000_000, 10_000_000)).toBe(150);
    expect(creditPercent(-5000, 10_000_000)).toBe(0);
    expect(creditPercent(5, 0)).toBe(0);
  });
});
