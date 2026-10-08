import {
  actualMax,
  bestEstimated1RM,
  detectRecords,
  epley1RM,
  type LoggedSet,
} from '@/domain/strength';
import { parseDecimal } from '@/domain/numbers';
import { displayWeight, storedWeight, type WeightUnit } from '@/domain/units';
import type { LogType } from '@/features/train/exercises';
import { newId } from '@/lib/uuid';

/**
 * The active workout, kept entirely on the device while it runs (offline-first): inputs are the
 * strings the user typed, converted to numbers only when the session is saved.
 */
export type SessionSet = {
  id: string;
  weight: string;
  reps: string;
  duration: string;
  distance: string;
  done: boolean;
  completedAt: string | null;
  /** "24 × 10" from the previous session, or null. */
  previous: string | null;
};

export type SessionExercise = {
  /** Id of the session_exercises row. */
  rowId: string;
  exerciseId: string;
  name: string;
  logType: LogType;
  imagePath: string | null;
  restS: number;
  sets: SessionSet[];
};

export type ActiveSession = {
  id: string;
  planId: string | null;
  planDayId: string | null;
  dayName: string;
  cycleNumber: number | null;
  outOfOrder: boolean;
  startedAt: string;
  /** Unit of the weights typed in this session (converted to kg when saved). */
  weightUnit: WeightUnit;
  exercises: SessionExercise[];
  /** Exercise on screen. Moving between exercises never loses data. */
  index: number;
  rest: { endsAt: number; totalS: number } | null;
};

