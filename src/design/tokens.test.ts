import fs from 'node:fs';
import path from 'node:path';
import {
  accentOptions,
  areaFamilies,
  areaHues,
  bars,
  color,
  palettes,
  radius,
  space,
  touch,
  typeScale,
} from './tokens';
import { areaHueOptions, colourAreas, defaultAreaColors } from './area-colors';
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

/** Hue angle (0..360) of a #RRGGBB colour. */
function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: string, b: string) => {
  const d = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(d, 360 - d);
};

describe('area colours (DECISIONS 118)', () => {
  it('the default families are the colour code of 107 (tokens.json domain)', () => {
    for (const mode of ['light', 'dark'] as const) {
      const p = palettes[mode];
      for (const area of colourAreas) {
        const f = areaFamilies[defaultAreaColors[area]][mode];
        expect([p[area], p[`${area}Soft`], p[`${area}Ink`]]).toEqual([f.main, f.soft, f.ink]);
      }
    }
    expect(json.color.domain.training).toBe(areaFamilies.purple.light.main);
    expect(json.color.domain.nutrition).toBe(areaFamilies.teal.light.main);
    expect(json.color.domain.streak).toBe(areaFamilies.orange.light.main);
    const { note: _note, ...hues } = json.color.areaHues;
    expect(hues).toEqual(Object.fromEntries(areaHues.map((h) => [h, areaFamilies[h].light.main])));
    // The default theme is unchanged by the new option.
    expect(buildTheme({ accent: 'red', highContrast: false }).training).toBe(color.training);
  });

  // Every family any area can take passes the rules of the defaults, in both themes, with and
  // without high contrast, through the real theme (what the screens read).
  const cases = colourAreas.flatMap((area) =>
    areaHueOptions[area].flatMap((hue) =>
      (['light', 'dark'] as const).flatMap((mode) =>
        [false, true].map((highContrast) => [area, hue, mode, highContrast] as const),
      ),
    ),
  );
  it.each(cases)('%s in %s, %s, high contrast %s', (area, hue, mode, highContrast) => {
    const areas = { ...defaultAreaColors, [area]: hue };
    // Another area may hold this hue by default: the test only looks at `area`.
    const th = buildTheme({ accent: 'red', highContrast, mode, areas });
    const main = th[area];
    const soft = th[`${area}Soft`];
    const ink = th[`${area}Ink`];
    const family = areaFamilies[hue][mode];
    // Ink: text and icons on the soft ground and on the page and cards.
    for (const ground of [soft, th.bg, th.surface])
      expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
    // Fill (rings, bars, calendar dots, icons on it): 3:1 against the page and cards. The default
    // streak orange (107) is the one family under it; high contrast swaps in its darker fill.
    const minFill = !highContrast && family.mainHighContrast ? 2.3 : 3;
    for (const ground of [th.bg, th.surface])
      expect(contrast(main, ground)).toBeGreaterThanOrEqual(minFill);
    // The soft ground can be told apart from the card under a tile (never the same colour).
    expect(soft).not.toBe(th.surface);
    // The calendar dots follow the area.
    if (area === 'training') expect(th.track.workout).toBe(main);
    if (area === 'nutrition') expect([th.track.diet, th.track.supplement]).toEqual([main, main]);
  });

  it('no hue can be mistaken for better green or worse red, and every hue is its own', () => {
    for (const mode of ['light', 'dark'] as const) {
      const p = palettes[mode];
      for (const hue of areaHues) {
        // Teal, the nutrition default of 107, is the nearest to green (about 21 degrees, darker).
        expect([hue, hueGap(areaFamilies[hue][mode].main, p.success) >= 20]).toEqual([hue, true]);
        expect([hue, hueGap(areaFamilies[hue][mode].main, p.danger) >= 25]).toEqual([hue, true]);
        for (const other of areaHues)
          if (other !== hue)
            expect([
              hue,
              other,
              hueGap(areaFamilies[hue][mode].main, areaFamilies[other][mode].main) >= 25,
            ]).toEqual([hue, other, true]);
      }
    }
  });

  it('nutrition never takes pink (the protein colour on every nutrition card)', () => {
    expect(areaHueOptions.nutrition).not.toContain('pink');
    for (const area of colourAreas) expect(areaHueOptions[area][0]).toBe(defaultAreaColors[area]);
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
