import { fontAssets } from './fonts';
import { resolveTextStyle } from './text-style';
import { fontFamily } from './tokens';

const base = { scale: 1, boldText: false };

describe('resolveTextStyle', () => {
  it('big numbers are semibold with tabular digits; page titles are bold', () => {
    const n = resolveTextStyle({ ...base, variant: 'displayL' });
    expect(n.fontFamily).toBe(fontFamily.display);
    expect(n.fontVariant).toEqual(['tabular-nums']);
    expect(resolveTextStyle({ ...base, variant: 'screenTitle' }).fontFamily).toBe(
      fontFamily.bodyBold,
    );
  });

  it('nothing is uppercased by the style: the copy decides', () => {
    for (const variant of ['screenTitle', 'label', 'displayM'] as const)
      expect(resolveTextStyle({ ...base, variant }).textTransform).toBeUndefined();
  });

  it('labels are short semibold text', () => {
    const s = resolveTextStyle({ ...base, variant: 'label' });
    expect(s.fontFamily).toBe(fontFamily.label);
    expect(s.fontSize).toBe(12);
  });

  it('never goes below 12px, even at the smallest text size', () => {
    expect(resolveTextStyle({ ...base, scale: 0.85, variant: 'label' }).fontSize).toBe(12);
    expect(resolveTextStyle({ ...base, scale: 0.85, variant: 'bodyS' }).fontSize).toBe(12);
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

  it('numbers in body text get tabular digits too', () => {
    expect(resolveTextStyle({ ...base, variant: 'body', numeric: true }).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });

  it('every font family in the tokens is loaded', () => {
    for (const name of Object.values(fontFamily)) expect(fontAssets).toHaveProperty(name);
  });
});
