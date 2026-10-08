import { fontAssets } from './fonts';
import { resolveTextStyle } from './text-style';
import { fontFamily } from './tokens';

const base = { scale: 1, boldText: false, dotNumbers: true };

describe('resolveTextStyle', () => {
  it('titles and numbers use Doto', () => {
    expect(resolveTextStyle({ ...base, variant: 'displayL' }).fontFamily).toBe(fontFamily.display);
  });

  it('numbers fall back to Space Grotesk when dot-matrix is off, titles do not', () => {
    const off = { ...base, dotNumbers: false };
    expect(resolveTextStyle({ ...off, variant: 'displayL', numeric: true }).fontFamily).toBe(
      fontFamily.bodyMedium,
    );
    expect(resolveTextStyle({ ...off, variant: 'displayL' }).fontFamily).toBe(fontFamily.display);
  });

  it('labels are mono, uppercase and spaced', () => {
    const s = resolveTextStyle({ ...base, variant: 'label' });
    expect(s.fontFamily).toBe(fontFamily.label);
    expect(s.textTransform).toBe('uppercase');
    expect(s.letterSpacing).toBeCloseTo(11 * 0.12);
  });

  it('never goes below 11px, even at the smallest text size', () => {
    expect(resolveTextStyle({ ...base, scale: 0.85, variant: 'label' }).fontSize).toBe(11);
    expect(resolveTextStyle({ ...base, scale: 0.85, variant: 'bodyS' }).fontSize).toBe(11);
  });

  it('scales sizes with the text-size setting', () => {
    expect(resolveTextStyle({ ...base, scale: 1.3, variant: 'body' }).fontSize).toBe(20);
  });

  it('bold text moves body text one weight up', () => {
    expect(resolveTextStyle({ ...base, boldText: true, variant: 'body' }).fontFamily).toBe(
      fontFamily.bodySemiBold,
    );
    expect(resolveTextStyle({ ...base, boldText: true, variant: 'titleM' }).fontFamily).toBe(
      fontFamily.bodyBold,
    );
  });

  it('every font family in the tokens is loaded', () => {
    for (const name of Object.values(fontFamily)) expect(fontAssets).toHaveProperty(name);
  });
});
