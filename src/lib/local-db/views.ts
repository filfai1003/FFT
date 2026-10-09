import { deviceTimeZone, localDay } from '../../domain/day';
import { epley1RM } from '../../domain/strength';
import type { Row } from './schema';

type Tables = Record<string, Row[]>;

export const viewNames = [
  'daily_nutrition_totals',
  'exercise_records',
  'exercise_e1rm_daily',
] as const;
export const isView = (name: string) => (viewNames as readonly string[]).includes(name);

const alive = (r: Row) => r.deleted_at == null;
const n = (v: unknown) => (v == null ? 0 : Number(v));

/** The three SQL views of the database, computed from the tables (same rules as the SQL). */
export function computeView(name: string, t: Tables, userId: string): Row[] {
  if (name === 'daily_nutrition_totals') return dailyNutritionTotals(t, userId);
  const sets = doneSets(t);
  if (name === 'exercise_records') return exerciseRecords(sets, userId);
  if (name === 'exercise_e1rm_daily') return exerciseE1rmDaily(sets, t, userId);
  throw new Error(`Unknown view ${name}`);
}

function dailyNutritionTotals(t: Tables, userId: string): Row[] {
  const byDay = new Map<
    string,
    { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
  >();
  const add = (r: Row) => {
    const day = String(r.day);
    const cur = byDay.get(day) ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    cur.kcal += n(r.kcal);
    cur.protein_g += n(r.protein_g);
    cur.carbs_g += n(r.carbs_g);
    cur.fat_g += n(r.fat_g);
    byDay.set(day, cur);
  };
  for (const r of t.food_logs ?? []) if (alive(r)) add(r);
  for (const r of t.fixed_meal_checks ?? [])
    if (alive(r) && (r.status === 'done' || r.status === 'adjusted')) add(r);
  return [...byDay].map(([day, v]) => ({ user_id: userId, day, ...v }));
}

type DoneSet = { set: Row; session: Row };

/** Completed sets of finished workouts (what every progress view is built from). */
function doneSets(t: Tables): DoneSet[] {
  const sessions = new Map<string, Row>();
  for (const s of t.workout_sessions ?? [])
    if (s.status === 'done' && alive(s)) sessions.set(String(s.id), s);
  const out: DoneSet[] = [];
  for (const set of t.session_sets ?? []) {
    const session = sessions.get(String(set.session_id));
    if (session && alive(set) && set.completed_at != null) out.push({ set, session });
  }
  return out;
}

const maxOf = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
};

const e1rm = (set: Row) =>
  set.weight_kg == null || set.reps == null || Number(set.weight_kg) <= 0
    ? null
    : epley1RM(Number(set.weight_kg), Number(set.reps));

function exerciseRecords(sets: DoneSet[], userId: string): Row[] {
  const groups = new Map<string, Row[]>();
  for (const { set } of sets)
    groups.set(String(set.exercise_id), [...(groups.get(String(set.exercise_id)) ?? []), set]);
  return [...groups].map(([exercise_id, rows]) => ({
    user_id: userId,
    exercise_id,
    actual_max_kg: maxOf(rows.filter((s) => n(s.weight_kg) > 0).map((s) => n(s.weight_kg))),
    est_1rm_kg: maxOf(rows.map(e1rm)),
    completed_sets: rows.length,
    best_reps: maxOf(rows.map((s) => (s.reps == null ? null : n(s.reps)))),
    best_duration_s: maxOf(rows.map((s) => (s.duration_s == null ? null : n(s.duration_s)))),
  }));
}

function exerciseE1rmDaily(sets: DoneSet[], t: Tables, userId: string): Row[] {
  const tz = String((t.profiles ?? [])[0]?.timezone ?? deviceTimeZone());
  const groups = new Map<string, { exercise_id: string; day: string; rows: Row[] }>();
  for (const { set, session } of sets) {
    const day = localDay(new Date(String(session.started_at)), tz);
    const key = `${set.exercise_id}|${day}`;
    const g = groups.get(key) ?? { exercise_id: String(set.exercise_id), day, rows: [] };
    g.rows.push(set);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ exercise_id, day, rows }) => ({
    user_id: userId,
    exercise_id,
    day,
    best_e1rm_kg: maxOf(rows.map(e1rm)),
    sets: rows.length,
    best_weight_kg: maxOf(rows.filter((s) => n(s.weight_kg) > 0).map((s) => n(s.weight_kg))),
    volume_kg: rows
      .filter((s) => n(s.weight_kg) > 0 && n(s.reps) > 0)
      .reduce((a, s) => a + n(s.weight_kg) * n(s.reps), 0),
  }));
}

/** `last_sets`: the sets of the latest finished workout of each exercise ("PREVIOUS" column). */
export function lastSets(t: Tables, exerciseIds: string[]): Row[] {
  const sets = doneSets(t).filter(({ set }) => exerciseIds.includes(String(set.exercise_id)));
  const latest = new Map<string, DoneSet>();
  for (const x of sets) {
    const cur = latest.get(String(x.set.exercise_id));
    if (!cur || String(x.session.started_at) > String(cur.session.started_at))
      latest.set(String(x.set.exercise_id), x);
  }
  return sets
    .filter((x) => latest.get(String(x.set.exercise_id))?.session.id === x.session.id)
    .map((x) => x.set)
    .sort(
      (a, b) =>
        String(a.exercise_id).localeCompare(String(b.exercise_id)) ||
        n(a.set_index) - n(b.set_index),
    )
    .map((s) => ({
      exercise_id: s.exercise_id,
      set_index: s.set_index,
      weight_kg: s.weight_kg,
      reps: s.reps,
      duration_s: s.duration_s,
      distance_m: s.distance_m,
    }));
}
