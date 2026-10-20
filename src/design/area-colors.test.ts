import {
  areaUsingHue,
  canChooseAreaColors,
  defaultAreaColors,
  effectiveAreaColors,
  pickAreaHue,
  resolveAreaColors,
  toAreaColorChoice,
} from './area-colors';

describe('area colours (DECISIONS 118)', () => {
  it('only Supporter and Premium choose them', () => {
    expect(canChooseAreaColors('supporter')).toBe(true);
    expect(canChooseAreaColors('premium')).toBe(true);
    expect(canChooseAreaColors('free')).toBe(false);
    expect(canChooseAreaColors(null)).toBe(false);
  });

  it('back on Free the defaults show, whatever was saved', () => {
    const choice = { training: 'blue' };
    expect(effectiveAreaColors(choice, 'supporter').training).toBe('blue');
    expect(effectiveAreaColors(choice, 'free')).toEqual(defaultAreaColors);
    expect(effectiveAreaColors(choice, null)).toEqual(defaultAreaColors);
  });

  it('a saved choice is cleaned: unknown hues, areas and options are dropped', () => {
    expect(resolveAreaColors(null)).toEqual(defaultAreaColors);
    expect(resolveAreaColors('blue')).toEqual(defaultAreaColors);
    expect(resolveAreaColors({ training: 'green', streak: 'red', other: 'blue' })).toEqual(
      defaultAreaColors,
    );
    // Nutrition never takes pink (protein).
    expect(resolveAreaColors({ nutrition: 'pink' }).nutrition).toBe('teal');
  });

  it('two areas never share a hue: a chosen hue wins over a default', () => {
    // Training took teal: nutrition (teal by default) moves to its first free option.
    const r = resolveAreaColors({ training: 'teal' });
    expect(r.training).toBe('teal');
    expect(r.nutrition).not.toBe('teal');
    expect(new Set(Object.values(r)).size).toBe(3);
    // Both chose the same hue: the first area keeps it.
    const both = resolveAreaColors({ training: 'blue', streak: 'blue' });
    expect(both.training).toBe('blue');
    expect(both.streak).toBe('orange');
  });

  it('picking: a hue another area shows cannot be taken; defaults are left out of the choice', () => {
    expect(areaUsingHue(defaultAreaColors, 'training', 'teal')).toBe('nutrition');
    expect(pickAreaHue({}, 'training', 'teal')).toBeNull();
    expect(pickAreaHue({}, 'nutrition', 'pink')).toBeNull();
    expect(pickAreaHue({}, 'training', 'blue')).toEqual({ training: 'blue' });
    // Back to its default: nothing saved for that area.
    expect(pickAreaHue({ training: 'blue', streak: 'pink' }, 'training', 'purple')).toEqual({
      streak: 'pink',
    });
    // Once training left purple, streak can take it.
    expect(pickAreaHue({ training: 'blue' }, 'streak', 'purple')).toEqual({
      training: 'blue',
      streak: 'purple',
    });
  });

  it('a stored value becomes a valid choice', () => {
    expect(toAreaColorChoice(undefined)).toEqual({});
    expect(toAreaColorChoice({ training: 'purple', streak: 'pink', nutrition: 'x' })).toEqual({
      streak: 'pink',
    });
  });
});
