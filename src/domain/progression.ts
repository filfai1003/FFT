import { loadStep, type WeightUnit } from './units';

/**
 * Next weight suggestion (double progression), from the last session of an exercise:
 * - every set reached the top of the target reps ("6-8" -> 8): one step up;
 * - every set fell short of the bottom: about 5% down (the load was too heavy);
 * - otherwise: same weight, aim for one more rep.
 * Works in the unit the user sees, so the weights are ones that can be loaded (multiples of the
 * step). Only weighted exercises with target reps; bodyweight and bands get no suggestion.
 */

export type Suggestion = {
  kind: 'up' | 'down' | 'same';
  /** Last time's working weight and the suggested one, in the user's unit. */
  from: number;
  to: number;
  /** Reps of last time's sets at the working weight. */
  reps: number[];
};

/** "6-8" / "6–8" / "8" -> { min, max }; null when it is not a rep target. */
export function parseTargetReps(text: string | undefined): { min: number; max: number } | null {
  const m = /^\s*(\d{1,3})\s*(?:[-–—]\s*(\d{1,3}))?\s*$/.exec(text ?? '');
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  if (a < 1 || b < a) return null;
  return { min: a, max: b };
}

/**
 * Step of the load for this equipment (dumbbells move in pairs of 1 kg). `smallPlates`: 1.25 kg
 * (2.5 lb) plates, so barbells and machines move by half the usual step.
 */
export function stepFor(
  equipment: string | undefined,
  unit: WeightUnit,
  smallPlates = false,
): number | null {
  if (equipment === 'bodyweight' || equipment === 'bands') return null;
  if (equipment === 'dumbbells') return unit === 'kg' ? 2 : 5;
  return smallPlates ? loadStep(unit) / 2 : loadStep(unit);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function suggestNextWeight(args: {
  /** Last session's sets, weights already in the user's unit. */
  previous: { weight: number | null; reps: number | null }[];
  targetReps: string | undefined;
  equipment: string | undefined;
  unit: WeightUnit;
  smallPlates?: boolean;
}): Suggestion | null {
  const target = parseTargetReps(args.targetReps);
  const step = stepFor(args.equipment, args.unit, args.smallPlates);
  if (!target || !step) return null;
  const sets = args.previous.filter(
    (s): s is { weight: number; reps: number } =>
      s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0,
  );
  if (sets.length === 0) return null;
  // The working weight: the heaviest one, and the sets done with it (warm-ups do not count).
  const from = Math.max(...sets.map((s) => s.weight));
  const reps = sets.filter((s) => s.weight === from).map((s) => s.reps);

  if (reps.every((r) => r >= target.max)) {
    return { kind: 'up', from, to: round2(Math.floor(from / step + 1e-9) * step + step), reps };
  }
  if (reps.every((r) => r < target.min)) {
    const below = Math.ceil(from / step - 1e-9) * step - step;
    const to = round2(Math.min(Math.floor((from * 0.95) / step + 1e-9) * step, below));
    if (to > 0) return { kind: 'down', from, to, reps };
  }
  return { kind: 'same', from, to: from, reps };
}
