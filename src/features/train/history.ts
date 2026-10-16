import { useQuery } from '@tanstack/react-query';
import { deviceTimeZone, localDay } from '@/domain/day';
import { useProfile } from '@/features/profile/api';
import { getSupabase } from '@/lib/supabase';

export type RawSet = {
  exercise_id: string;
  set_index: number;
  /** 0 = the set itself, 1, 2… = its drops (drop set). */
  drop_index?: number | null;
  /** Filled by nestDrops: the drops done after this set. */
  drops?: RawSet[];
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  completed_at: string | null;
  deleted_at: string | null;
};

export type RawSession = {
  id: string;
  day_name: string | null;
  started_at: string;
  ended_at: string | null;
  out_of_order: boolean;
  feeling: number | null;
  notes: string | null;
  plan_id: string | null;
  plan_day_id: string | null;
  workout_plans: { name: string } | null;
  session_sets: RawSet[];
  session_exercises: { exercise_id: string; position: number; deleted_at: string | null }[];
};

export type SessionStats = {
  minutes: number;
  /** Total lifted, in kg. */
  volumeKg: number;
  sets: number;
};

export type SessionExerciseSets = {
  exerciseId: string;
  position: number;
  sets: RawSet[];
};

export type SessionView = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  outOfOrder: boolean;
  feeling: number | null;
  notes: string | null;
  planId: string | null;
  planName: string | null;
  stats: SessionStats;
  exercises: SessionExerciseSets[];
};

/**
 * Drop rows go under their set (same set_index), so a drop set counts as one set and is shown as
 * "80×8 ↘ 60×10". Drops still count in volume.
 */
export function nestDrops<T extends { set_index: number; drop_index?: number | null; drops?: T[] }>(
  rows: T[],
): T[] {
  const mains = rows.filter((r) => !r.drop_index).map((r) => ({ ...r, drops: [] as T[] }));
  for (const d of rows
    .filter((r) => (r.drop_index ?? 0) > 0)
    .sort((a, b) => (a.drop_index ?? 0) - (b.drop_index ?? 0)))
    mains.find((m) => m.set_index === d.set_index)?.drops.push(d);
  return mains;
}

export function sessionStats(raw: RawSession): SessionStats {
  const done = raw.session_sets.filter((s) => s.completed_at != null && s.deleted_at == null);
  const volume = done.reduce((sum, s) => sum + Number(s.weight_kg ?? 0) * (s.reps ?? 0), 0);
  const minutes = raw.ended_at
    ? Math.max(1, Math.round((Date.parse(raw.ended_at) - Date.parse(raw.started_at)) / 60000))
    : 0;
  return { minutes, volumeKg: Math.round(volume), sets: done.filter((s) => !s.drop_index).length };
}

export function toSessionView(raw: RawSession): SessionView {
  const done = raw.session_sets.filter((s) => s.completed_at != null && s.deleted_at == null);
  const order = new Map(
    raw.session_exercises
      .filter((e) => e.deleted_at == null)
      .map((e) => [e.exercise_id, e.position]),
  );
  const byExercise = new Map<string, RawSet[]>();
  for (const s of done)
    byExercise.set(s.exercise_id, [...(byExercise.get(s.exercise_id) ?? []), s]);
  const exercises = [...byExercise.entries()]
    .map(([exerciseId, sets]) => ({
      exerciseId,
      position: order.get(exerciseId) ?? 999,
      sets: nestDrops([...sets].sort((a, b) => a.set_index - b.set_index)),
    }))
    .sort((a, b) => a.position - b.position);
  return {
    id: raw.id,
    name: raw.day_name ?? '',
    startedAt: raw.started_at,
    endedAt: raw.ended_at,
    outOfOrder: raw.out_of_order,
    feeling: raw.feeling,
    notes: raw.notes,
    planId: raw.plan_id,
    planName: raw.workout_plans?.name ?? null,
    stats: sessionStats(raw),
    exercises,
  };
}

const SESSION_SELECT =
  'id, day_name, started_at, ended_at, out_of_order, feeling, notes, plan_id, plan_day_id, workout_plans(name), session_sets(exercise_id, set_index, drop_index, weight_kg, reps, duration_s, distance_m, completed_at, deleted_at), session_exercises(exercise_id, position, deleted_at)';

export const historyKeys = {
  all: ['history'] as const,
  last: ['history', 'last'] as const,
  month: (ym: string) => ['history', 'month', ym] as const,
  one: (id: string) => ['history', 'session', id] as const,
  exercise: (id: string) => ['history', 'exercise', id] as const,
};

function useTimeZone() {
  return useProfile().data?.timezone ?? deviceTimeZone();
}

/** Local date of the most recent finished workout, or null. */
export function useLastSessionDay() {
  const tz = useTimeZone();
  return useQuery({
    queryKey: historyKeys.last,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('workout_sessions')
        .select('started_at')
        .eq('status', 'done')
        .is('deleted_at', null)
        .order('started_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0] ? localDay(new Date(data[0].started_at), tz) : null;
    },
  });
}

/** Finished workouts of a month ("2026-10"), newest first. */
export function useMonthSessions(ym: string) {
  return useQuery({
    queryKey: historyKeys.month(ym),
    queryFn: async () => {
      const [y, m] = ym.split('-').map(Number);
      // A day of slack on each side covers any time zone; the screen filters by local day.
      const from = new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString();
      const to = new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString();
      const { data, error } = await getSupabase()
        .from('workout_sessions')
        .select(SESSION_SELECT)
        .eq('status', 'done')
        .is('deleted_at', null)
        .gte('started_at', from)
        .lt('started_at', to)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as RawSession[]).map(toSessionView);
    },
  });
}

export function useSessionDetail(id: string | undefined) {
  return useQuery({
    queryKey: historyKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('workout_sessions')
        .select(SESSION_SELECT)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return toSessionView(data as unknown as RawSession);
    },
  });
}

/** Recent sessions where an exercise was done (Exercise detail → "Recent sessions"). */
export function useExerciseSessions(exerciseId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: historyKeys.exercise(exerciseId ?? ''),
    enabled: !!exerciseId,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('session_sets')
        .select(
          'session_id, set_index, drop_index, weight_kg, reps, duration_s, distance_m, workout_sessions!inner(id, day_name, started_at, status, deleted_at)',
        )
        .eq('exercise_id', exerciseId!)
        .not('completed_at', 'is', null)
        .is('deleted_at', null)
        .eq('workout_sessions.status', 'done')
        .is('workout_sessions.deleted_at', null)
        .order('set_index');
      if (error) throw error;
      type Row = {
        session_id: string;
        set_index: number;
        drop_index?: number | null;
        drops?: Row[];
        weight_kg: number | null;
        reps: number | null;
        duration_s: number | null;
        distance_m: number | null;
        workout_sessions: { id: string; day_name: string | null; started_at: string };
      };
      const bySession = new Map<
        string,
        { id: string; name: string; startedAt: string; sets: Row[] }
      >();
      for (const r of data as unknown as Row[]) {
        const s = bySession.get(r.session_id) ?? {
          id: r.session_id,
          name: r.workout_sessions.day_name ?? '',
          startedAt: r.workout_sessions.started_at,
          sets: [],
        };
        s.sets.push(r);
        bySession.set(r.session_id, s);
      }
      return [...bySession.values()]
        .map((s) => ({ ...s, sets: nestDrops(s.sets) }))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit);
    },
  });
}