export type PreviousSet = {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export function emptySet(
  previous: PreviousSet | undefined,
  logType: LogType,
  unit: WeightUnit,
): SessionSet {
  return {
    id: newId(),
    // The load is pre-filled from the last session, the reps are for you to enter.
    weight:
      previous?.weightKg != null && logType === 'weight_reps'
        ? trimNumber(displayWeight(previous.weightKg, unit))
        : '',
    reps: '',
    duration: '',
    distance: '',
    done: false,
    completedAt: null,
    previous: formatPrevious(previous, logType, unit),
  };
}

export function trimNumber(n: number): string {
  return String(Number(n.toFixed(2)));
}

export function formatPrevious(
  p: PreviousSet | undefined,
  logType: LogType,
  unit: WeightUnit,
): string | null {
  if (!p) return null;
  if (logType === 'weight_reps' && p.weightKg != null && p.reps != null)
    return `${trimNumber(displayWeight(p.weightKg, unit))} × ${p.reps}`;
  if (logType === 'reps' && p.reps != null) return `${p.reps}`;
  if (logType === 'time' && p.durationS != null) return formatClock(p.durationS);
  if (logType === 'distance_time' && p.distanceM != null && p.durationS != null)
    return `${trimNumber(p.distanceM / 1000)} km · ${formatClock(p.durationS)}`;
  return null;
}

/** 83 -> "01:23", 3725 -> "01:02:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

export type NewExercise = {
  exerciseId: string;
  name: string;
  logType: LogType;
  imagePath: string | null;
  restS: number;
  targetSets: number;
  previous: PreviousSet[];
};

export function buildExercise(e: NewExercise, unit: WeightUnit): SessionExercise {
  return {
    rowId: newId(),
    exerciseId: e.exerciseId,
    name: e.name,
    logType: e.logType,
    imagePath: e.imagePath,
    restS: e.restS,
    sets: Array.from({ length: e.targetSets }, (_, i) =>
      emptySet(e.previous[i] ?? e.previous[e.previous.length - 1], e.logType, unit),
    ),
  };
}

export function buildSession(args: {
  planId: string | null;
  planDayId: string | null;
  dayName: string;
  cycleNumber: number | null;
  outOfOrder: boolean;
  weightUnit: WeightUnit;
  exercises: NewExercise[];
  now: Date;
}): ActiveSession {
  return {
    id: newId(),
    planId: args.planId,
    planDayId: args.planDayId,
    dayName: args.dayName,
    cycleNumber: args.cycleNumber,
    outOfOrder: args.outOfOrder,
    startedAt: args.now.toISOString(),
    weightUnit: args.weightUnit,
    exercises: args.exercises.map((e) => buildExercise(e, args.weightUnit)),
    index: 0,
    rest: null,
  };
}

// --- pure updates (return a new session) -------------------------------------------------------

function mapExercise(
  s: ActiveSession,
  exerciseIndex: number,
  fn: (e: SessionExercise) => SessionExercise,
): ActiveSession {
  return { ...s, exercises: s.exercises.map((e, i) => (i === exerciseIndex ? fn(e) : e)) };
}

export type SetField = 'weight' | 'reps' | 'duration' | 'distance';

export function setField(
  s: ActiveSession,
  exerciseIndex: number,
  setIndex: number,
  field: SetField,
  value: string,
): ActiveSession {
  return mapExercise(s, exerciseIndex, (e) => ({
    ...e,
    sets: e.sets.map((x, i) => (i === setIndex ? { ...x, [field]: value } : x)),
  }));
}

/** Checks a set off (or back). Returns the new session and whether it was just completed. */
export function toggleSet(
  s: ActiveSession,
  exerciseIndex: number,
  setIndex: number,
  now: Date,
): { session: ActiveSession; completed: boolean } {
  const current = s.exercises[exerciseIndex].sets[setIndex];
  const completed = !current.done;
  const session = mapExercise(s, exerciseIndex, (e) => ({
    ...e,
    sets: e.sets.map((x, i) =>
      i === setIndex
        ? { ...x, done: completed, completedAt: completed ? now.toISOString() : null }
        : x,
    ),
  }));
  return { session, completed };
}

export function addSet(s: ActiveSession, exerciseIndex: number): ActiveSession {
  return mapExercise(s, exerciseIndex, (e) => {
    const last = e.sets[e.sets.length - 1];
    const next: SessionSet = {
      ...emptySet(undefined, e.logType, s.weightUnit),
      // A new set starts from the previous set's load.
      weight: last?.weight ?? '',
      duration: last?.duration ?? '',
      distance: last?.distance ?? '',
    };
    return { ...e, sets: [...e.sets, next] };
  });
}

export function removeSet(
  s: ActiveSession,
  exerciseIndex: number,
  setIndex: number,
): ActiveSession {
  return mapExercise(s, exerciseIndex, (e) => ({
    ...e,
    sets: e.sets.filter((_, i) => i !== setIndex),
  }));
}

export function addExercises(s: ActiveSession, added: NewExercise[]): ActiveSession {
  const existing = new Set(s.exercises.map((e) => e.exerciseId));
  const fresh = added
    .filter((e) => !existing.has(e.exerciseId))
    .map((e) => buildExercise(e, s.weightUnit));
  return { ...s, exercises: [...s.exercises, ...fresh] };
}

export function removeExercise(s: ActiveSession, exerciseIndex: number): ActiveSession {
  const exercises = s.exercises.filter((_, i) => i !== exerciseIndex);
  return { ...s, exercises, index: Math.min(s.index, Math.max(exercises.length - 1, 0)) };
}

export function moveExercise(s: ActiveSession, from: number, to: number): ActiveSession {
  if (to < 0 || to >= s.exercises.length || from === to) return s;
  const exercises = [...s.exercises];
  const [moved] = exercises.splice(from, 1);
  exercises.splice(to, 0, moved);
  return { ...s, exercises, index: to === s.index ? from : s.index === from ? to : s.index };
}

export function goTo(s: ActiveSession, index: number): ActiveSession {
  return { ...s, index: Math.min(Math.max(index, 0), Math.max(s.exercises.length - 1, 0)) };
}

// --- rest timer --------------------------------------------------------------------------------

export function startRest(s: ActiveSession, seconds: number, nowMs: number): ActiveSession {
  if (seconds <= 0) return { ...s, rest: null };
  return { ...s, rest: { endsAt: nowMs + seconds * 1000, totalS: seconds } };
}

export function adjustRest(s: ActiveSession, deltaS: number, nowMs: number): ActiveSession {
  if (!s.rest) return s;
  const remaining = Math.max(0, (s.rest.endsAt - nowMs) / 1000 + deltaS);
  if (remaining <= 0) return { ...s, rest: null };
  return {
    ...s,
    rest: {
      endsAt: nowMs + remaining * 1000,
      totalS: Math.max(s.rest.totalS, Math.ceil(remaining)),
    },
  };
}

export function restRemainingS(s: ActiveSession, nowMs: number): number {
  return s.rest ? Math.max(0, Math.ceil((s.rest.endsAt - nowMs) / 1000)) : 0;
}

// --- reading the session ---------------------------------------------------------------------

export function toLoggedSets(e: SessionExercise, unit: WeightUnit): LoggedSet[] {
  return e.sets.map((x) => ({
    weightKg: storedWeight(parseDecimal(x.weight) ?? 0, unit),
    reps: Math.round(parseDecimal(x.reps) ?? 0),
    completed: x.done,
  }));
}

export type SessionTotals = {
  durationS: number;
  volumeKg: number;
  setsDone: number;
  setsTotal: number;
  exercisesDone: number;
  exercisesTotal: number;
};

export function totals(s: ActiveSession, endedAt: Date): SessionTotals {
  let volume = 0;
  let done = 0;
  let total = 0;
  let exercisesDone = 0;
  for (const e of s.exercises) {
    const doneHere = e.sets.filter((x) => x.done);
    total += e.sets.length;
    done += doneHere.length;
    if (e.sets.length > 0 && doneHere.length === e.sets.length) exercisesDone += 1;
    if (e.logType === 'weight_reps') {
      for (const x of doneHere) {
        volume +=
          storedWeight(parseDecimal(x.weight) ?? 0, s.weightUnit) * (parseDecimal(x.reps) ?? 0);
      }
    }
  }
  return {
    durationS: Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(s.startedAt).getTime()) / 1000),
    ),
    volumeKg: Math.round(volume),
    setsDone: done,
    setsTotal: total,
    exercisesDone,
    exercisesTotal: s.exercises.length,
  };
}

