import {
  exerciseChanges,
  groupScores,
  periodStart,
  weightedScore,
  type DailyE1rm,
  type Period,
} from '@/domain/progress';
import { strengthGroup, type Muscle } from '@/domain/muscles';
import { columns, type Row } from '@/lib/local-db';
import { getSupabase } from '@/lib/supabase';
import { optNum, optStr, round, type Input } from './args';

/**
 * The assistant's way into ALL the user's data, a piece at a time: list_data says what exists
 * (tables, columns, how many rows), query_data asks precise questions (filters, sorting, grouping
 * with count/sum/avg/min/max) and get_strength gives the Progress numbers. Everything runs on
 * the device's database, so asking is free; only the small answers go to the model.
 */

/** What each table holds, for the model. Tables not listed here are not readable. */
const ABOUT: Record<string, string> = {
  profiles: 'The user: name, birth date, sex, height, activity, experience, goal, diet mode.',
  user_settings: 'App settings: units, theme, accessibility, water glass size, reminders.',
  body_metrics: 'Check-ins by day: weight, body fat (and how measured), measurements, notes.',
  body_goals: 'Body goals from a day on: target weight and/or target body fat.',
  progress_photos: 'Progress photos taken (day and pose only; the pictures are not readable).',
  nutrition_goals: 'Daily calorie/macro/water targets, each valid from a day on.',
  food_logs: 'Foods eaten (tracking mode): day, meal, name, grams, kcal and macros.',
  daily_nutrition_totals: 'Calories and macros eaten per day (food logs + done fixed meals).',
  water_logs: 'Water drunk: day and ml (several entries a day).',
  fixed_meal_plans: 'Set-meal plans (fixed meals mode); one is active.',
  fixed_meals: 'The meals of a fixed meal plan, with kcal and macros.',
  fixed_meal_checks: 'Each day a fixed meal was done / adjusted / skipped.',
  foods: "Foods: the user's own (owner_id set), generic foods (source ciqual) and products (off).",
  food_servings: 'Serving sizes of foods (label and grams).',
  exercises: "Exercises: catalogue and the user's own, with muscle, equipment, log type.",
  workout_plans: 'Workout plans (status active / archived).',
  plan_days: 'Days of a workout plan, in order.',
  plan_exercises: 'Exercises of a plan day: target sets, reps, rest.',
  workout_sessions: 'Workouts: start/end time, plan day, feeling 1-5, notes, status (done counts).',
  session_exercises: 'Exercises done in a workout, in order.',
  session_sets: 'Sets of a workout: weight, reps, time, distance; completed_at set = done.',
  exercise_records: 'Per exercise: heaviest weight, best estimated 1RM, completed sets, best reps.',
  exercise_e1rm_daily: 'Per exercise and day: best estimated 1RM, best weight, sets, volume.',
};
const VIEW_COLUMNS: Record<string, string[]> = {
  daily_nutrition_totals: ['day', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
  exercise_records: [
    'exercise_id',
    'actual_max_kg',
    'est_1rm_kg',
    'completed_sets',
    'best_reps',
    'best_duration_s',
  ],
  exercise_e1rm_daily: [
    'exercise_id',
    'day',
    'best_e1rm_kg',
    'best_weight_kg',
    'sets',
    'volume_kg',
  ],
};
/** Columns that tell the model nothing (ids of the account, sync bookkeeping, file paths). */
const HIDDEN = new Set(['user_id', 'updated_at', 'deleted_at', 'storage_path', 'image_path']);

export const READABLE = Object.keys(ABOUT);
const columnsOf = (table: string) =>
  (VIEW_COLUMNS[table] ?? columns[table] ?? []).filter((c) => !HIDDEN.has(c));

const MAX_ROWS = 200;
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'contains', 'in', 'is_null', 'not_null'] as const;
type Op = (typeof OPS)[number];
const FNS = ['count', 'sum', 'avg', 'min', 'max'] as const;
type Fn = (typeof FNS)[number];

