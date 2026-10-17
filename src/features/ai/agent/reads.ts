import { addDays, localDay } from '@/domain/day';
import { rankFoods, type Food } from '@/features/diet/foods';
import { dietDayStatus, goalForDay, targetForDay } from '@/domain/diet';
import { fetchFixedPlan } from '@/features/diet/fixed';
import { fetchGoals } from '@/features/diet/log';
import { fetchPlans } from '@/features/train/plans';
import { getSupabase } from '@/lib/supabase';
import { exportDiet, exportWorkoutPlan } from '../context';
import { round } from './args';

/** What the read tools need to know about "now". */
export type ReadContext = { today: string; timeZone: string; dietMode: string | null };

type Row = Record<string, unknown>;
const n = (v: unknown) => (v == null ? 0 : Number(v));

async function rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** Finished workouts started on or around [from, to], with their local day. */
async function sessionsBetween(ctx: ReadContext, from: string, to: string) {
  const list = await rows(
    getSupabase()
      .from('workout_sessions')
      .select('id, day_name, started_at, ended_at, out_of_order')
      .eq('status', 'done')
      .is('deleted_at', null)
      .gte('started_at', new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString())
      .lte('started_at', new Date(`${addDays(to, 2)}T00:00:00Z`).toISOString())
      .order('started_at'),
  );
  return list
    .map((s) => ({
      id: String(s.id),
      name: String(s.day_name ?? ''),
      day: localDay(new Date(String(s.started_at)), ctx.timeZone),
      minutes:
        s.ended_at != null
          ? Math.round(
              (new Date(String(s.ended_at)).getTime() - new Date(String(s.started_at)).getTime()) /
                60000,
            )
          : null,
      outOfOrder: s.out_of_order === true,
    }))
    .filter((s) => s.day >= from && s.day <= to);
}

const macroText = (r: Row) => ({
  kcal: round(n(r.kcal), 0),
  protein_g: round(n(r.protein_g)),
  carbs_g: round(n(r.carbs_g)),
  fat_g: round(n(r.fat_g)),
});

/** One day in detail: target, what was eaten, meals followed, water and workouts. */
export async function readDay(ctx: ReadContext, day: string) {
  const supabase = getSupabase();
  const [goals, plan, logs, checks, totalsRows, water, sessions] = await Promise.all([
    fetchGoals(),
    fetchFixedPlan(),
    rows(
      supabase
        .from('food_logs')
        .select('id, meal, name, quantity_label, grams, kcal, protein_g, carbs_g, fat_g')
        .eq('day', day)
        .is('deleted_at', null)
        .order('created_at'),
    ),
    rows(
      supabase
        .from('fixed_meal_checks')
        .select('fixed_meal_id, status, kcal, protein_g, carbs_g, fat_g')
        .eq('day', day)
        .is('deleted_at', null),
    ),
    rows(
      supabase
        .from('daily_nutrition_totals')
        .select('kcal, protein_g, carbs_g, fat_g')
        .eq('day', day),
    ),
    rows(supabase.from('water_logs').select('ml').eq('day', day).is('deleted_at', null)),
    sessionsBetween(ctx, day, day),
  ]);
  const goal = goalForDay(goals, day);
  const target = goal ? targetForDay(goal, sessions.length > 0) : null;
  const totals = totalsRows[0] ? macroText(totalsRows[0]) : macroText({});
  const checkByMeal = new Map(checks.map((c) => [String(c.fixed_meal_id), c]));
  return {
    day,
    is_today: day === ctx.today,
    target: target
      ? {
          kcal: target.kcal,
          protein_g: target.protein,
          carbs_g: target.carbs,
          fat_g: target.fat,
          water_ml: goal?.waterMl ?? null,
        }
      : null,
    eaten: totals,
    diet_status: target ? dietDayStatus(totals.kcal, target.kcal) : 'none',
    food_log: logs.map((l) => ({
      log_id: l.id,
      meal: l.meal,
      name: l.name,
      amount: l.quantity_label ?? (l.grams != null ? `${l.grams} g` : null),
      ...macroText(l),
    })),
    fixed_meals: (plan?.meals ?? []).map((m) => {
      const c = checkByMeal.get(m.id);
      return {
        name: m.name,
        planned_kcal: m.kcal,
        status: c ? String(c.status) : 'pending',
        ...(c && c.status === 'adjusted' ? { eaten: macroText(c) } : {}),
      };
    }),
    water_ml: water.reduce((a, w) => a + n(w.ml), 0),
    workouts: sessions.map((s) => ({ name: s.name, minutes: s.minutes })),
  };
}

