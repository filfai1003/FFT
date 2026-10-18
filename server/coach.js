// The in-app coach's tools, for the API and MCP: the same names, descriptions and rules as
// src/features/ai/agent/use-tools.ts. The logic that decides anything (what a question returns,
// strength, plan format, calorie safety, meal split) is imported from src/domain, the very code
// the app runs; this file only reads and writes the online database (as the user: row level
// security applies). Loaded with ts-resolve.mjs (the domain files are TypeScript).
import { createHash, randomUUID } from 'node:crypto';
import {
  DATA_TOOL_SPECS,
  isView,
  listData,
  queryData,
  READABLE,
  strengthReport,
} from '../src/domain/data-tools.ts';
import { checkAsPlanned } from '../src/domain/diet.ts';
import {
  macroKcal,
  MIN_DAILY_KCAL,
  rebalanceMeals,
  targetProblem,
} from '../src/domain/nutrition.ts';
import { matchExercise, normalizeName, parseBundle } from '../src/domain/plan-import.ts';

export class ToolError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new ToolError(m);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- arguments (same limits as the app's args.ts) -------------------------------------------
const optStr = (i, k, max = 200) => {
  const v = i[k];
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') throw bad(`"${k}" must be text`);
  if (v.length > max) throw bad(`"${k}" is too long (max ${max} characters)`);
  return v.trim();
};
const str = (i, k, max) => {
  const v = optStr(i, k, max);
  if (!v) throw bad(`"${k}" is required`);
  return v;
};
const optNum = (i, k, min, max) => {
  const v = i[k];
  if (v == null || v === '') return undefined;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`"${k}" must be a number`);
  if (n < min || n > max) throw bad(`"${k}" must be between ${min} and ${max}`);
  return n;
};
const num = (i, k, min, max) => {
  const v = optNum(i, k, min, max);
  if (v == null) throw bad(`"${k}" is required`);
  return v;
};
const dayArg = (i, k, fallback) => {
  const v = optStr(i, k, 10);
  if (!v) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
    throw bad(`"${k}" must be a date like 2026-10-13`);
  return v;
};
const id = (i, k) => {
  const v = str(i, k, 60);
  if (!UUID.test(v)) throw bad(`"${k}" must be an id`);
  return v;
};
const N = (v) => (v == null ? null : Number(v));
const dayOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Same as the app's stableId (lib/uuid.ts): one row per (user, purpose), e.g. a goal per day. */
export function stableId(userId, purpose) {
  const b = createHash('sha256')
    .update(`${userId}:${purpose}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  b[12] = '4';
  b[16] = '8';
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// --- the online database as a data-tools source -----------------------------------------------
let columnCache = null;
async function dataSource(q) {
  if (!columnCache) {
    const rows = await q(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' order by ordinal_position`,
    );
    columnCache = new Map();
    for (const r of rows)
      columnCache.set(r.table_name, [...(columnCache.get(r.table_name) ?? []), r.column_name]);
  }
  return {
    columns: (t) => columnCache.get(t) ?? [],
    load: async (t) => {
      if (!READABLE.includes(t) && t !== 'exercises') throw bad(`not a readable table: ${t}`);
      return q(`select * from public.${t}${isView(t) ? '' : ' where deleted_at is null'}`);
    },
  };
}

// --- reads used by several tools --------------------------------------------------------------
async function goalForToday(q, today) {
  const [g] = await q(
    `select * from public.nutrition_goals where deleted_at is null and valid_from <= $1
     order by valid_from desc, created_at desc limit 1`,
    [today],
  );
  return g
    ? {
        kcal: N(g.kcal),
        proteinG: N(g.protein_g),
        carbsG: N(g.carbs_g),
        fatG: N(g.fat_g),
        trainingDayBonusKcal: N(g.training_day_bonus_kcal) ?? 0,
        maintenanceKcal: N(g.maintenance_kcal),
        waterMl: N(g.water_ml),
      }
    : null;
}

