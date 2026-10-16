import { parseTargetReps, stepFor } from './progression';
import type { WeightUnit } from './units';

/**
 * Drop sets (DECISIONS 54): right after a set, the weight is lowered and more reps are done, once
 * or a few times ("drops"). A plan exercise says where (after the last set or after every set) and
 * the target reps of each drop. Drops count in volume only, never in max, 1RM or strength score.
 */

export type DropOn = 'last' | 'every';
export type DropPlan = { on: DropOn; reps: string[] };

export const MAX_DROPS = 4;

/** Whether set `setIndex` (of `total`) is followed by drops. */
export function hasDrops(plan: DropPlan | null | undefined, setIndex: number, total: number) {
  if (!plan || plan.reps.length === 0) return false;
  return plan.on === 'every' || setIndex === total - 1;
}

const floorTo = (n: number, step: number) => Math.floor(n / step + 1e-9) * step;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Weight of drop `k` (1, 2…) when there is no history: about 20% less per drop, on a loadable
 * weight, never zero.
 */
export function firstDropWeight(main: number, k: number, step: number): number | null {
  if (!(main > 0)) return null;
  const w = round2(floorTo(main * (1 - 0.2 * k), step));
  return w > 0 ? w : null;
}

export type DropSuggestion = {
  kind: 'up' | 'down' | 'same';
  from: number;
  to: number;
  reps: number;
};

/**
 * Next weight of one drop, from that same drop last time (weight and reps) and its own target:
 * target reached = one step up, below it = about 5% down, otherwise the same weight.
 */
export function suggestDrop(args: {
  previous: { weight: number | null; reps: number | null } | undefined;
  target: string;
  equipment: string | undefined;
  unit: WeightUnit;
  smallPlates?: boolean;
}): DropSuggestion | null {
  const target = parseTargetReps(args.target);
  const step = stepFor(args.equipment, args.unit, args.smallPlates);
  const p = args.previous;
  if (!target || !step || !p || p.weight == null || !(p.weight > 0) || p.reps == null) return null;
  const from = p.weight;
  if (p.reps >= target.max)
    return { kind: 'up', from, to: round2(floorTo(from, step) + step), reps: p.reps };
  if (p.reps < target.min) {
    const to = round2(
      Math.min(floorTo(from * 0.95, step), Math.ceil(from / step - 1e-9) * step - step),
    );
    if (to > 0) return { kind: 'down', from, to, reps: p.reps };
  }
  return { kind: 'same', from, to: from, reps: p.reps };
}
