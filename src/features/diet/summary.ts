import type { Macros } from '@/domain/diet';

export const macroKeys = ['protein', 'carbs', 'fat'] as const;
export type MacroKey = (typeof macroKeys)[number];

/** Energy of each macro (protein and carbs 4 kcal/g, fat 9). */
const kcalPerGram: Record<MacroKey, number> = { protein: 4, carbs: 4, fat: 9 };

/**
 * Each macro's share of the calories it brings (adds up to 1), in the protein, carbs, fat order.
 * Empty when nothing with macros was eaten: the arc / bar then shows only its track.
 */
export function macroShares(eaten: Pick<Macros, MacroKey>): { key: MacroKey; share: number }[] {
  const kcal = macroKeys.map((k) => Math.max(0, eaten[k]) * kcalPerGram[k]);
  const sum = kcal.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  return macroKeys.map((key, i) => ({ key, share: kcal[i] / sum }));
}

/** How the day stands against a calorie target: what is left, or how far over. */
export type CalorieStatus = {
  /** 0..1 of the target eaten (1 when over). */
  fill: number;
  /** Rounded kcal left, or over when `over`. */
  amount: number;
  over: boolean;
  /** More than 10% over: the arc turns red (the on-target tolerance of the calendar). */
  wellOver: boolean;
};

/**
 * The one place "kcal left / over" is worked out (Today card, greeting line, Diet): from the eaten
 * and target values as they are shown (rounded), so "91 of 2,000" always reads "1,909 left".
 */
export function calorieStatus(eatenKcal: number, targetKcal: number): CalorieStatus {
  const target = Math.max(1, targetKcal);
  const diff = Math.round(eatenKcal) - Math.round(target);
  const over = diff > 0;
  return {
    fill: Math.min(1, Math.max(0, eatenKcal / target)),
    amount: Math.abs(diff),
    over,
    wellOver: eatenKcal > target * 1.1,
  };
}

/** Grams left of a macro, or over: `{ grams, over }` (rounded). */
export function macroLeft(eaten: number, goal: number): { grams: number; over: boolean } {
  const diff = Math.round(goal - eaten);
  return diff >= 0 ? { grams: diff, over: false } : { grams: -diff, over: true };
}
