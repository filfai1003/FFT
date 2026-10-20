import { localDay, weekdayName } from '@/domain/day';
import type { PlanDayView, PlanSession, Rotation } from './plans';

export type CycleDayState = 'next' | 'done' | 'todo';

/** One day of the plan as the cycle shows it: its number, state and when it was done. */
export type CycleDay = {
  id: string;
  /** 1-based place in the plan. */
  n: number;
  name: string;
  state: CycleDayState;
  /** "Thu": weekday it was done in this cycle (done days only). */
  weekday: string | null;
  outOfOrder: boolean;
};

/** The days of a plan with their state in the current cycle (domain/rotation decides "up next"). */
export function cycleDays(
  days: readonly PlanDayView[],
  rotation: Rotation | null,
  timeZone: string,
): CycleDay[] {
  return days.map((d, i) => {
    const done = rotation?.doneThisCycle.get(d.id);
    const state: CycleDayState =
      rotation?.state.upNextDayId === d.id ? 'next' : done ? 'done' : 'todo';
    return {
      id: d.id,
      n: i + 1,
      name: d.name,
      state,
      weekday:
        state === 'done' && done
          ? weekdayName(localDay(new Date(done.started_at), timeZone)).slice(0, 3)
          : null,
      outOfOrder: state === 'done' && (done?.out_of_order ?? false),
    };
  });
}

/** Local day of the last finished workout of a plan day (any cycle), or null. */
export function lastDoneDay(
  sessions: readonly PlanSession[] | undefined,
  dayId: string,
  timeZone: string,
): string | null {
  let last: PlanSession | null = null;
  for (const s of sessions ?? []) {
    if (s.plan_day_id !== dayId) continue;
    if (!last || s.started_at > last.started_at) last = s;
  }
  return last ? localDay(new Date(last.started_at), timeZone) : null;
}

/** "Bench press", "Overhead press", "+3 more": the chips of a day (names first, then the rest). */
export function exerciseChips(day: PlanDayView, shown = 3): { names: string[]; more: number } {
  // Three names and "+1 more" take the room of four names: show the fourth instead.
  const take = day.exercises.length === shown + 1 ? shown + 1 : shown;
  return {
    names: day.exercises.slice(0, take).map((e) => e.exercise.name),
    more: Math.max(0, day.exercises.length - take),
  };
}