/** For the Finish sheet: exercises that are not fully done, with their state. */
export function unfinished(s: ActiveSession) {
  return s.exercises
    .map((e) => ({
      name: e.name,
      done: e.sets.filter((x) => x.done).length,
      total: e.sets.length,
    }))
    .filter((e) => e.done < e.total);
}

/** An exercise counts as "started" once any of its sets is checked off. */
export function exerciseState(e: SessionExercise): 'todo' | 'partial' | 'done' {
  const done = e.sets.filter((x) => x.done).length;
  if (done === 0) return 'todo';
  return done === e.sets.length ? 'done' : 'partial';
}

export type SessionRecord = {
  exerciseId: string;
  name: string;
  kind: 'max' | 'est1rm';
  value: number;
  was: number;
  /** The set behind the record, e.g. 10 reps for "26 kg × 10". */
  reps: number;
};

/** NEW MAX / NEW EST. 1RM of a finished session versus the previous bests. */
export function sessionRecords(
  s: ActiveSession,
  previousBests: Record<string, { actualMax: number | null; est1rm: number | null }>,
): SessionRecord[] {
  const records: SessionRecord[] = [];
  for (const e of s.exercises) {
    if (e.logType !== 'weight_reps') continue;
    const prev = previousBests[e.exerciseId] ?? { actualMax: null, est1rm: null };
    const sets = toLoggedSets(e, s.weightUnit);
    for (const r of detectRecords(prev, sets)) {
      const done = sets.filter((x) => x.completed);
      // The set behind the record: the heaviest one (ties: more reps) or the best estimate.
      const top =
        r.kind === 'max'
          ? done.reduce(
              (b, x) =>
                x.weightKg > b.weightKg || (x.weightKg === b.weightKg && x.reps > b.reps) ? x : b,
              done[0],
            )
          : done.reduce(
              (b, x) =>
                (epley1RM(x.weightKg, x.reps) ?? 0) > (epley1RM(b.weightKg, b.reps) ?? 0) ? x : b,
              done[0],
            );
      records.push({
        exerciseId: e.exerciseId,
        name: e.name,
        kind: r.kind,
        value: r.value,
        was: r.was,
        reps: top.reps,
      });
    }
  }
  return records;
}

