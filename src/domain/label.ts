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

/** null when the answer is not a readable label (nothing to fill). */
export function parseLabelReply(reply: string): LabelValues | null {
  const raw = extractJson(reply) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || raw.readable === false) return null;

  const serving = raw.serving as Record<string, unknown> | null | undefined;
  const grams = numberOf(serving?.grams);
  const portion =
    grams && grams > 0 && grams <= 5000
      ? { label: textOf(serving?.label, 40) ?? `${grams} g`, grams: round(grams, 1) }
      : null;

  // Per 100 g first; a value only per serving is scaled with the serving size.
  const p100 = (raw.per_100g ?? {}) as Record<string, unknown>;
  const pServ = (raw.per_serving ?? {}) as Record<string, unknown>;
  const valueOf = (k: string): number | null => {
    const direct = numberOf(p100[k]);
    if (direct != null) return direct;
    const s = numberOf(pServ[k]);
    return s != null && portion ? (s * 100) / portion.grams : null;
  };

  const per100 = Object.fromEntries(KEYS.map((k) => [k, null])) as LabelValues['per100'];
  for (const k of KEYS) {
    let v = valueOf(k);
    if (k === 'kcal' && v == null) {
      const kj = valueOf('kj');
      v = kj != null ? kj / 4.184 : null;
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
