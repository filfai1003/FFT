import fs from 'node:fs';
import path from 'node:path';
import { accentOptions, bars, color, radius, space, touch, typeScale } from './tokens';
import { buildTheme, textScaleFor, textScaleSteps } from './theme';
import { defaultAppearance, useAppearanceStore } from './appearance-store';

const json = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/design/tokens.json'), 'utf8'),
);

describe('tokens match docs/design/tokens.json', () => {
  it('colors', () => {
    const keys = [
      'bg',
      'surface',
      'surfaceAlt',
      'surfaceSelected',
      'surfaceRaised',
      'borderDecorative',
      'borderControl',
      'borderSelected',
      'text',
      'textMuted',
      'textPlaceholderIcon',
      'dotOn',
      'dotOff',
      'chartDotOff',
      'danger',
      'accentDefault',
      'overlay',
    ] as const;
    for (const key of keys) expect(color[key]).toBe(json.color[key]);
    expect(color.divider).toBe(json.color.divider.color);
    expect(color.macroSplit).toEqual(json.color.macroSplit);
    expect(color.dotGrid).toEqual({
      dot: json.color.bgDotGrid.dot,
      dotSize: json.color.bgDotGrid.dotSize,
      spacing: json.color.bgDotGrid.spacing,
    });
    expect(accentOptions).toEqual(json.color.accentOptions);
  });

  it('radius, space, touch', () => {
    expect(radius).toEqual(json.radius);
    expect(touch).toEqual(json.touch);
    const { screenX, gapS, gapM, gapL, gapXL } = json.space;
    expect(space).toEqual({ screenX, gapS, gapM, gapL, gapXL });
  });

  it('type scale sizes', () => {
    for (const [name, def] of Object.entries<{ size: number }>(json.typeScale)) {
      expect(typeScale[name as keyof typeof typeScale].size).toBe(def.size);
    }
  });

  it('bars', () => {
    expect(bars.tabBarHeight).toBe(json.bars.tabBar.height);
    expect(bars.tabBarPaddingTop).toBe(json.bars.tabBar.paddingTop);
  });
});

describe('theme', () => {
  it('uses the chosen accent', () => {
    expect(buildTheme({ accent: 'blue', highContrast: false }).accent).toBe('#4D8CFF');
  });

  it('meets contrast targets and high contrast improves them', () => {
    const normal = buildTheme({ accent: 'red', highContrast: false });
    const high = buildTheme({ accent: 'red', highContrast: true });
    expect(contrast(normal.text, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(normal.textMuted, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(normal.borderControl, '#000000')).toBeGreaterThanOrEqual(3);
    expect(contrast(high.borderControl, '#000000')).toBeGreaterThan(
      contrast(normal.borderControl, '#000000'),
    );
    expect(contrast(high.textMuted, '#000000')).toBeGreaterThan(
      contrast(normal.textMuted, '#000000'),
    );
  });

  it('text scale: step 3 of 5 is 1x, out-of-range steps are clamped', () => {
    expect(textScaleFor(3)).toBe(1);
    expect(textScaleFor(0)).toBe(textScaleSteps[0]);
    expect(textScaleFor(99)).toBe(textScaleSteps[4]);
  });
});

describe('appearance store', () => {
  it('starts with defaults, can be changed and reset', () => {
    expect(useAppearanceStore.getState()).toMatchObject(defaultAppearance);
    useAppearanceStore.getState().set('highContrast', true);
    expect(useAppearanceStore.getState().highContrast).toBe(true);
    useAppearanceStore.getState().reset();
    expect(useAppearanceStore.getState().highContrast).toBe(false);
  });
});

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