/** All live rows of a table (or view) on the device; exercise rows get their name added. */
async function load(table: string): Promise<Row[]> {
  let q = getSupabase()
    .from(table as 'profiles')
    .select('*');
  if (!VIEW_COLUMNS[table]) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

async function exerciseNames(): Promise<Map<string, string>> {
  const rows = await load('exercises');
  return new Map(rows.map((r) => [String(r.id), String(r.name)]));
}

export async function listData(): Promise<unknown> {
  const tables = await Promise.all(
    READABLE.map(async (t) => {
      const rows = t === 'foods' || t === 'exercises' ? null : (await load(t)).length;
      return {
        table: t,
        about: ABOUT[t],
        columns: columnsOf(t),
        ...(rows != null ? { rows } : {}),
      };
    }),
  );
  return {
    tables,
    tip: 'Query with query_data. Prefer group_by + aggregates over reading many rows. Rows with exercise_id also get exercise_name.',
  };
}

const asNumber = (v: unknown) => (v == null || v === '' ? null : Number(v));
const compare = (a: unknown, b: unknown): number => {
  const x = asNumber(a);
  const y = asNumber(b);
  if (x != null && y != null && !Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return String(a ?? '').localeCompare(String(b ?? ''));
};

function matches(row: Row, column: string, op: Op, value: unknown): boolean {
  const v = row[column];
  switch (op) {
    case 'is_null':
      return v == null;
    case 'not_null':
      return v != null;
    case 'contains':
      return String(v ?? '')
        .toLowerCase()
        .includes(String(value ?? '').toLowerCase());
    case 'in':
      return Array.isArray(value) && value.some((x) => compare(v, x) === 0);
    default: {
      if (v == null) return false;
      const c = compare(v, value);
      return op === '='
        ? c === 0
        : op === '!='
          ? c !== 0
          : op === '>'
            ? c > 0
            : op === '>='
              ? c >= 0
              : op === '<'
                ? c < 0
                : c <= 0;
    }
  }
}

function aggregate(rows: Row[], fn: Fn, column: string | undefined): number | null {
  if (fn === 'count') return column ? rows.filter((r) => r[column] != null).length : rows.length;
  const values = rows
    .map((r) => asNumber(r[column!]))
    .filter((x): x is number => x != null && !Number.isNaN(x));
  if (values.length === 0) return null;
  if (fn === 'sum')
    return round(
      values.reduce((a, b) => a + b, 0),
      2,
    );
  if (fn === 'avg') return round(values.reduce((a, b) => a + b, 0) / values.length, 2);
  return fn === 'min' ? Math.min(...values) : Math.max(...values);
}

export async function queryData(input: Input): Promise<unknown> {
  const table = optStr(input, 'table', 40);
  if (!table || !READABLE.includes(table))
    throw new Error(`"table" must be one of: ${READABLE.join(', ')} (see list_data)`);
  const known = new Set([
    ...columnsOf(table),
    ...(columnsOf(table).includes('exercise_id') ? ['exercise_name'] : []),
  ]);
  const col = (c: unknown, what: string): string => {
    if (typeof c !== 'string' || !known.has(c))
      throw new Error(
        `${what}: unknown column "${String(c)}" of ${table}. Columns: ${[...known].join(', ')}`,
      );
    return c;
  };

  let rows = await load(table);
  if (known.has('exercise_name')) {
    const names = await exerciseNames();
    rows = rows.map((r) => ({ ...r, exercise_name: names.get(String(r.exercise_id)) ?? null }));
  }

  const where = input.where ?? [];
  if (!Array.isArray(where)) throw new Error('"where" must be a list of {column, op, value}');
  for (const w of where as Record<string, unknown>[]) {
    const c = col(w?.column, 'where');
    const op = w.op as Op;
    if (!OPS.includes(op)) throw new Error(`where: "op" must be one of ${OPS.join(', ')}`);
    rows = rows.filter((r) => matches(r, c, op, w.value));
  }
  const matching = rows.length;

  const groupBy = ((input.group_by ?? []) as unknown[]).map((c) => col(c, 'group_by'));
  const aggs = ((input.aggregates ?? []) as Record<string, unknown>[]).map((a) => {
    const fn = a?.fn as Fn;
    if (!FNS.includes(fn)) throw new Error(`aggregates: "fn" must be one of ${FNS.join(', ')}`);
    const column = a.column == null ? undefined : col(a.column, 'aggregates');
    if (fn !== 'count' && !column) throw new Error(`aggregates: ${fn} needs a "column"`);
    return { fn, column, as: column ? `${fn}_${column}` : fn };
  });

  let out: Row[];
  if (groupBy.length || aggs.length) {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = JSON.stringify(groupBy.map((g) => r[g] ?? null));
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    if (groups.size === 0 && !groupBy.length) groups.set('[]', []);
    out = [...groups].map(([key, list]) => {
      const values = JSON.parse(key) as unknown[];
      const row: Row = Object.fromEntries(groupBy.map((g, i) => [g, values[i]]));
      if (groupBy.includes('exercise_id') && known.has('exercise_name'))
        row.exercise_name = list[0]?.exercise_name ?? null;
      for (const a of aggs.length ? aggs : [{ fn: 'count' as Fn, column: undefined, as: 'count' }])
        row[a.as] = aggregate(list, a.fn, a.column);
      return row;
    });
  } else {
    const pick = input.columns
      ? (input.columns as unknown[]).map((c) => col(c, 'columns'))
      : [...known];
    out = rows.map((r) => Object.fromEntries(pick.map((c) => [c, r[c] ?? null])));
  }

  const order = (input.order_by ?? []) as Record<string, unknown>[];
  if (!Array.isArray(order)) throw new Error('"order_by" must be a list of {column, desc}');
  if (order.length) {
    const outCols = new Set(out.flatMap((r) => Object.keys(r)));
    const keys = order.map((o) => {
      const c = String(o?.column ?? '');
      if (!outCols.has(c) && !known.has(c)) throw new Error(`order_by: unknown column "${c}"`);
      return { c, desc: o.desc === true };
    });
    out.sort((a, b) => {
      for (const k of keys) {
        const d = compare(a[k.c], b[k.c]);
        if (d !== 0) return k.desc ? -d : d;
      }
      return 0;
    });
  }

  const limit = Math.round(optNum(input, 'limit', 1, MAX_ROWS) ?? 50);
  // Empty values are left out: shorter answers, same information.
  const rowsOut = out
    .slice(0, limit)
    .map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== '')));
  return {
    matching_rows: matching,
    ...(groupBy.length || aggs.length ? { groups: out.length } : {}),
    returned: rowsOut.length,
    ...(out.length > rowsOut.length
      ? {
          note: `${out.length - rowsOut.length} more not shown: narrow "where", group, or raise "limit" (max ${MAX_ROWS}).`,
        }
      : {}),
    rows: rowsOut,
  };
}