async function fixedPlan(q) {
  const [plan] = await q(
    `select id, name, workout_after_meal_id from public.fixed_meal_plans
     where deleted_at is null and active order by created_at desc limit 1`,
  );
  if (!plan) return null;
  const meals = await q(
    `select id, name, kcal, protein_g, carbs_g, fat_g, description, is_main from public.fixed_meals
     where deleted_at is null and plan_id = $1 order by position`,
    [plan.id],
  );
  return {
    id: plan.id,
    name: plan.name,
    workoutAfterMealId: plan.workout_after_meal_id,
    meals: meals.map((m) => ({
      id: m.id,
      name: m.name,
      kcal: N(m.kcal),
      proteinG: N(m.protein_g),
      carbsG: N(m.carbs_g),
      fatG: N(m.fat_g),
      description: m.description ?? '',
      isMain: m.is_main,
    })),
  };
}

async function plans(q) {
  const rows = await q(
    `select p.id, p.name, p.goal, p.status,
       coalesce((select json_agg(json_build_object(
         'id', d.id, 'name', d.name, 'position', d.position,
         'exercises', coalesce((select json_agg(json_build_object(
             'exerciseId', e.exercise_id, 'exercise', x.name, 'position', e.position,
             'sets', e.target_sets, 'reps', e.target_reps, 'rest_s', e.rest_s, 'notes', e.notes,
             'superset_with_next', e.superset_with_next,
             'drop_on', e.drop_on, 'drop_reps', e.drop_reps)
             order by e.position)
           from public.plan_exercises e join public.exercises x on x.id = e.exercise_id
           where e.plan_day_id = d.id and e.deleted_at is null), '[]'::json))
         order by d.position)
         from public.plan_days d where d.plan_id = p.id and d.deleted_at is null), '[]'::json) as days
     from public.workout_plans p where p.deleted_at is null order by p.created_at`,
  );
  return rows;
}

/** A plan in the exchange format (same as the app's exportWorkoutPlan). */
const exportPlan = (p) => ({
  id: p.id,
  name: p.name,
  days: p.days.map((d) => ({
    name: d.name,
    exercises: d.exercises.map((e) => ({
      exercise: e.exercise,
      sets: e.sets,
      reps: e.reps,
      rest_s: e.rest_s,
      notes: e.notes ?? '',
      ...(e.superset_with_next ? { superset_with_next: true } : {}),
      ...(e.drop_reps?.length ? { drops: { on: e.drop_on ?? 'last', reps: e.drop_reps } } : {}),
    })),
  })),
});

async function ownFood(q, foodId, userId) {
  const [f] = await q(`select * from public.foods where id = $1 and deleted_at is null`, [foodId]);
  if (!f) throw new ToolError('food not found', 404);
  if (f.owner_id !== userId) throw bad('Only foods you created can be changed.');
  return f;
}

async function saveGoal(q, userId, g) {
  await q(
    `insert into public.nutrition_goals
       (id, user_id, valid_from, kcal, protein_g, carbs_g, fat_g, training_day_bonus_kcal, maintenance_kcal, water_ml)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (id) do update set kcal = excluded.kcal, protein_g = excluded.protein_g,
       carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
       training_day_bonus_kcal = excluded.training_day_bonus_kcal,
       maintenance_kcal = excluded.maintenance_kcal, water_ml = excluded.water_ml, deleted_at = null`,
    [
      stableId(userId, `goal-${g.validFrom}`),
      userId,
      g.validFrom,
      g.kcal,
      g.proteinG,
      g.carbsG,
      g.fatG,
      g.trainingDayBonusKcal,
      g.maintenanceKcal,
      g.waterMl,
    ],
  );
}