/** A range of days: calories against the target, workouts done, and the summary of both. */
export async function readHistory(ctx: ReadContext, days: number) {
  const from = addDays(ctx.today, -(days - 1));
  const supabase = getSupabase();
  const [goals, totals, sessions, water] = await Promise.all([
    fetchGoals(),
    rows(
      supabase
        .from('daily_nutrition_totals')
        .select('day, kcal, protein_g, carbs_g, fat_g')
        .gte('day', from)
        .lte('day', ctx.today),
    ),
    sessionsBetween(ctx, from, ctx.today),
    rows(
      supabase
        .from('water_logs')
        .select('day, ml')
        .gte('day', from)
        .lte('day', ctx.today)
        .is('deleted_at', null),
    ),
  ]);
  const eatenByDay = new Map(totals.map((t) => [String(t.day), t]));
  const trainedDays = new Set(sessions.map((s) => s.day));
  const waterByDay = new Map<string, number>();
  for (const w of water)
    waterByDay.set(String(w.day), (waterByDay.get(String(w.day)) ?? 0) + n(w.ml));

  const list = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const goal = goalForDay(goals, day);
    const target = goal ? targetForDay(goal, trainedDays.has(day)) : null;
    const eaten = eatenByDay.get(day);
    const kcal = eaten ? round(n(eaten.kcal), 0) : 0;
    list.push({
      day,
      eaten_kcal: kcal,
      protein_g: eaten ? round(n(eaten.protein_g)) : 0,
      target_kcal: target?.kcal ?? null,
      diet: target ? dietDayStatus(kcal, target.kcal) : 'none',
      trained: trainedDays.has(day),
      water_ml: waterByDay.get(day) ?? 0,
    });
  }
  const logged = list.filter((d) => d.diet !== 'none');
  return {
    from,
    to: ctx.today,
    summary: {
      days: days,
      days_with_food_logged: logged.length,
      days_on_target: list.filter((d) => d.diet === 'onTarget').length,
      average_kcal_on_logged_days: logged.length
        ? Math.round(logged.reduce((a, d) => a + d.eaten_kcal, 0) / logged.length)
        : null,
      workouts: sessions.length,
      days_trained: trainedDays.size,
    },
    days: list,
    workouts: sessions.map((s) => ({ day: s.day, name: s.name, minutes: s.minutes })),
  };
}

/** Weight, body fat and measurements, newest first. */
export async function readBody(ctx: ReadContext, days: number) {
  const from = addDays(ctx.today, -(days - 1));
  const list = await rows(
    getSupabase()
      .from('body_metrics')
      .select(
        'id, day, weight_kg, body_fat_pct, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm, notes',
      )
      .gte('day', from)
      .is('deleted_at', null)
      .order('day', { ascending: false })
      .limit(120),
  );
  return {
    entries: list.map((e) => ({
      day: e.day,
      weight_kg: e.weight_kg != null ? n(e.weight_kg) : null,
      body_fat_pct: e.body_fat_pct != null ? n(e.body_fat_pct) : null,
      waist_cm: e.waist_cm != null ? n(e.waist_cm) : null,
      hips_cm: e.hips_cm != null ? n(e.hips_cm) : null,
      chest_cm: e.chest_cm != null ? n(e.chest_cm) : null,
      arm_cm: e.arm_cm != null ? n(e.arm_cm) : null,
      thigh_cm: e.thigh_cm != null ? n(e.thigh_cm) : null,
      notes: e.notes ?? null,
    })),
  };
}

/** The last finished workouts with the sets that were done. */
export async function readWorkouts(limit: number) {
  const supabase = getSupabase();
  const sessions = await rows(
    supabase
      .from('workout_sessions')
      .select('id, day_name, started_at, ended_at, feeling, notes')
      .eq('status', 'done')
      .is('deleted_at', null)
      .order('started_at', { ascending: false })
      .limit(limit),
  );
  if (sessions.length === 0) return { workouts: [] };
  const ids = sessions.map((s) => String(s.id));
  const [sets, exercises] = await Promise.all([
    rows(
      supabase
        .from('session_sets')
        .select(
          'session_id, exercise_id, set_index, weight_kg, reps, duration_s, distance_m, completed_at',
        )
        .in('session_id', ids)
        .is('deleted_at', null)
        .order('set_index'),
    ),
    rows(supabase.from('exercises').select('id, name').is('deleted_at', null)),
  ]);
  const names = new Map(exercises.map((e) => [String(e.id), String(e.name)]));
  return {
    workouts: sessions.map((s) => {
      const mine = sets.filter((x) => x.session_id === s.id && x.completed_at != null);
      const byExercise = new Map<string, string[]>();
      for (const set of mine) {
        const name = names.get(String(set.exercise_id)) ?? 'Exercise';
        const text =
          set.weight_kg != null
            ? `${n(set.weight_kg)} kg x ${n(set.reps)}`
            : set.duration_s != null
              ? `${n(set.duration_s)} s`
              : set.distance_m != null
                ? `${n(set.distance_m)} m`
                : `${n(set.reps)} reps`;
        byExercise.set(name, [...(byExercise.get(name) ?? []), text]);
      }
      return {
        started_at: s.started_at,
        name: s.day_name,
        feeling: s.feeling ?? null,
        exercises: [...byExercise].map(([name, list]) => ({ name, sets: list })),
      };
    }),
  };
}

