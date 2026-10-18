/**
 * Open Food Facts product -> our food row (per 100 g). The same rules as the server bridge
 * (supabase/functions/off/index.ts `toRow`): a product without a name or calories is skipped.
 */
export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  states_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
};

export const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,states_tags';

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? Number(v) : (v as number);
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
};

/** Longest product name and brand kept (DECISIONS 83): real names are far shorter. */
export const OFF_NAME_MAX = 100;
export const OFF_BRAND_MAX = 60;

/**
 * Open Food Facts text is written by anyone and ends up in AI tool results (DECISIONS 83): no
 * control, zero-width or direction characters, no markup characters, one line, a length limit.
 */
export function cleanOffText(s: unknown, max: number): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ')
    .replace(/[<>{}`[\]\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function offToFoodRow(p: OffProduct) {
  const name = cleanOffText(p.product_name || p.product_name_en, OFF_NAME_MAX);
  const nu = p.nutriments ?? {};
  const kj = n(nu['energy_100g']);
  const kcal = n(nu['energy-kcal_100g']) ?? (kj != null ? Math.round(kj / 4.184) : null);
  if (!p.code || !/^\d{1,14}$/.test(p.code) || !name || kcal == null) return null;
  const states = p.states_tags ?? [];
  return {
    barcode: p.code,
    name,
    brand: cleanOffText((p.brands ?? '').split(',')[0], OFF_BRAND_MAX) || null,
    kcal_100g: kcal,
    protein_100g: n(nu['proteins_100g']) ?? 0,
    carbs_100g: n(nu['carbohydrates_100g']) ?? 0,
    sugars_100g: n(nu['sugars_100g']),
    fat_100g: n(nu['fat_100g']) ?? 0,
    saturates_100g: n(nu['saturated-fat_100g']),
    fiber_100g: n(nu['fiber_100g']),
    salt_100g: n(nu['salt_100g']),
    source: 'off' as const,
    verified:
      states.includes('en:nutrition-facts-completed') &&
      states.includes('en:product-name-completed'),
    owner_id: null,
  };
}
