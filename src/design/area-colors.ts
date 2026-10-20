import { areaHues, type AreaHue } from './tokens';

/**
 * The user's area colours (DECISIONS 118): Supporter and Premium choose the hue of the three areas
 * of the colour code (107). Better green, worse red and the macro colours never move.
 */
export const colourAreas = ['training', 'nutrition', 'streak'] as const;
export type ColourArea = (typeof colourAreas)[number];
export type AreaColors = Record<ColourArea, AreaHue>;
/** What is saved: only the areas the user changed (an empty object = the default look). */
export type AreaColorChoice = Partial<AreaColors>;

export const defaultAreaColors: AreaColors = {
  training: 'purple',
  nutrition: 'teal',
  streak: 'orange',
};

/**
 * The hues each area can take. Nutrition never takes pink (protein is pink on every nutrition
 * card), so it has five; the others have all six.
 */
export const areaHueOptions: Record<ColourArea, readonly AreaHue[]> = {
  training: ['purple', 'blue', 'plum', 'pink', 'teal', 'orange'],
  nutrition: ['teal', 'blue', 'purple', 'plum', 'orange'],
  streak: ['orange', 'pink', 'plum', 'purple', 'blue', 'teal'],
};

const isHue = (v: unknown): v is AreaHue => areaHues.includes(v as AreaHue);

/** The plans that can choose the area colours (the same as the community filters, 117). */
export const canChooseAreaColors = (plan: string | null | undefined) =>
  plan === 'supporter' || plan === 'premium';

/**
 * A saved choice made safe: unknown areas and hues dropped, each area within its options, and no
 * two areas on the same hue (the first area keeps it, the next gets its default or the first free
 * option). Always a full set.
 */
export function resolveAreaColors(choice: unknown): AreaColors {
  const raw = (choice && typeof choice === 'object' ? choice : {}) as Record<string, unknown>;
  const taken = new Set<AreaHue>();
  const out = { ...defaultAreaColors };
  // Areas the user set go first, so a default never pushes a chosen hue away.
  const order = [...colourAreas].sort((a, b) => Number(!isHue(raw[a])) - Number(!isHue(raw[b])));
  for (const area of order) {
    const wanted = raw[area];
    const candidates = [
      ...(isHue(wanted) && areaHueOptions[area].includes(wanted) ? [wanted] : []),
      defaultAreaColors[area],
      ...areaHueOptions[area],
    ];
    const hue = candidates.find((h) => !taken.has(h)) ?? defaultAreaColors[area];
    taken.add(hue);
    out[area] = hue;
  }
  return out;
}

/** The colours the app shows: the saved choice for Supporter / Premium, the defaults otherwise. */
export function effectiveAreaColors(choice: unknown, plan: string | null | undefined): AreaColors {
  return canChooseAreaColors(plan) ? resolveAreaColors(choice) : { ...defaultAreaColors };
}

/** The area that already shows this hue (other than `area`), if any. */
export function areaUsingHue(
  current: AreaColors,
  area: ColourArea,
  hue: AreaHue,
): ColourArea | null {
  return colourAreas.find((a) => a !== area && current[a] === hue) ?? null;
}

/**
 * The choice after picking `hue` for `area`, or null when it cannot be taken (not an option for
 * that area, or another area shows it). Areas back on their default are left out of the choice.
 */
export function pickAreaHue(
  choice: unknown,
  area: ColourArea,
  hue: AreaHue,
): AreaColorChoice | null {
  const current = resolveAreaColors(choice);
  if (!areaHueOptions[area].includes(hue) || areaUsingHue(current, area, hue)) return null;
  const next = { ...current, [area]: hue };
  const out: AreaColorChoice = {};
  for (const a of colourAreas) if (next[a] !== defaultAreaColors[a]) out[a] = next[a];
  return out;
}

/** A saved value cleaned into a valid choice (user_settings.area_colors -> the store). */
export function toAreaColorChoice(value: unknown): AreaColorChoice {
  const resolved = resolveAreaColors(value);
  const out: AreaColorChoice = {};
  for (const a of colourAreas) if (resolved[a] !== defaultAreaColors[a]) out[a] = resolved[a];
  return out;
}