/**
 * Your own foods, or a search among all the foods the app has. Without `includeOwn` (the diet is
 * not shared with the coach) only the app's catalogue is searched.
 */
export async function readFoods(
  query: string | undefined,
  ownerId: string | null,
  includeOwn = true,
) {
  const supabase = getSupabase();
  let q = supabase
    .from('foods')
    .select(
      'id, owner_id, name, brand, barcode, kcal_100g, protein_100g, carbs_100g, fat_100g, source',
    )
    .is('deleted_at', null);
  if (!includeOwn) q = q.is('owner_id', null);
  if (query) q = q.ilike('name', `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  else if (ownerId) q = q.eq('owner_id', ownerId);
  const found = await rows(q.order('name').limit(query ? 200 : 25));
  // Same order as the app's search: the user's own foods, then the closest names.
  const list = query
    ? (rankFoods(found as unknown as Food[], query) as unknown as typeof found).slice(0, 25)
    : found;
  return {
    foods: list.map((f) => ({
      food_id: f.id,
      name: f.name,
      brand: f.brand ?? null,
      mine: f.owner_id != null && f.owner_id === ownerId,
      per_100g: {
        kcal: n(f.kcal_100g),
        protein_g: n(f.protein_100g),
        carbs_g: n(f.carbs_100g),
        fat_g: n(f.fat_100g),
      },
    })),
  };
}

type Shared = { diet: boolean; training: boolean };

/** One day (readDay) with only what the user shared: diet fields and/or workouts. */
export function dayShared(day: Awaited<ReturnType<typeof readDay>>, access: Shared) {
  const { target, eaten, diet_status, food_log, fixed_meals, water_ml, workouts, ...rest } = day;
  return {
    ...rest,
    ...(access.diet ? { target, eaten, diet_status, food_log, fixed_meals, water_ml } : {}),
    ...(access.training ? { workouts } : {}),
  };
}

/** A range of days (readHistory) with only what the user shared. */
export function historyShared(h: Awaited<ReturnType<typeof readHistory>>, access: Shared) {
  const { summary } = h;
  return {
    from: h.from,
    to: h.to,
    summary: {
      days: summary.days,
      ...(access.diet
        ? {
            days_with_food_logged: summary.days_with_food_logged,
            days_on_target: summary.days_on_target,
            average_kcal_on_logged_days: summary.average_kcal_on_logged_days,
          }
        : {}),
      ...(access.training
        ? { workouts: summary.workouts, days_trained: summary.days_trained }
        : {}),
    },
    days: h.days.map((d) => ({
      day: d.day,
      ...(access.diet
        ? {
            eaten_kcal: d.eaten_kcal,
            protein_g: d.protein_g,
            target_kcal: d.target_kcal,
            diet: d.diet,
            water_ml: d.water_ml,
          }
        : {}),
      ...(access.training ? { trained: d.trained } : {}),
    })),
    ...(access.training ? { workouts: h.workouts } : {}),
  };
}

export async function readPlans() {
  const plans = await fetchPlans();
  return { workout_plans: plans.filter((p) => p.status !== 'archived').map(exportWorkoutPlan) };
}

export async function readDiet(ctx: ReadContext) {
  const [goals, plan] = await Promise.all([fetchGoals(), fetchFixedPlan()]);
  const goal = goalForDay(goals, ctx.today);
  return {
    diet_plan: exportDiet(goal, plan, ctx.dietMode),
    maintenance_kcal: goal?.maintenanceKcal ?? null,
    training_day_bonus_kcal: goal?.trainingDayBonusKcal ?? 0,
    water_goal_ml: goal?.waterMl ?? null,
  };
}

/** Everything the AI is shown in manual mode (it cannot call tools there): one JSON text. */
export async function buildSnapshot(ctx: ReadContext, ownerId: string | null): Promise<string> {
  const [today, history, body, workouts, plans, diet, foods] = await Promise.all([
    readDay(ctx, ctx.today),
    readHistory(ctx, 14),
    readBody(ctx, 60),
    readWorkouts(5),
    readPlans(),
    readDiet(ctx),
    readFoods(undefined, ownerId),
  ]);
  return JSON.stringify({
    today: ctx.today,
    today_status: today,
    last_14_days: history,
    body_last_60_days: body.entries,
    recent_workouts: workouts.workouts,
    workout_plans: plans.workout_plans,
    diet,
    my_foods: foods.foods,
  });
}
