/** The database is metric only; these convert for display and for input. */

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const KJ_PER_KCAL = 4.184;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL;
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export const feetInchesToCm = (feet: number, inches: number) =>
  Math.round((feet * 12 + inches) * CM_PER_INCH * 10) / 10;

export const round = (value: number, decimals = 1) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export type WeightUnit = 'kg' | 'lb';

/** Barbell and dumbbell loads move in steps, in the unit the user sees (2.5 kg / 5 lb). */
export function loadStep(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/** Stored kg to the number shown in the user's unit (one decimal at most). */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return round(unit === 'kg' ? kg : kgToLb(kg), 1);
}

/** The number typed in the user's unit back to kg for storage (2 decimals, the DB precision). */
export function storedWeight(value: number, unit: WeightUnit): number {
  return round(unit === 'kg' ? value : lbToKg(value), 2);
}
