import { extractJson } from './plan-import';

/**
 * A photo of a nutrition label, read by an AI, turned into the values of the "New food" form.
 * The AI is asked for JSON (LABEL_PROMPT); this checks and cleans its answer: values per 100 g,
 * kcal (from kJ when only kJ is given), nothing out of range, nothing invented.
 */

export type LabelValues = {
  name: string | null;
  brand: string | null;
  per100: {
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    sugars: number | null;
    fat: number | null;
    saturates: number | null;
    fiber: number | null;
    salt: number | null;
  };
  portion: { label: string; grams: number } | null;
};

export const LABEL_PROMPT = [
  'You read nutrition labels from photos. Reply with ONLY this JSON, no other text:',
  '{"name": string|null, "brand": string|null, "per_100g": {"kcal": number|null, "kj": number|null, "protein": number|null, "carbs": number|null, "sugars": number|null, "fat": number|null, "saturates": number|null, "fiber": number|null, "salt": number|null}, "per_serving": {same keys}|null, "serving": {"label": string, "grams": number}|null, "readable": boolean}',
  '- Copy the numbers printed on the label; never guess a value that is not there (use null).',
  '- per_100g: the "per 100 g" (or per 100 ml) column. If the label has only a per-serving column, put it in per_serving and give the serving size in grams.',
  '- carbs = total carbohydrates (not "of which sugars"); fat = total fat; salt in g (if only sodium is given, salt = sodium x 2.5).',
  '- name/brand: only if printed on the photo. serving.label like "1 bar" or "1 portion (30 g)".',
  '- readable: false if the photo is not a nutrition label or cannot be read.',
].join('\n');

const KEYS = ['kcal', 'protein', 'carbs', 'sugars', 'fat', 'saturates', 'fiber', 'salt'] as const;
/** Per 100 g a value cannot be above these (kcal: pure fat is ~900). */
const MAX: Record<(typeof KEYS)[number], number> = {
  kcal: 950,
  protein: 100,
  carbs: 100,
  sugars: 100,
  fat: 100,
  saturates: 100,
  fiber: 100,
  salt: 100,
};

const numberOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const textOf = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

/** Other names models use for the same values (lower case, spaces and dashes as "_"). */
const ALIASES: Record<string, string[]> = {
  kcal: ['kcal', 'energy_kcal', 'calories', 'energy', 'kcal_100g', 'calorie'],
  kj: ['kj', 'energy_kj', 'kilojoules'],
  protein: ['protein', 'proteins', 'protein_g', 'proteine'],
  carbs: [
    'carbs',
    'carbohydrates',
    'carbohydrate',
    'total_carbohydrates',
    'carbohydrates_g',
    'carboidrati',
  ],
  sugars: ['sugars', 'sugar', 'of_which_sugars', 'zuccheri'],
  fat: ['fat', 'fats', 'total_fat', 'fat_g', 'grassi'],
  saturates: [
    'saturates',
    'saturated_fat',
    'saturated',
    'of_which_saturates',
    'saturated_fats',
    'saturi',
  ],
  fiber: ['fiber', 'fibre', 'dietary_fiber', 'fibres', 'fibers', 'fibre_g', 'fibre_alimentari'],
  salt: ['salt', 'sale'],
  sodium: ['sodium', 'sodio'],
};
const norm = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_');

/** The value of one nutrient in a JSON object, whatever name the model gave it. */
function pick(obj: Record<string, unknown> | undefined, key: string): number | null {
  if (!obj) return null;
  for (const [k, v] of Object.entries(obj))
    if (ALIASES[key]!.includes(norm(k))) {
      const n = numberOf(v);
      if (n != null) return n;
    }
  return null;
}

/** Values written as text ("Protein 12.5 g", "Energy 1521 kJ / 359 kcal"), per 100 g. */
function fromText(reply: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const find = (re: RegExp) => {
    const m = re.exec(reply);
    return m ? numberOf(m[1]) : null;
  };
  out.kcal = find(/(\d+(?:[.,]\d+)?)\s*kcal/i);
  out.kj = find(/(\d+(?:[.,]\d+)?)\s*kj/i);
  out.protein = find(/protei\w*[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  out.carbs = find(/carb\w*[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  out.sugars = find(/sugar\w*[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  out.fat = find(/(?:^|[^a-z])fats?[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/im);
  out.saturates = find(/saturat\w*[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  out.fiber = find(/fib(?:er|re)\w*[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  out.salt = find(/salt[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  out.sodium = find(/sodium[^\d\n]{0,20}(\d+(?:[.,]\d+)?)/i);
  return out;
}

/**
 * The form values in the AI's answer, or null when there is nothing at all to fill. Whatever is
 * found is used, even one value: the user completes the rest.
 */
export function parseLabelReply(reply: string): LabelValues | null {
  const raw = (extractJson(reply) as Record<string, unknown> | null) ?? {};

  const serving = raw.serving as Record<string, unknown> | null | undefined;
  const grams = numberOf(serving?.grams);
  const portion =
    grams && grams > 0 && grams <= 5000
      ? { label: textOf(serving?.label, 40) ?? `${grams} g`, grams: round(grams, 1) }
      : null;

  // Per 100 g first (the per_100g object, or the top level), then per serving scaled, then text.
  const p100 = (raw.per_100g ??
    raw.per100g ??
    raw.per_100 ??
    raw.per100 ??
    raw.nutrition ??
    raw) as Record<string, unknown>;
  const pServ = (raw.per_serving ?? raw.per_portion) as Record<string, unknown> | undefined;
  const text = fromText(reply);
  const valueOf = (k: string): number | null => {
    const direct = pick(p100, k);
    if (direct != null) return direct;
    const s = pick(pServ, k);
    if (s != null && portion) return (s * 100) / portion.grams;
    return Object.keys(raw).length ? null : (text[k] ?? null);
  };

  const per100 = Object.fromEntries(KEYS.map((k) => [k, null])) as LabelValues['per100'];
  for (const k of KEYS) {
    let v = valueOf(k);
    if (k === 'kcal' && v == null) {
      const kj = valueOf('kj');
      v = kj != null ? kj / 4.184 : null;
    }
    if (k === 'salt' && v == null) {
      const sodium = valueOf('sodium');
      v = sodium != null ? sodium * 2.5 : null;
    }
    per100[k] = v != null && v <= MAX[k] ? round(v, k === 'kcal' ? 0 : k === 'salt' ? 2 : 1) : null;
  }
  if (KEYS.every((k) => per100[k] == null)) return null;
  return {
    name: textOf(raw.name, 80),
    brand: textOf(raw.brand, 60),
    per100,
    portion,
  };
}