/** The Progress screen's strength numbers for a period: score, groups, every exercise. */
export async function strengthReport(input: Input, today: string): Promise<unknown> {
  const period = (optStr(input, 'period', 4) ?? '12w') as Period;
  if (!['4w', '12w', '1y', 'all'].includes(period))
    throw new Error('"period" must be 4w, 12w, 1y or all');
  const [daily, exercises, records] = await Promise.all([
    load('exercise_e1rm_daily'),
    load('exercises'),
    load('exercise_records'),
  ]);
  const rows: DailyE1rm[] = daily
    .map((r) => ({
      exerciseId: String(r.exercise_id),
      day: String(r.day),
      bestE1rmKg: r.best_e1rm_kg != null ? Number(r.best_e1rm_kg) : null,
      sets: Number(r.sets),
      volumeKg: Number(r.volume_kg ?? 0),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const from = periodStart(period, today, rows[0]?.day ?? null);
  const byId = new Map(exercises.map((e) => [String(e.id), e]));
  const muscleOf = (id: string) => byId.get(id)?.primary_muscle as Muscle | undefined;
  const changes = exerciseChanges(rows, from, today);
  const record = new Map(records.map((r) => [String(r.exercise_id), r]));
  return {
    period: { from, to: today },
    strength_score_pct: weightedScore(changes),
    by_group: groupScores(changes, muscleOf),
    exercises: [...changes]
      .sort((a, b) => b.sets - a.sets)
      .map((c) => ({
        exercise: byId.get(c.exerciseId)?.name ?? c.exerciseId,
        group: muscleOf(c.exerciseId) ? strengthGroup(muscleOf(c.exerciseId)!) : null,
        e1rm_first_kg: c.firstKg,
        e1rm_last_kg: c.lastKg,
        change_pct: c.pctChange,
        sets: c.sets,
        heaviest_ever_kg: asNumber(record.get(c.exerciseId)?.actual_max_kg),
        best_e1rm_ever_kg: asNumber(record.get(c.exerciseId)?.est_1rm_kg),
      })),
    rule: 'Score = set-weighted average % change of estimated 1RM (Epley, reps <= 12), exercises done on 2+ days in the period.',
  };
}