const foodSchema = {
  name: { type: 'string', description: 'Name of the food.' },
  brand: { type: 'string', description: 'Brand (optional).' },
  barcode: { type: 'string', description: 'Barcode digits (optional).' },
  kcal_100g: { type: 'number', description: 'Energy per 100 g, in kcal.' },
  protein_100g: { type: 'number', description: 'Protein per 100 g, in grams.' },
  carbs_100g: { type: 'number', description: 'Carbohydrates per 100 g, in grams.' },
  fat_100g: { type: 'number', description: 'Fat per 100 g, in grams.' },
  sugars_100g: { type: 'number', description: 'Of which sugars per 100 g (optional).' },
  saturates_100g: { type: 'number', description: 'Of which saturated fat per 100 g (optional).' },
  fiber_100g: { type: 'number', description: 'Fibre per 100 g (optional).' },
  salt_100g: { type: 'number', description: 'Salt per 100 g (optional).' },
  portions: {
    type: 'array',
    description: 'Named portions, e.g. "1 slice" = 30 g (optional).',
    items: {
      type: 'object',
      properties: { label: { type: 'string' }, grams: { type: 'number' } },
      required: ['label', 'grams'],
    },
  },
};
const per100Args = (i) => ({
  kcal_100g: optNum(i, 'kcal_100g', 0, 1000),
  protein_100g: optNum(i, 'protein_100g', 0, 100),
  carbs_100g: optNum(i, 'carbs_100g', 0, 100),
  fat_100g: optNum(i, 'fat_100g', 0, 100),
  sugars_100g: optNum(i, 'sugars_100g', 0, 100),
  saturates_100g: optNum(i, 'saturates_100g', 0, 100),
  fiber_100g: optNum(i, 'fiber_100g', 0, 100),
  salt_100g: optNum(i, 'salt_100g', 0, 100),
});
const portionsArg = (i) => {
  if (i.portions == null) return undefined;
  if (!Array.isArray(i.portions)) throw bad('"portions" must be a list');
  return i.portions.slice(0, 12).map((p) => ({
    label: str(p ?? {}, 'label', 40),
    grams: num(p ?? {}, 'grams', 1, 5000),
  }));
};
async function replacePortions(q, foodId, portions) {
  await q(
    `update public.food_servings set deleted_at = now() where food_id = $1 and deleted_at is null`,
    [foodId],
  );
  for (const p of portions)
    await q(
      `insert into public.food_servings (id, food_id, label, grams) values ($1, $2, $3, $4)`,
      [randomUUID(), foodId, p.label, p.grams],
    );
}

async function supplementByName(q, i) {
  const list = await q(`select id, name from public.supplements where deleted_at is null`);
  if (i.supplement_id) {
    const s = list.find((x) => x.id === i.supplement_id);
    if (!s) throw new ToolError('supplement not found', 404);
    return s;
  }
  const wanted = str(i, 'name', 60).toLowerCase();
  const s =
    list.find((x) => x.name.toLowerCase() === wanted) ??
    list.find((x) => x.name.toLowerCase().includes(wanted));
  if (!s)
    throw bad(
      `No supplement "${wanted}". Supplements: ${list.map((x) => x.name).join(', ') || 'none (add_supplement first)'}`,
    );
  return s;
}

