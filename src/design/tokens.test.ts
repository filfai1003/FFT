import fs from 'node:fs';
import path from 'node:path';
import { accentOptions, bars, color, palettes, radius, space, touch, typeScale } from './tokens';
import { contrastRatio as contrast } from './contrast';
import { buildTheme, resolveMode, textScaleFor, textScaleSteps } from './theme';
import { defaultAppearance, useAppearanceStore } from './appearance-store';

const json = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/design/tokens.json'), 'utf8'),
);

describe('tokens match docs/design/tokens.json', () => {
  it('colors (light theme)', () => {
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
      'disabledSurface',
      'disabledText',
      'overlay',
    ] as const;
    for (const key of keys) expect(color[key]).toBe(json.color[key]);
    expect(color.divider).toBe(json.color.divider.color);
    expect(color.macroSplit).toEqual(json.color.macroSplit);
    expect(color.track).toEqual(json.color.track);
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

  it('light and dark palettes have the same keys', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});

describe('theme', () => {
  it('uses the chosen accent; mono is dark on light and light on dark', () => {
    expect(buildTheme({ accent: 'blue', highContrast: false }).accent).toBe(accentOptions.blue);
    expect(buildTheme({ accent: 'white', highContrast: false, mode: 'light' }).accent).toBe(
      '#191917',
    );
    expect(buildTheme({ accent: 'white', highContrast: false, mode: 'dark' }).accent).toBe(
      '#F4F3F0',
    );
  });

  it.each(['light', 'dark'] as const)(
    '%s: meets contrast targets and high contrast improves them',
    (mode) => {
      const normal = buildTheme({ accent: 'red', highContrast: false, mode });
      const high = buildTheme({ accent: 'red', highContrast: true, mode });
      for (const ground of [normal.bg, normal.surface]) {
        expect(contrast(normal.text, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(normal.textMuted, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(normal.borderControl, ground)).toBeGreaterThanOrEqual(3);
        for (const dot of Object.values(normal.track))
          expect(contrast(dot, ground)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(high.borderControl, normal.surface)).toBeGreaterThan(
        contrast(normal.borderControl, normal.surface),
      );
      expect(contrast(high.textMuted, normal.surface)).toBeGreaterThan(
        contrast(normal.textMuted, normal.surface),
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    '%s: a disabled button is neutral and its label stays readable (>= 4.5:1)',
    (mode) => {
      for (const highContrast of [false, true]) {
        const th = buildTheme({ accent: 'red', highContrast, mode });
        expect(contrast(th.disabledText, th.disabledSurface)).toBeGreaterThanOrEqual(4.5);
        // The disabled label is also readable on the page and card (ghost / outlined buttons).
        expect(contrast(th.disabledText, th.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(th.disabledText, th.surface)).toBeGreaterThanOrEqual(4.5);
        // Never a faded accent: the fill is the neutral grey, not the accent.
        expect(th.disabledSurface).not.toBe(th.accent);
      }
    },
  );

  it.each(['light', 'dark'] as const)(
    '%s: the ink of every area is readable on its soft colour (StatusChip, tiles; >= 4.5:1)',
    (mode) => {
      for (const highContrast of [false, true]) {
        const th = buildTheme({ accent: 'red', highContrast, mode });
        const pairs: [string, string, string][] = [
          ['training', th.trainingInk, th.trainingSoft],
          ['nutrition', th.nutritionInk, th.nutritionSoft],
          ['water', th.waterInk, th.waterSoft],
          ['better', th.successText, th.successSoft],
          ['streak', th.streakInk, th.streakSoft],
          ['worse', th.danger, th.dangerSoft],
          ['neutral', th.text, th.surfaceAlt],
          ['protein', th.macroInk.protein, th.macroSoft.protein],
          ['carbs', th.macroInk.carbs, th.macroSoft.carbs],
          ['fat', th.macroInk.fat, th.macroSoft.fat],
        ];
        for (const [area, ink, soft] of pairs)
          expect([area, contrast(ink, soft) >= 4.5]).toEqual([area, true]);
      }
    },
  );

  it('text on every accent colour is readable (>= 4.5:1), in both themes', () => {
    for (const mode of ['light', 'dark'] as const)
      for (const name of Object.keys(accentOptions) as (keyof typeof accentOptions)[]) {
        const th = buildTheme({ accent: name, highContrast: false, mode });
        expect(contrast(th.onAccent, th.accent)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('a theme setting resolves to light or dark ("system" follows the phone, light if unknown)', () => {
    expect(resolveMode('dark', 'light')).toBe('dark');
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', null)).toBe('light');
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