export { actualMax, bestEstimated1RM };

/** Rows to write to the database: only the sets that were checked off are saved. */
export function toRows(
  s: ActiveSession,
  userId: string,
  meta: { endedAt: Date; feeling: number | null; notes: string },
) {
  const session = {
    id: s.id,
    user_id: userId,
    plan_id: s.planId,
    plan_day_id: s.planDayId,
    day_name: s.dayName,
    cycle_number: s.cycleNumber,
    out_of_order: s.outOfOrder,
    started_at: s.startedAt,
    ended_at: meta.endedAt.toISOString(),
    feeling: meta.feeling,
    notes: meta.notes.trim() === '' ? null : meta.notes.trim(),
    status: 'done' as const,
  };

  const exercises: {
    id: string;
    user_id: string;
    session_id: string;
    exercise_id: string;
    position: number;
    rest_s: number;
  }[] = [];
  const sets: {
    id: string;
    user_id: string;
    session_id: string;
    exercise_id: string;
    set_index: number;
    weight_kg: number | null;
    reps: number | null;
    duration_s: number | null;
    distance_m: number | null;
    completed_at: string;
  }[] = [];

  s.exercises.forEach((e, position) => {
    const done = e.sets.filter((x) => x.done);
    if (done.length === 0) return;
    exercises.push({
      id: e.rowId,
      user_id: userId,
      session_id: s.id,
      exercise_id: e.exerciseId,
      position,
      rest_s: e.restS,
    });
    done.forEach((x, i) => {
      const reps = parseDecimal(x.reps);
      sets.push({
        id: x.id,
        user_id: userId,
        session_id: s.id,
        exercise_id: e.exerciseId,
        set_index: i,
        weight_kg:
          e.logType === 'weight_reps'
            ? storedWeight(parseDecimal(x.weight) ?? 0, s.weightUnit)
            : null,
        reps:
          e.logType === 'time' || e.logType === 'distance_time'
            ? null
            : reps != null
              ? Math.round(reps)
              : null,
        duration_s:
          e.logType === 'time' || e.logType === 'distance_time' ? parseDuration(x.duration) : null,
        distance_m: e.logType === 'distance_time' ? toMeters(x.distance) : null,
        completed_at: x.completedAt ?? meta.endedAt.toISOString(),
      });
    });
  });

  return { session, exercises, sets };
}

/** "1:30" -> 90, "45" -> 45. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    const mm = Number(m);
    const ss = Number(s);
    return Number.isFinite(mm) && Number.isFinite(ss) ? mm * 60 + ss : null;
  }
  const n = parseDecimal(t);
  return n == null ? null : Math.round(n);
}

/** Distance is typed in km, stored in meters. */
export function toMeters(km: string): number | null {
  const n = parseDecimal(km);
  return n == null ? null : Math.round(n * 1000 * 10) / 10;
}

/** UNDO of "set saved": un-checks that set (found by id) and stops the rest timer. */
export function undoSetDone(s: ActiveSession, setId: string): ActiveSession {
  let found = false;
  const exercises = s.exercises.map((e) => ({
    ...e,
    sets: e.sets.map((x) => {
      if (x.id !== setId || !x.done) return x;
      found = true;
      return { ...x, done: false, completedAt: null };
    }),
  }));
  return found ? { ...s, exercises, rest: null } : s;
}

/** UNDO of "exercise removed": puts it back where it was, with its sets. */
export function restoreExercise(
  s: ActiveSession,
  exercise: SessionExercise,
  position: number,
): ActiveSession {
  if (s.exercises.some((e) => e.rowId === exercise.rowId)) return s;
  const exercises = [...s.exercises];
  exercises.splice(Math.min(position, exercises.length), 0, exercise);
  return { ...s, exercises, index: Math.min(position, exercises.length - 1) };
}
