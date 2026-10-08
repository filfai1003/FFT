/**
 * Plan rotation. A plan has N ordered days; a CYCLE is complete when every day has been done once.
 * "Up next" is the first day, in plan order, not yet done in the current cycle. Any day can be
 * trained at any time: a day done out of order still counts for the cycle.
 */

export type PlanDay = { id: string; position: number };
export type FinishedSession = { planDayId: string | null; cycleNumber: number | null };

export type RotationState = {
  cycle: number;
  /** Days already done in the current cycle. */
  doneDayIds: ReadonlySet<string>;
  /** First not-done day in plan order (the first day of the next cycle when all are done). */
  upNextDayId: string | null;
  /** Days done in this cycle, e.g. 2 of 4 -> "CYCLE 3 · 2/4". */
  doneCount: number;
  totalDays: number;
};

export function rotationState(
  days: readonly PlanDay[],
  sessions: readonly FinishedSession[],
): RotationState {
  const ordered = [...days].sort((a, b) => a.position - b.position);
  const dayIds = new Set(ordered.map((d) => d.id));
  const counted = sessions.filter((s) => s.planDayId && dayIds.has(s.planDayId));

  let cycle = Math.max(1, ...counted.map((s) => s.cycleNumber ?? 1));
  let done = new Set(
    counted.filter((s) => (s.cycleNumber ?? 1) === cycle).map((s) => s.planDayId!),
  );

  // Every day done: the next workout starts a new cycle.
  if (ordered.length > 0 && done.size >= ordered.length) {
    cycle += 1;
    done = new Set();
  }

  const upNext = ordered.find((d) => !done.has(d.id)) ?? null;
  return {
    cycle,
    doneDayIds: done,
    upNextDayId: upNext?.id ?? null,
    doneCount: done.size,
    totalDays: ordered.length,
  };
}

/** True when starting `dayId` skips the suggested day: it is flagged "Out of order" in History. */
export function isOutOfOrder(state: RotationState, dayId: string): boolean {
  return state.upNextDayId != null && state.upNextDayId !== dayId;
}