// --- propose_plans: the app's apply.ts on the server ------------------------------------------
async function applyDiet(q, userId, today, diet, result) {
  const goal = await goalForToday(q, today);
  const maintenance = goal?.maintenanceKcal ?? null;
  const problem = targetProblem(diet.kcal, maintenance);
  if (problem === 'below_minimum') throw bad('The calorie target is below the 1500 kcal minimum.');
  if (problem === 'deficit_too_large')
    throw bad('The calorie target is more than 25% under your maintenance calories.');
  const target = { kcal: diet.kcal, proteinG: diet.proteinG, carbsG: diet.carbsG, fatG: diet.fatG };
  const meals = rebalanceMeals(
    target,
    diet.meals.map((m) => ({ kcal: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG })),
    -1,
  );
  await saveGoal(q, userId, {
    validFrom: today,
    ...target,
    trainingDayBonusKcal: goal?.trainingDayBonusKcal ?? 0,
    maintenanceKcal: maintenance,
    waterMl: goal?.waterMl ?? 2000,
  });
  if (diet.mode !== 'tracking') {
    const current = await fixedPlan(q);
    const planId = current?.id ?? randomUUID();
    const ids = diet.meals.map(() => randomUUID());
    const after = diet.meals.findIndex((m) => m.name === diet.workoutAfter);
    await q(
      `insert into public.fixed_meal_plans (id, user_id, name, active) values ($1, $2, $3, true)
       on conflict (id) do update set active = true, deleted_at = null`,
      [planId, userId, current?.name ?? 'My meals'],
    );
    if (current?.meals.length)
      await q(`update public.fixed_meals set deleted_at = now() where id = any($1::uuid[])`, [
        current.meals.map((m) => m.id),
      ]);
    for (const [i, m] of diet.meals.entries())
      await q(
        `insert into public.fixed_meals
           (id, user_id, plan_id, position, name, kcal, protein_g, carbs_g, fat_g, description, is_main)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ids[i],
          userId,
          planId,
          i,
          m.name.trim(),
          meals[i].kcal,
          meals[i].proteinG,
          meals[i].carbsG,
          meals[i].fatG,
          m.description?.trim() || null,
          m.isMain,
        ],
      );
    await q(`update public.fixed_meal_plans set workout_after_meal_id = $2 where id = $1`, [
      planId,
      after >= 0 ? ids[after] : null,
    ]);
  }
  await q(`update public.profiles set diet_mode = $2 where id = $1`, [userId, diet.mode]);
  result.diet_applied = true;
}

async function applyWorkout(q, userId, workout, result) {
  const known = await q(`select id, name from public.exercises where deleted_at is null`);
  const ids = new Map();
  for (const day of workout.days)
    for (const e of day.exercises) {
      const key = normalizeName(e.name);
      if (ids.has(key)) continue;
      const found = matchExercise(e.name, known);
      if (found) ids.set(key, found.id);
      else if (e.newExercise) {
        const exId = randomUUID();
        await q(
          `insert into public.exercises (id, owner_id, name, primary_muscle, secondary_muscles, equipment, log_type)
           values ($1, $2, $3, $4, '{}', $5, $6)`,
          [
            exId,
            userId,
            e.name,
            e.newExercise.primaryMuscle,
            e.newExercise.equipment,
            e.newExercise.logType,
          ],
        );
        known.push({ id: exId, name: e.name });
        ids.set(key, exId);
        result.created_exercises += 1;
      } else ids.set(key, null);
    }
  const days = workout.days
    .map((d) => ({
      name: d.name,
      exercises: d.exercises.flatMap((e) => {
        const exerciseId = ids.get(normalizeName(e.name));
        if (!exerciseId) {
          result.skipped_exercises.push(e.name);
          return [];
        }
        return [{ ...e, exerciseId }];
      }),
    }))
    .filter((d) => d.exercises.length > 0);
  if (days.length === 0) throw bad('None of the exercises could be matched.');

  const existing = workout.id ? (await plans(q)).find((p) => p.id === workout.id) : undefined;
  let planId;
  let oldDays = [];
  if (existing) {
    // Backup first: the plan as it was, archived, so the change can always be undone.
    const backup = randomUUID();
    const backupName = `${existing.name} (before AI)`;
    await q(
      `insert into public.workout_plans (id, user_id, name, goal, status) values ($1, $2, $3, $4, 'archived')`,
      [backup, userId, backupName, existing.goal],
    );
    for (const d of existing.days) {
      const dayId = randomUUID();
      await q(
        `insert into public.plan_days (id, user_id, plan_id, position, name) values ($1, $2, $3, $4, $5)`,
        [dayId, userId, backup, d.position, d.name],
      );
      for (const e of d.exercises)
        await q(
          `insert into public.plan_exercises (id, user_id, plan_day_id, exercise_id, position, target_sets, target_reps, rest_s, notes, superset_with_next, drop_on, drop_reps)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            randomUUID(),
            userId,
            dayId,
            e.exerciseId,
            e.position,
            e.sets,
            e.reps,
            e.rest_s,
            e.notes,
            e.superset_with_next ?? false,
            e.drop_on ?? 'last',
            e.drop_reps ?? [],
          ],
        );
    }
    await q(`update public.workout_plans set name = $2 where id = $1`, [existing.id, workout.name]);
    planId = existing.id;
    oldDays = existing.days;
    result.workout_updated = true;
    result.backup = backupName;
  } else {
    const [active] = await q(
      `select id from public.workout_plans where status = 'active' and deleted_at is null limit 1`,
    );
    planId = randomUUID();
    await q(
      `insert into public.workout_plans (id, user_id, name, status, source) values ($1, $2, $3, $4, 'ai')`,
      [planId, userId, workout.name, active ? 'draft' : 'active'],
    );
  }
  for (const [i, day] of days.entries()) {
    const reuse = oldDays[i];
    const dayId = reuse?.id ?? randomUUID();
    await q(
      `insert into public.plan_days (id, user_id, plan_id, position, name) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set position = excluded.position, name = excluded.name, deleted_at = null`,
      [dayId, userId, planId, i, day.name],
    );
    if (reuse)
      await q(
        `update public.plan_exercises set deleted_at = now() where plan_day_id = $1 and deleted_at is null`,
        [dayId],
      );
    for (const [position, e] of day.exercises.entries())
      await q(
        `insert into public.plan_exercises (id, user_id, plan_day_id, exercise_id, position, target_sets, target_reps, rest_s, notes, superset_with_next, drop_on, drop_reps)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(),
          userId,
          dayId,
          e.exerciseId,
          position,
          e.sets,
          e.reps,
          e.restS,
          e.notes || null,
          e.supersetWithNext && position < day.exercises.length - 1,
          e.drops?.on ?? 'last',
          e.drops?.reps ?? [],
        ],
      );
  }
  for (const old of oldDays.slice(days.length))
    await q(`update public.plan_days set deleted_at = now() where id = $1`, [old.id]);
  result.workout_plan_id = planId;
}

/** The shared data tools say what was wrong with a question as a plain Error: it goes back to the model. */
async function asked(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ToolError || (e && typeof e === 'object' && 'code' in e)) throw e;
    throw bad(e instanceof Error ? e.message : String(e));
  }
}

// --- the tools --------------------------------------------------------------------------------
const spec = (name) => ({
  description: DATA_TOOL_SPECS[name].description,
  inputSchema: DATA_TOOL_SPECS[name].schema,
});

export const COACH_TOOLS = [
  { name: 'list_data', ...spec('list_data'), run: async (q) => listData(await dataSource(q)) },
  {
    name: 'query_data',
    ...spec('query_data'),
    run: async (q, args) => asked(() => dataSource(q).then((src) => queryData(src, args))),
  },
  {
    name: 'get_strength',
    ...spec('get_strength'),
    run: async (q, args, ctx) =>
      asked(() => dataSource(q).then((src) => strengthReport(src, args, ctx.today))),
  },
  {
    name: 'get_workout_plans',
    description: 'The workout plans (days, exercises, sets, reps, rest) in the plan format.',
    inputSchema: { type: 'object', properties: {} },
    run: async (q) => ({
      workout_plans: (await plans(q)).filter((p) => p.status !== 'archived').map(exportPlan),
    }),
  },
  {
    name: 'get_diet',
    description:
      'The diet: calorie and macro target, maintenance calories, water goal, and the fixed meals if the user follows set meals.',
    inputSchema: { type: 'object', properties: {} },
    run: async (q, _args, ctx) => {
      const [goal, plan, [profile]] = await Promise.all([
        goalForToday(q, ctx.today),
        fixedPlan(q),
        q(`select diet_mode from public.profiles where id = $1`, [ctx.userId]),
      ]);
      const after = plan?.meals.find((m) => m.id === plan.workoutAfterMealId)?.name;
      return {
        diet_plan: goal
          ? {
              mode: profile?.diet_mode === 'tracking' ? 'tracking' : 'fixed_meals',
              daily: {
                kcal: goal.kcal,
                protein_g: goal.proteinG,
                carbs_g: goal.carbsG,
                fat_g: goal.fatG,
              },
              meals: (plan?.meals ?? []).map((m) => ({
                name: m.name,
                main: m.isMain,
                description: m.description,
                kcal: m.kcal,
                protein_g: m.proteinG,
                carbs_g: m.carbsG,
                fat_g: m.fatG,
              })),
              ...(after ? { workout_after: after } : {}),
            }
          : null,
        maintenance_kcal: goal?.maintenanceKcal ?? null,
        training_day_bonus_kcal: goal?.trainingDayBonusKcal ?? 0,
        water_goal_ml: goal?.waterMl ?? null,
      };
    },
  },
  {
    name: 'list_exercises',
    description:
      'The exercise names the app knows (use these exact names in workout plans), optionally for one muscle.',
    inputSchema: {
      type: 'object',
      properties: {
        muscle: {
          type: 'string',
          description: 'chest, back, shoulders, biceps, triceps, legs, glutes or abs (optional).',
        },
      },
    },
    run: async (q, args) => {
      const muscle = optStr(args, 'muscle', 20)?.toLowerCase();
      const rows = await q(
        `select name, primary_muscle as muscle, equipment from public.exercises
         where deleted_at is null and ($1::text is null or primary_muscle = $1) order by name`,
        [muscle ?? null],
      );
      return { exercises: rows };
    },
  },
  {
    name: 'create_food',
    write: true,
    description:
      'Save a new food of the user ("Mine"), with its values per 100 g from the label. Use it before logging a food that search_foods does not find.',
    inputSchema: {
      type: 'object',
      properties: foodSchema,
      required: ['name', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'],
    },
    run: async (q, args, ctx) => {
      const v = per100Args(args);
      if (
        v.kcal_100g == null ||
        v.protein_100g == null ||
        v.carbs_100g == null ||
        v.fat_100g == null
      )
        throw bad('kcal_100g, protein_100g, carbs_100g and fat_100g are required.');
      const foodId = randomUUID();
      await q(
        `insert into public.foods (id, owner_id, name, brand, barcode, kcal_100g, protein_100g, carbs_100g,
           sugars_100g, fat_100g, saturates_100g, fiber_100g, salt_100g, source, verified)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'custom', false)`,
        [
          foodId,
          ctx.userId,
          str(args, 'name', 80),
          optStr(args, 'brand', 60) || null,
          (optStr(args, 'barcode', 20) ?? '').replace(/\D/g, '') || null,
          v.kcal_100g,
          v.protein_100g,
          v.carbs_100g,
          v.sugars_100g ?? null,
          v.fat_100g,
          v.saturates_100g ?? null,
          v.fiber_100g ?? null,
          v.salt_100g ?? null,
        ],
      );
      const portions = portionsArg(args);
      if (portions?.length) await replacePortions(q, foodId, portions);
      return { food_id: foodId };
    },
  },
  {
    name: 'update_food',
    write: true,
    // Deletes or replaces data (MCP destructiveHint, DECISIONS 84).
    destructive: true,
    description:
      'Change a food the user created (only their own). Send food_id and only the fields to change. If you send portions they replace the old ones.',
    inputSchema: {
      type: 'object',
      properties: {
        food_id: { type: 'string', description: 'Id from search_foods.' },
        ...foodSchema,
      },
      required: ['food_id'],
    },
    run: async (q, args, ctx) => {
      const before = await ownFood(q, id(args, 'food_id'), ctx.userId);
      const v = per100Args(args);
      const sets = Object.entries({
        name: optStr(args, 'name', 80),
        brand: optStr(args, 'brand', 60),
        barcode:
          args.barcode != null
            ? (optStr(args, 'barcode', 20) ?? '').replace(/\D/g, '') || null
            : undefined,
        ...v,
      }).filter(([, x]) => x !== undefined);
      if (sets.length)
        await q(
          `update public.foods set ${sets.map(([k], i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
          [before.id, ...sets.map(([, x]) => x)],
        );
      const portions = portionsArg(args);
      if (portions) await replacePortions(q, before.id, portions);
      return { updated: before.id };
    },
  },
  {
    name: 'delete_food',
    write: true,
    // Deletes or replaces data (MCP destructiveHint, DECISIONS 84).
    destructive: true,
    description:
      'Delete a food the user created. Entries already in the food log keep their values.',
    inputSchema: {
      type: 'object',
      properties: { food_id: { type: 'string', description: 'Id from search_foods.' } },
      required: ['food_id'],
    },
    run: async (q, args, ctx) => {
      const food = await ownFood(q, id(args, 'food_id'), ctx.userId);
      await q(`update public.foods set deleted_at = now() where id = $1`, [food.id]);
      return { deleted: food.name };
    },
  },
  {
    name: 'set_meal_status',
    write: true,
    description:
      'For users on fixed meals: mark a planned meal as done (as planned), skipped, adjusted (ate a different amount: give kcal and macros) or pending (clear the mark).',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'Date as YYYY-MM-DD. Default: today.' },
        meal: { type: 'string', description: 'Name of the planned meal, as in get_diet.' },
        status: { type: 'string', enum: ['done', 'skipped', 'adjusted', 'pending'] },
        kcal: { type: 'number', description: 'Adjusted: kcal eaten.' },
        protein_g: { type: 'number', description: 'Adjusted: protein eaten in g.' },
        carbs_g: { type: 'number', description: 'Adjusted: carbs eaten in g.' },
        fat_g: { type: 'number', description: 'Adjusted: fat eaten in g.' },
      },
      required: ['meal', 'status'],
    },
    run: async (q, args, ctx) => {
      const day = dayArg(args, 'day', ctx.today);
      const plan = await fixedPlan(q);
      if (!plan) throw bad('The user has no fixed meals plan.');
      const wanted = str(args, 'meal', 60).toLowerCase();
      const meal = plan.meals.find((m) => m.name.toLowerCase() === wanted);
      if (!meal)
        throw bad(
          `No planned meal "${wanted}". Meals: ${plan.meals.map((m) => m.name).join(', ')}`,
        );
      const status = str(args, 'status', 10);
      let check;
      if (status === 'done') check = checkAsPlanned(meal);
      else if (status === 'skipped')
        check = { status: 'skipped', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
      else if (status === 'pending') check = null;
      else if (status === 'adjusted')
        check = {
          status: 'adjusted',
          kcal: num(args, 'kcal', 0, 5000),
          proteinG: optNum(args, 'protein_g', 0, 500) ?? 0,
          carbsG: optNum(args, 'carbs_g', 0, 800) ?? 0,
          fatG: optNum(args, 'fat_g', 0, 500) ?? 0,
        };
      else throw bad('"status" must be done, skipped, adjusted or pending');
      await q(
        `update public.fixed_meal_checks set deleted_at = now()
         where day = $1 and fixed_meal_id = $2 and deleted_at is null`,
        [day, meal.id],
      );
      if (check)
        await q(
          `insert into public.fixed_meal_checks (id, user_id, day, fixed_meal_id, status, kcal, protein_g, carbs_g, fat_g)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            ctx.userId,
            day,
            meal.id,
            check.status,
            Math.round(check.kcal),
            check.proteinG,
            check.carbsG,
            check.fatG,
          ],
        );
      return { meal: meal.name, day, status };
    },
  },
  {
    name: 'set_nutrition_goal',
    write: true,
    description:
      'Change the daily calorie and macro target from today on (earlier days keep theirs). Never below 1500 kcal and never more than 25% under maintenance; the macros must add up to the calories.',
    inputSchema: {
      type: 'object',
      properties: {
        kcal: { type: 'number', description: 'Daily calories.' },
        protein_g: { type: 'number', description: 'Daily protein in g.' },
        carbs_g: { type: 'number', description: 'Daily carbs in g.' },
        fat_g: { type: 'number', description: 'Daily fat in g.' },
        training_day_bonus_kcal: {
          type: 'number',
          description: 'Extra kcal on training days (optional).',
        },
        water_ml: { type: 'number', description: 'Daily water goal in ml (optional).' },
      },
      required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
    },
    run: async (q, args, ctx) => {
      const kcal = Math.round(num(args, 'kcal', 500, 8000));
      const proteinG = Math.round(num(args, 'protein_g', 0, 500));
      const carbsG = Math.round(num(args, 'carbs_g', 0, 1000));
      const fatG = Math.round(num(args, 'fat_g', 0, 500));
      const current = await goalForToday(q, ctx.today);
      const maintenance = current?.maintenanceKcal ?? null;
      const problem = maintenance
        ? targetProblem(kcal, maintenance)
        : kcal < MIN_DAILY_KCAL
          ? 'below_minimum'
          : null;
      if (problem === 'below_minimum')
        throw bad('The calorie target is below the 1500 kcal minimum.');
      if (problem === 'deficit_too_large')
        throw bad('The calorie target is more than 25% under the maintenance calories.');
      const fromMacros = macroKcal({ proteinG, carbsG, fatG });
      if (Math.abs(fromMacros - kcal) > kcal * 0.1)
        throw bad(
          `The macros add up to ${Math.round(fromMacros)} kcal; they must be within 10% of ${kcal}.`,
        );
      await saveGoal(q, ctx.userId, {
        validFrom: ctx.today,
        kcal,
        proteinG,
        carbsG,
        fatG,
        trainingDayBonusKcal: Math.round(
          optNum(args, 'training_day_bonus_kcal', 0, 1000) ?? current?.trainingDayBonusKcal ?? 0,
        ),
        maintenanceKcal: maintenance,
        waterMl: Math.round(optNum(args, 'water_ml', 500, 10000) ?? current?.waterMl ?? 2500),
      });
      return {
        saved: true,
        from: ctx.today,
        kcal,
        protein_g: proteinG,
        carbs_g: carbsG,
        fat_g: fatG,
      };
    },
  },
  {
    name: 'propose_plans',
    write: true,
    // Deletes or replaces data (MCP destructiveHint, DECISIONS 84).
    destructive: true,
    description:
      'Create or change workout plans and/or the whole diet, in the plan format (call get_workout_plans and list_exercises first; to change a plan send it back with its "id" and ALL its days). A changed plan keeps a backup copy.',
    inputSchema: {
      type: 'object',
      properties: {
        workout_plan: {
          type: 'object',
          description:
            'A workout plan: {id?, name, days: [{name, exercises: [{exercise (exact name from list_exercises), sets, reps ("8-12"), rest_s, notes?, superset_with_next? (true = superset with the next exercise: done in turn, one rest per round), drops? ({on: "last"|"every", reps: ["10","12"]} = drop set, target reps of each drop)}]}]}.',
        },
        diet_plan: {
          type: 'object',
          description:
            'A diet: {mode: "tracking" | "fixed_meals", daily: {kcal, protein_g, carbs_g, fat_g}, meals: [{name, main?, description?, kcal, protein_g, carbs_g, fat_g}] (fixed_meals only), workout_after?}.',
        },
      },
    },
    run: async (q, args, ctx) => {
      const bundle = parseBundle({ workout_plan: args.workout_plan, diet_plan: args.diet_plan });
      if (bundle.errors.length > 0) throw bad(bundle.errors.join(' '));
      const result = {
        saved: true,
        workout_plan_id: null,
        workout_updated: false,
        diet_applied: false,
        created_exercises: 0,
        skipped_exercises: [],
        backup: null,
        warnings: bundle.warnings,
      };
      if (bundle.diet) await applyDiet(q, ctx.userId, ctx.today, bundle.diet, result);
      if (bundle.workout) await applyWorkout(q, ctx.userId, bundle.workout, result);
      return result;
    },
  },
  {
    name: 'add_supplement',
    write: true,
    description: "Add a supplement to the user's list (creatine, vitamin D…), with its dose.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'e.g. "Creatine".' },
        dose: { type: 'string', description: 'As said: "5 g", "1 capsule", "2000 IU" (optional).' },
      },
      required: ['name'],
    },
    run: async (q, args, ctx) => {
      const [{ n }] = await q(
        `select count(*)::int as n from public.supplements where deleted_at is null`,
      );
      const supplementId = randomUUID();
      await q(
        `insert into public.supplements (id, user_id, name, dose, position) values ($1, $2, $3, $4, $5)`,
        [supplementId, ctx.userId, str(args, 'name', 60), optStr(args, 'dose', 40) || null, n],
      );
      return { supplement_id: supplementId };
    },
  },
  {
    name: 'set_supplement',
    write: true,
    description:
      'Mark a supplement as taken (or not taken) on a day (default today), by its name or supplement_id.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the supplement (as in the list).' },
        supplement_id: { type: 'string' },
        day: { type: 'string', description: 'Date as YYYY-MM-DD. Default: today.' },
        taken: { type: 'boolean', description: 'true = taken (default), false = not taken.' },
      },
    },
    run: async (q, args, ctx) => {
      const s = await supplementByName(q, args);
      const day = dayArg(args, 'day', ctx.today);
      const taken = args.taken !== false;
      if (taken)
        await q(
          `insert into public.supplement_logs (id, user_id, day, supplement_id)
           select $1, $2, $3, $4
           where not exists (select 1 from public.supplement_logs
                             where day = $3 and supplement_id = $4 and deleted_at is null)`,
          [randomUUID(), ctx.userId, day, s.id],
        );
      else
        await q(
          `update public.supplement_logs set deleted_at = now()
           where day = $1 and supplement_id = $2 and deleted_at is null`,
          [day, s.id],
        );
      return { supplement: s.name, day, taken };
    },
  },
];

export { dayOf };
