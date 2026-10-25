import { loadStep, type WeightUnit } from './units';
import { WARM_UP_SHARE } from './volume';

/**
 * Next weight suggestion (double progression), from the last session of an exercise. Today every
 * working set gets the SAME weight and the SAME reps (owner, DECISIONS 130): last time 2 × 100 and
 * 2 × 105, all at 10 of "8-10" -> 107.5 × 8 on all four, not only on the last two.
 * - the sets at the heaviest weight reached the top of the target reps: one step up from it, reps
 *   back to the bottom of the target;
 * - they all fell short of the bottom: down to the heaviest lighter working weight where every set
 *   was in the target, else about 5% down, reps at the bottom;
 * - otherwise: the heaviest weight, one rep more than the fewest done with it (at most the top).
 * Warm-ups (lighter than WARM_UP_SHARE of the heaviest, as for the volume) do not count.
 * Works in the unit the user sees, so the weights are ones that can be loaded (multiples of the
 * step). Only weighted exercises with target reps; bodyweight and bands get no suggestion.
 */

export type Suggestion = {
  kind: 'up' | 'down' | 'same';
  /** Last time's working weight and the suggested one, in the user's unit. */
  from: number;
  to: number;
  /** Last time's working sets (warm-ups left out), in order. */
  last: { weight: number; reps: number }[];
  /** Reps to aim for on every working set today. */
  reps: number;
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
  // The working sets: all but the warm-ups; the heaviest weight decides.
  const from = Math.max(...sets.map((s) => s.weight));
  const last = sets.filter((s) => s.weight >= from * WARM_UP_SHARE);
  const top = last.filter((s) => s.weight === from).map((s) => s.reps);

  if (top.every((r) => r >= target.max)) {
    const to = round2(Math.floor(from / step + 1e-9) * step + step);
    return { kind: 'up', from, to, last, reps: target.min };
  }
  if (top.every((r) => r < target.min)) {
    // A lighter working weight where every set was in the target, else about 5% down.
    const held = last
      .map((s) => s.weight)
      .filter((w) => w < from && last.every((x) => x.weight !== w || x.reps >= target.min));
    const below = Math.ceil(from / step - 1e-9) * step - step;
    const to = held.length
      ? Math.max(...held)
      : round2(Math.min(Math.floor((from * 0.95) / step + 1e-9) * step, below));
    if (to > 0) return { kind: 'down', from, to, last, reps: target.min };
  }
  const reps = Math.max(target.min, Math.min(Math.min(...top) + 1, target.max));
  return { kind: 'same', from, to: from, last, reps };
}
