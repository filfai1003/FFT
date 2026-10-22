import { useQueryClient } from '@tanstack/react-query';
import { deviceTimeZone } from '@/domain/day';
import {
  checkAsPlanned,
  goalForDay,
  meals,
  scaleNutrition,
  type FixedCheck,
  type Meal,
} from '@/domain/diet';
import { DEFAULT_WATER_ML } from '@/domain/hydration';
import { MIN_DAILY_KCAL, macroKcal, targetProblem } from '@/domain/nutrition';
import { parseBundle } from '@/domain/plan-import';
import { useSessionStore } from '@/features/auth/session-store';
import { fetchFixedPlan, useSetCheck } from '@/features/diet/fixed';
import {
  FOOD_SELECT,
  toFood,
  useSaveFood,
  useSetFoodDeleted,
  type Food,
} from '@/features/diet/foods';
import {
  fetchGoals,
  useAddWater,
  useLogFood,
  useRemoveWater,
  useSaveGoal,
  useSetLogDeleted,
} from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useSaveCheckIn, type MeasureKey } from '@/features/progress/data';
import { getSupabase } from '@/lib/supabase';
import { useApplyImport } from '../apply';
import { useAiContext } from '../context';
import type { AiAccess, AiCategory } from '../access';
import { AI_CATEGORIES, notShared } from '../access';
import { day as dayArg, num, optNum, optStr, round, str, type Input } from './args';
import { DATA_TOOL_SPECS } from '@/domain/data-tools';
import {
  fetchSupplements,
  useSaveSupplement,
  useSetSupplementDeleted,
  useSetTaken,
} from '@/features/supplements/data';
import { newId } from '@/lib/uuid';
import { listData, queryData, strengthReport } from './explore';

import {
  dayShared,
  historyShared,
  readBody,
  readDay,
  readDiet,
  readFoods,
  readHistory,
  readPlans,
  readWorkouts,
  type ReadContext,
} from './reads';
import type { ChangeLine, ToolDef } from './types';

/** Description and schema shared with the MCP server (domain/data-tools.ts). */
const specOf = (name: keyof typeof DATA_TOOL_SPECS) => ({
  description: DATA_TOOL_SPECS[name].description,
  schema: DATA_TOOL_SPECS[name].schema as unknown as Record<string, unknown>,
});

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
});
const number = (description: string) => ({ type: 'number', description });

/** The water fields of a goal change: automatic, the user's own number, or as they were. */
function nextWater(
  input: Input,
  current: { waterMl: number; waterAuto: boolean } | null,
): { waterMl: number; waterAuto: boolean } {
  const ml = optNum(input, 'water_ml', 500, 10000);
  if (input.water_automatic === true)
    return { waterMl: current?.waterMl ?? DEFAULT_WATER_ML, waterAuto: true };
  if (ml != null) return { waterMl: Math.round(ml), waterAuto: false };
  return { waterMl: current?.waterMl ?? DEFAULT_WATER_ML, waterAuto: current?.waterAuto ?? true };
}
const text = (description: string) => ({ type: 'string', description });
const dayField = text('Date as YYYY-MM-DD. Default: today.');
const mealField = { type: 'string', enum: [...meals], description: 'Which meal of the day.' };
const line = (label: string, value: unknown): ChangeLine[] =>
  value == null || value === '' ? [] : [{ label, value: String(value) }];

const measureKeys = [
  ['waist_cm', 'waist'],
  ['hips_cm', 'hips'],
  ['chest_cm', 'chest'],
  ['arm_cm', 'arm'],
  ['thigh_cm', 'thigh'],
] as const satisfies readonly (readonly [string, MeasureKey])[];

async function fetchFood(id: string): Promise<Food> {
  const { data, error } = await getSupabase()
    .from('foods')
    .select(FOOD_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Food not found');
  return toFood(data as unknown as Parameters<typeof toFood>[0]);
}

/** A food as people read it ("Salmon, raw, farmed" or "Light · Philadelphia"); the id if unknown. */
async function foodName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !id) return null;
  const food = await fetchFood(id).catch(() => null);
  if (!food) return id;
  return food.brand ? `${food.name} · ${food.brand}` : food.name;
}

/** A food log entry as people read it: "Salmon, raw, farmed · 100 g · dinner". */
async function logName(id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !id) return null;
  const { data } = await getSupabase()
    .from('food_logs')
    .select('name, grams, meal, day')
    .eq('id', id)
    .maybeSingle();
  const row = data as { name: string; grams: number | null; meal: string; day: string } | null;
  if (!row) return id;
  return [row.name, row.grams != null ? `${Number(row.grams)} g` : null, row.meal, row.day]
    .filter(Boolean)
    .join(' · ');
}

const per100Of = (f: Food) => ({
  kcal: f.per100.kcal,
  protein: f.per100.protein,
  carbs: f.per100.carbs,
  fat: f.per100.fat,
  sugars: f.per100.sugars ?? null,
  saturates: f.per100.saturates ?? null,
  fiber: f.per100.fiber ?? null,
  salt: f.per100.salt ?? null,
});

function portionsArg(input: Input) {
  const raw = input.portions;
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw new Error('"portions" must be a list');
  return raw.slice(0, 12).map((p) => {
    const item = (p ?? {}) as Input;
    return { label: str(item, 'label', 40), grams: num(item, 'grams', 1, 5000) };
  });
}

function foodFields(input: Input) {
  return {
    kcal: optNum(input, 'kcal_100g', 0, 1000),
    protein: optNum(input, 'protein_100g', 0, 100),
    carbs: optNum(input, 'carbs_100g', 0, 100),
    fat: optNum(input, 'fat_100g', 0, 100),
    sugars: optNum(input, 'sugars_100g', 0, 100),
    saturates: optNum(input, 'saturates_100g', 0, 100),
    fiber: optNum(input, 'fiber_100g', 0, 100),
    salt: optNum(input, 'salt_100g', 0, 100),
  };
}

const foodProps = {
  name: text('Name of the food.'),
  brand: text('Brand (optional).'),
  barcode: text('Barcode digits (optional).'),
  kcal_100g: number('Energy per 100 g, in kcal.'),
  protein_100g: number('Protein per 100 g, in grams.'),
  carbs_100g: number('Carbohydrates per 100 g, in grams.'),
  fat_100g: number('Fat per 100 g, in grams.'),
  sugars_100g: number('Of which sugars per 100 g (optional).'),
  saturates_100g: number('Of which saturated fat per 100 g (optional).'),
  fiber_100g: number('Fibre per 100 g (optional).'),
  salt_100g: number('Salt per 100 g (optional).'),
  portions: {
    type: 'array',
    description: 'Named portions, e.g. "1 slice" = 30 g (optional).',
    items: obj({ label: text('Portion name'), grams: number('Weight in grams') }, [
      'label',
      'grams',
    ]),
  },
};

/** "Now" for the read tools (today, time zone, diet mode), the account and the profile text. */
export function useReadContext() {
  const userId = useSessionStore((s) => s.userId);
  const today = useToday();
  const profile = useProfile();
  const ai = useAiContext();
  const ctx: ReadContext = {
    today,
    timeZone: profile.data?.timezone ?? deviceTimeZone(),
    dietMode: profile.data?.diet_mode ?? null,
  };
  return {
    userId,
    today,
    ctx,
    profileText: ai.profileText,
    profileFor: ai.profileFor,
    ready: ai.ready,
  };
}

/**
 * Everything the AI assistant can look at and do. Reading is free; every tool that changes the
 * user's data is marked `write`, is shown to the user first and runs only after they approve it
 * (and most can be taken back afterwards with UNDO).
 */
export function useAgentTools(access: AiAccess): ToolDef[] {
  const queryClient = useQueryClient();
  const { userId, today, ctx, profileFor } = useReadContext();
  const refresh = () => queryClient.invalidateQueries();
  const notSharedList = AI_CATEGORIES.filter((c) => !access[c]);

  const saveCheckIn = useSaveCheckIn();
  const saveFood = useSaveFood();
  const setFoodDeleted = useSetFoodDeleted();
  const logFood = useLogFood();
  const setLogDeleted = useSetLogDeleted();
  const addWater = useAddWater();
  const removeWater = useRemoveWater();
  const setCheck = useSetCheck();
  const saveGoal = useSaveGoal();
  const applyImport = useApplyImport();
  const saveSupplement = useSaveSupplement();
  const setSupplementDeleted = useSetSupplementDeleted();
  const setTaken = useSetTaken();

  const ownFood = async (id: string) => {
    const food = await fetchFood(id);
    if (food.ownerId !== userId) throw new Error('Only foods you created can be changed.');
    return food;
  };

  type ReadTool = Omit<ToolDef, 'run' | 'write' | 'describe'> & {
    run: (input: Input) => Promise<unknown>;
  };
  const readTools: ReadTool[] = [
    {
      name: 'get_overview',
      description:
        "Start here. The user's profile, goal, diet mode, calorie and macro target, latest weight and body fat, the active workout plans, and everything about today so far (what was eaten, meals followed, water, workouts).",
      schema: obj({}),
      run: async () => {
        const shares = access.diet || access.training;
        const [day, body, plans] = await Promise.all([
          readDay(ctx, ctx.today),
          readBody(ctx, 365),
          readPlans(),
        ]);
        const latest = body.entries.find((e) => e.weight_kg != null);
        const latestFat = body.entries.find((e) => e.body_fat_pct != null);
        return {
          today: ctx.today,
          profile: profileFor(access),
          ...(access.diet ? { diet_mode: ctx.dietMode } : {}),
          ...(access.profile
            ? {
                latest_weight: latest ? { kg: latest.weight_kg, day: latest.day } : null,
                latest_body_fat: latestFat
                  ? { pct: latestFat.body_fat_pct, day: latestFat.day }
                  : null,
              }
            : {}),
          ...(access.training
            ? {
                workout_plans: plans.workout_plans.map((p) => ({
                  id: p.id,
                  name: p.name,
                  days: p.days.map((d) => d.name),
                })),
              }
            : {}),
          ...(shares ? { today_status: dayShared(day, access) } : {}),
          ...(notSharedList.length ? { not_shared: notSharedList } : {}),
        };
      },
    },
    {
      name: 'get_day',
      description:
        'One day in detail: the target, what was eaten (food log entries with their ids, or the fixed meals with done/adjusted/skipped/pending), water, workouts, and whether the diet was followed.',
      schema: obj({ day: dayField }),
      run: async (input) =>
        access.diet || access.training
          ? dayShared(await readDay(ctx, dayArg(input, 'day', ctx.today)), access)
          : notShared('diet'),
    },
    {
      name: 'get_history',
      description:
        'How the user did over the last days: calories against the target per day, diet followed or not, workouts done, water, plus a summary (days on target, workouts, average calories).',
      schema: obj({ days: number('How many days back, 1 to 90. Default 14.') }),
      run: async (input) =>
        access.diet || access.training
          ? historyShared(
              await readHistory(ctx, Math.round(optNum(input, 'days', 1, 90) ?? 14)),
              access,
            )
          : notShared('diet'),
    },
    {
      name: 'get_body',
      description: 'Weight, body fat and measurements the user logged, newest first.',
      schema: obj({ days: number('How many days back, 1 to 730. Default 90.') }),
      run: async (input) => readBody(ctx, Math.round(optNum(input, 'days', 1, 730) ?? 90)),
    },
    {
      name: 'get_workouts',
      description: 'The last finished workouts with every exercise and the sets that were done.',
      schema: obj({ limit: number('How many workouts, 1 to 20. Default 6.') }),
      run: async (input) => readWorkouts(Math.round(optNum(input, 'limit', 1, 20) ?? 6)),
    },
    {
      name: 'get_workout_plans',
      description: 'The workout plans (days, exercises, sets, reps, rest) in the plan format.',
      schema: obj({}),
      run: async () => readPlans(),
    },
    {
      name: 'get_diet',
      description:
        'The diet: calorie and macro target, maintenance calories, water goal, and the fixed meals if the user follows set meals.',
      schema: obj({}),
      run: async () => readDiet(ctx),
    },
    {
      name: 'search_foods',
      description:
        "Foods the app knows. Without a query: the user's own foods. With a query: search by name. Gives food_id, needed to log or change a food.",
      schema: obj({ query: text('Part of the food name (optional).') }),
      run: async (input) => {
        const query = optStr(input, 'query', 60);
        // Without the diet shared, only the app's catalogue (not the user's own foods).
        if (!query && !access.diet) return notShared('diet');
        return readFoods(query, userId, access.diet);
      },
    },
    {
      name: 'list_data',
      ...specOf('list_data'),
      run: async () => listData(access),
    },
    {
      name: 'query_data',
      ...specOf('query_data'),
      run: async (input) => queryData(input, access),
    },
    {
      name: 'get_strength',
      ...specOf('get_strength'),
      run: async (input) => strengthReport(input, ctx.today, access),
    },
    {
      name: 'list_exercises',
      description:
        'The exercise names the app knows (use these exact names in workout plans), optionally for one muscle.',
      schema: obj({
        muscle: text('chest, back, shoulders, biceps, triceps, legs, glutes or abs (optional).'),
      }),
      run: async (input) => {
        const muscle = optStr(input, 'muscle', 20)?.toLowerCase();
        let q = getSupabase().from('exercises').select('name, primary_muscle, equipment');
        q = q.is('deleted_at', null);
        // The user's own exercises are training data: only the catalogue when it is not shared.
        if (!access.training) q = q.is('owner_id', null);
        if (muscle) q = q.eq('primary_muscle', muscle);
        const { data, error } = await q.order('name');
        if (error) throw new Error(error.message);
        return {
          exercises: (data as { name: string; primary_muscle: string; equipment: string }[]).map(
            (e) => ({ name: e.name, muscle: e.primary_muscle, equipment: e.equipment }),
          ),
        };
      },
    },
  ];

  const reads: ToolDef[] = readTools.map((t) => ({
    ...t,
    run: async (input: Input) => ({ content: await t.run(input) }),
  }));

  /** A supplement of the list by name (or id), like the MCP server's set_supplement. */
  const supplementOf = async (input: Input) => {
    const list = await fetchSupplements();
    const byId = optStr(input, 'supplement_id', 60);
    if (byId) {
      const s = list.find((x) => x.id === byId);
      if (!s) throw new Error('Supplement not found.');
      return s;
    }
    const wanted = str(input, 'name', 60).toLowerCase();
    const s =
      list.find((x) => x.name.toLowerCase() === wanted) ??
      list.find((x) => x.name.toLowerCase().includes(wanted));
    if (!s)
      throw new Error(
        `No supplement "${wanted}". Supplements: ${list.map((x) => x.name).join(', ') || 'none (add_supplement first)'}`,
      );
    return s;
  };

  const writes: ToolDef[] = [
    {
      name: 'add_supplement',
      write: true,
      description: "Add a supplement to the user's list (creatine, vitamin D…), with its dose.",
      schema: obj(
        {
          name: text('e.g. "Creatine".'),
          dose: text('As said: "5 g", "1 capsule", "2000 IU" (optional).'),
        },
        ['name'],
      ),
      describe: (input) => [...line('name', input.name), ...line('amount', input.dose)],
      run: async (input) => {
        const list = await fetchSupplements();
        const id = newId();
        await saveSupplement.mutateAsync({
          id,
          name: str(input, 'name', 60),
          dose: optStr(input, 'dose', 40) ?? null,
          position: list.length,
        });
        return {
          content: { supplement_id: id },
          undo: async () => {
            await setSupplementDeleted.mutateAsync({ id, deleted: true });
          },
        };
      },
    },
    {
      name: 'set_supplement',
      write: true,
      description:
        'Mark a supplement as taken (or not taken) on a day (default today), by its name or supplement_id.',
      schema: obj({
        name: text('Name of the supplement (as in the list).'),
        supplement_id: text('Id of the supplement (optional).'),
        day: dayField,
        taken: { type: 'boolean', description: 'true = taken (default), false = not taken.' },
      }),
      describe: (input) => [
        ...line('day', input.day ?? today),
        ...line('name', input.name ?? input.supplement_id),
        ...line('status', input.taken === false ? 'not taken' : 'taken'),
      ],
      run: async (input) => {
        const s = await supplementOf(input);
        const day = dayArg(input, 'day', today);
        const taken = input.taken !== false;
        await setTaken.mutateAsync({ day, supplementId: s.id, taken });
        return {
          content: { supplement: s.name, day, taken },
          undo: async () => {
            await setTaken.mutateAsync({ day, supplementId: s.id, taken: !taken });
          },
        };
      },
    },
    {
      name: 'log_body',
      write: true,
      description:
        'Log weight, body fat or measurements for a day (default today). Values left out keep what is already saved for that day.',
      schema: obj({
        day: dayField,
        weight_kg: number('Body weight in kg.'),
        body_fat_pct: number('Body fat percentage.'),
        waist_cm: number('Waist in cm.'),
        hips_cm: number('Hips in cm.'),
        chest_cm: number('Chest in cm.'),
        arm_cm: number('Arm in cm.'),
        thigh_cm: number('Thigh in cm.'),
        notes: text('A short note (optional).'),
      }),
      describe: (input) => [
        ...line('day', input.day ?? today),
        ...line('weight', input.weight_kg != null ? `${input.weight_kg} kg` : null),
        ...line('bodyFat', input.body_fat_pct != null ? `${input.body_fat_pct} %` : null),
        ...measureKeys.flatMap(([key, label]) =>
          line(label, input[key] != null ? `${input[key]} cm` : null),
        ),
        ...line('notes', input.notes),
      ],
      run: async (input) => {
        const day = dayArg(input, 'day', today);
        const weightKg = optNum(input, 'weight_kg', 20, 400);
        const bodyFatPct = optNum(input, 'body_fat_pct', 2, 70);
        const measures: Partial<Record<MeasureKey, number>> = {};
        for (const [key, label] of measureKeys) {
          const v = optNum(input, key, 10, 300);
          if (v != null) measures[label] = v;
        }
        const notes = optStr(input, 'notes', 200);
        if (weightKg == null && bodyFatPct == null && Object.keys(measures).length === 0)
          throw new Error('Give at least a weight, a body fat or a measurement.');

        const supabase = getSupabase();
        const before = await supabase
          .from('body_metrics')
          .select('*')
          .eq('day', day)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);
        const previous = ((before.data ?? []) as Record<string, unknown>[])[0];
        await saveCheckIn.mutateAsync({ day, weightKg, bodyFatPct, measures, notes });
        return {
          content: { saved: true, day, weight_kg: weightKg, body_fat_pct: bodyFatPct, measures },
          undo: async () => {
            if (previous) {
              await supabase
                .from('body_metrics')
                .update({
                  weight_kg: (previous.weight_kg as number | null) ?? null,
                  body_fat_pct: (previous.body_fat_pct as number | null) ?? null,
                  waist_cm: (previous.waist_cm as number | null) ?? null,
                  hips_cm: (previous.hips_cm as number | null) ?? null,
                  chest_cm: (previous.chest_cm as number | null) ?? null,
                  arm_cm: (previous.arm_cm as number | null) ?? null,
                  thigh_cm: (previous.thigh_cm as number | null) ?? null,
                  notes: (previous.notes as string | null) ?? null,
                })
                .eq('id', String(previous.id));
            } else {
              await supabase
                .from('body_metrics')
                .update({ deleted_at: new Date().toISOString() })
                .eq('day', day)
                .is('deleted_at', null);
            }
            await refresh();
          },
        };
      },
    },
    {
      name: 'create_food',
      write: true,
      description:
        'Save a new food of the user ("Mine"), with its values per 100 g from the label. Use it before logging a food that search_foods does not find.',
      schema: obj(foodProps, ['name', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g']),
      describe: (input) => [
        ...line('name', input.name),
        ...line('brand', input.brand),
        ...line(
          'per100',
          `${input.kcal_100g} kcal · P ${input.protein_100g} · C ${input.carbs_100g} · F ${input.fat_100g}`,
        ),
      ],
      run: async (input) => {
        const v = foodFields(input);
        if (v.kcal == null || v.protein == null || v.carbs == null || v.fat == null)
          throw new Error('kcal_100g, protein_100g, carbs_100g and fat_100g are required.');
        const id = await saveFood.mutateAsync({
          name: str(input, 'name', 80),
          brand: optStr(input, 'brand', 60) ?? '',
          barcode: (optStr(input, 'barcode', 20) ?? '').replace(/\D/g, ''),
          per100: { ...v, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat },
          portions: portionsArg(input) ?? [],
        });
        return {
          content: { food_id: id },
          undo: async () => {
            await setFoodDeleted.mutateAsync({ id, deleted: true });
          },
        };
      },
    },
    {
      name: 'update_food',
      write: true,
      description:
        'Change a food the user created (only their own). Send food_id and only the fields to change. If you send portions they replace the old ones.',
      schema: obj({ food_id: text('Id from search_foods.'), ...foodProps }, ['food_id']),
      describe: async (input) => [
        ...line('name', input.name),
        ...line('brand', input.brand),
        ...line(
          'per100',
          [
            input.kcal_100g != null ? `${input.kcal_100g} kcal` : null,
            input.protein_100g != null ? `P ${input.protein_100g}` : null,
            input.carbs_100g != null ? `C ${input.carbs_100g}` : null,
            input.fat_100g != null ? `F ${input.fat_100g}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        ...line('food', await foodName(input.food_id)),
      ],
      run: async (input) => {
        const before = await ownFood(str(input, 'food_id', 60));
        const v = foodFields(input);
        const per100 = per100Of(before);
        for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const)
          if (v[k] != null) per100[k] = v[k];
        for (const k of ['sugars', 'saturates', 'fiber', 'salt'] as const)
          if (v[k] != null) per100[k] = v[k];
        await saveFood.mutateAsync({
          id: before.id,
          name: optStr(input, 'name', 80) ?? before.name,
          brand: optStr(input, 'brand', 60) ?? before.brand ?? '',
          barcode: (optStr(input, 'barcode', 20) ?? before.barcode ?? '').replace(/\D/g, ''),
          per100,
          portions: portionsArg(input) ?? before.servings,
        });
        return {
          content: { updated: before.id },
          undo: async () => {
            await saveFood.mutateAsync({
              id: before.id,
              name: before.name,
              brand: before.brand ?? '',
              barcode: before.barcode ?? '',
              per100: per100Of(before),
              portions: before.servings,
            });
          },
        };
      },
    },
    {
      name: 'delete_food',
      write: true,
      description:
        'Delete a food the user created. Entries already in the food log keep their values.',
      schema: obj({ food_id: text('Id from search_foods.') }, ['food_id']),
      describe: async (input) => line('food', await foodName(input.food_id)),
      run: async (input) => {
        const food = await ownFood(str(input, 'food_id', 60));
        await setFoodDeleted.mutateAsync({ id: food.id, deleted: true });
        return {
          content: { deleted: food.name },
          undo: async () => {
            await setFoodDeleted.mutateAsync({ id: food.id, deleted: false });
          },
        };
      },
    },
    {
      name: 'log_food',
      write: true,
      description:
        'Add something to the food log of a meal. Either a saved food (food_id + grams) or a quick entry with its own totals (name + kcal + protein_g + carbs_g + fat_g for the whole amount).',
      schema: obj(
        {
          day: dayField,
          meal: mealField,
          food_id: text('Id of a saved food (from search_foods or create_food).'),
          grams: number('Amount in grams, with food_id.'),
          name: text('Quick entry: what it is.'),
          kcal: number('Quick entry: total kcal.'),
          protein_g: number('Quick entry: total protein in g.'),
          carbs_g: number('Quick entry: total carbs in g.'),
          fat_g: number('Quick entry: total fat in g.'),
        },
        ['meal'],
      ),
      describe: async (input) => {
        // A saved food: its name and the calories of this amount, not its id.
        const food =
          typeof input.food_id === 'string' && !input.name
            ? await fetchFood(input.food_id).catch(() => null)
            : null;
        const grams = typeof input.grams === 'number' ? input.grams : null;
        return [
          ...line('day', input.day ?? today),
          ...line('meal', input.meal),
          ...line(
            'food',
            food
              ? food.brand
                ? `${food.name} · ${food.brand}`
                : food.name
              : (input.name ?? input.food_id),
          ),
          ...line('amount', grams != null ? `${grams} g` : null),
          ...line(
            'kcal',
            food && grams != null
              ? `${Math.round(scaleNutrition(food.per100, grams).kcal)} kcal`
              : input.kcal,
          ),
        ];
      },
      run: async (input) => {
        const day = dayArg(input, 'day', today);
        const meal = str(input, 'meal', 12) as Meal;
        if (!meals.includes(meal)) throw new Error(`"meal" must be one of ${meals.join(', ')}`);
        const foodId = optStr(input, 'food_id', 60);
        let entry;
        if (foodId) {
          const food = await fetchFood(foodId);
          const grams = num(input, 'grams', 1, 5000);
          entry = {
            foodId: food.id,
            name: food.name,
            quantityLabel: `${grams} g`,
            grams,
            macros: scaleNutrition(food.per100, grams),
          };
        } else {
          entry = {
            foodId: null,
            name: str(input, 'name', 80),
            quantityLabel: null,
            grams: optNum(input, 'grams', 1, 5000) ?? null,
            macros: {
              kcal: num(input, 'kcal', 0, 5000),
              protein: num(input, 'protein_g', 0, 500),
              carbs: num(input, 'carbs_g', 0, 800),
              fat: num(input, 'fat_g', 0, 500),
            },
          };
        }
        const id = await logFood.mutateAsync({ day, meal, ...entry });
        return {
          content: { log_id: id, logged: entry.name, ...entry.macros },
          undo: async () => {
            await setLogDeleted.mutateAsync({ id, deleted: true });
          },
        };
      },
    },
    {
      name: 'remove_food_log',
      write: true,
      description: 'Remove one entry from the food log (log_id comes from get_day).',
      schema: obj({ log_id: text('Id of the entry, from get_day.') }, ['log_id']),
      describe: async (input) => line('food', await logName(input.log_id)),
      run: async (input) => {
        const id = str(input, 'log_id', 60);
        await setLogDeleted.mutateAsync({ id, deleted: true });
        return {
          content: { removed: id },
          undo: async () => {
            await setLogDeleted.mutateAsync({ id, deleted: false });
          },
        };
      },
    },
    {
      name: 'log_water',
      write: true,
      description: 'Add water to a day (default today).',
      schema: obj({ day: dayField, ml: number('Millilitres, 50 to 5000.') }, ['ml']),
      describe: (input) => [...line('day', input.day ?? today), ...line('water', `${input.ml} ml`)],
      run: async (input) => {
        const id = await addWater.mutateAsync({
          day: dayArg(input, 'day', today),
          ml: Math.round(num(input, 'ml', 50, 5000)),
        });
        return {
          content: { logged_ml: input.ml },
          undo: async () => {
            await removeWater.mutateAsync(id);
          },
        };
      },
    },
    {
      name: 'set_meal_status',
      write: true,
      description:
        'For users on fixed meals: mark a planned meal as done (as planned), skipped, adjusted (ate a different amount: give kcal and macros) or pending (clear the mark).',
      schema: obj(
        {
          day: dayField,
          meal: text('Name of the planned meal, as in get_diet.'),
          status: { type: 'string', enum: ['done', 'skipped', 'adjusted', 'pending'] },
          kcal: number('Adjusted: kcal eaten.'),
          protein_g: number('Adjusted: protein eaten in g.'),
          carbs_g: number('Adjusted: carbs eaten in g.'),
          fat_g: number('Adjusted: fat eaten in g.'),
        },
        ['meal', 'status'],
      ),
      describe: (input) => [
        ...line('day', input.day ?? today),
        ...line('meal', input.meal),
        ...line('status', input.status),
        ...line('kcal', input.kcal),
      ],
      run: async (input) => {
        const day = dayArg(input, 'day', today);
        const plan = await fetchFixedPlan();
        if (!plan) throw new Error('The user has no fixed meals plan.');
        const wanted = str(input, 'meal', 60).toLowerCase();
        const meal = plan.meals.find((m) => m.name.toLowerCase() === wanted);
        if (!meal)
          throw new Error(
            `No planned meal "${wanted}". Meals: ${plan.meals.map((m) => m.name).join(', ')}`,
          );
        const status = str(input, 'status', 10);
        const supabase = getSupabase();
        const old = await supabase
          .from('fixed_meal_checks')
          .select('status, kcal, protein_g, carbs_g, fat_g')
          .eq('day', day)
          .eq('fixed_meal_id', meal.id)
          .is('deleted_at', null)
          .maybeSingle();
        const previous = old.data
          ? {
              status: old.data.status as FixedCheck['status'],
              kcal: Number(old.data.kcal),
              proteinG: Number(old.data.protein_g),
              carbsG: Number(old.data.carbs_g),
              fatG: Number(old.data.fat_g),
            }
          : null;
        let check: Omit<FixedCheck, 'fixedMealId'> | null;
        if (status === 'done') check = checkAsPlanned(meal);
        else if (status === 'skipped')
          check = { status: 'skipped', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
        else if (status === 'pending') check = null;
        else if (status === 'adjusted')
          check = {
            status: 'adjusted',
            kcal: num(input, 'kcal', 0, 5000),
            proteinG: optNum(input, 'protein_g', 0, 500) ?? 0,
            carbsG: optNum(input, 'carbs_g', 0, 800) ?? 0,
            fatG: optNum(input, 'fat_g', 0, 500) ?? 0,
          };
        else throw new Error('"status" must be done, skipped, adjusted or pending');
        await setCheck.mutateAsync({ day, mealId: meal.id, check });
        return {
          content: { meal: meal.name, day, status },
          undo: async () => {
            await setCheck.mutateAsync({ day, mealId: meal.id, check: previous });
          },
        };
      },
    },
    {
      name: 'set_nutrition_goal',
      write: true,
      description:
        'Change the daily calorie and macro target from today on (earlier days keep theirs). Never below 1500 kcal and never more than 25% under maintenance; the macros must add up to the calories.',
      schema: obj(
        {
          kcal: number('Daily calories.'),
          protein_g: number('Daily protein in g.'),
          carbs_g: number('Daily carbs in g.'),
          fat_g: number('Daily fat in g.'),
          training_day_bonus_kcal: number('Extra kcal on training days (optional).'),
          water_ml: number(
            "Daily water target in ml (optional): the user's own number instead of the automatic one.",
          ),
          water_automatic: {
            type: 'boolean',
            description:
              "true = the app works out the water target from the user's details (optional).",
          },
        },
        ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
      ),
      describe: (input) => [
        ...line('kcal', input.kcal),
        ...line('protein', input.protein_g != null ? `${input.protein_g} g` : null),
        ...line('carbs', input.carbs_g != null ? `${input.carbs_g} g` : null),
        ...line('fat', input.fat_g != null ? `${input.fat_g} g` : null),
        ...line(
          'water',
          input.water_automatic === true
            ? 'automatic'
            : input.water_ml != null
              ? `${input.water_ml} ml`
              : null,
        ),
      ],
      run: async (input) => {
        const kcal = Math.round(num(input, 'kcal', 500, 8000));
        const proteinG = Math.round(num(input, 'protein_g', 0, 500));
        const carbsG = Math.round(num(input, 'carbs_g', 0, 1000));
        const fatG = Math.round(num(input, 'fat_g', 0, 500));
        const current = goalForDay(await fetchGoals(), today);
        const maintenance = current?.maintenanceKcal ?? null;
        const problem = maintenance
          ? targetProblem(kcal, maintenance)
          : kcal < MIN_DAILY_KCAL
            ? 'below_minimum'
            : null;
        if (problem === 'below_minimum')
          throw new Error('The calorie target is below the 1500 kcal minimum.');
        if (problem === 'deficit_too_large')
          throw new Error('The calorie target is more than 25% under the maintenance calories.');
        const fromMacros = macroKcal({ proteinG, carbsG, fatG });
        if (Math.abs(fromMacros - kcal) > kcal * 0.1)
          throw new Error(
            `The macros add up to ${Math.round(fromMacros)} kcal; they must be within 10% of ${kcal}.`,
          );
        const next = {
          validFrom: today,
          kcal,
          proteinG,
          carbsG,
          fatG,
          trainingDayBonusKcal: Math.round(
            optNum(input, 'training_day_bonus_kcal', 0, 1000) ?? current?.trainingDayBonusKcal ?? 0,
          ),
          maintenanceKcal: maintenance,
          // DECISIONS 127: a number = the user's own target; else it stays as it was.
          ...nextWater(input, current),
        };
        await saveGoal.mutateAsync(next);
        return {
          content: {
            saved: true,
            from: today,
            kcal,
            protein_g: proteinG,
            carbs_g: carbsG,
            fat_g: fatG,
          },
          undo: current
            ? async () => {
                await saveGoal.mutateAsync({
                  validFrom: today,
                  kcal: current.kcal,
                  proteinG: current.proteinG,
                  carbsG: current.carbsG,
                  fatG: current.fatG,
                  trainingDayBonusKcal: current.trainingDayBonusKcal,
                  maintenanceKcal: current.maintenanceKcal,
                  waterMl: current.waterMl,
                  waterAuto: current.waterAuto,
                });
              }
            : undefined,
        };
      },
    },
    {
      name: 'propose_plans',
      write: true,
      description:
        'Create or change workout plans and/or the whole diet, in the plan format (see the system prompt). The user sees the plan and approves it. A changed plan keeps a backup copy.',
      schema: obj({
        workout_plan: { type: 'object', description: 'A workout plan in the plan format.' },
        diet_plan: { type: 'object', description: 'A diet in the plan format.' },
      }),
      describe: (input) => {
        const bundle = parseBundle({
          workout_plan: input.workout_plan,
          diet_plan: input.diet_plan,
        });
        return [
          ...(bundle.workout
            ? line(
                'workoutPlan',
                `${bundle.workout.name} · ${bundle.workout.days.length} days · ${bundle.workout.days.reduce((a, d) => a + d.exercises.length, 0)} exercises`,
              )
            : []),
          ...(bundle.diet
            ? line(
                'dietPlan',
                `${bundle.diet.kcal} kcal · P ${round(bundle.diet.proteinG, 0)} · C ${round(bundle.diet.carbsG, 0)} · F ${round(bundle.diet.fatG, 0)}${bundle.diet.meals.length ? ` · ${bundle.diet.meals.length} meals` : ''}`,
              )
            : []),
          ...bundle.errors.map((value) => ({ label: 'problem', value })),
          ...bundle.warnings.map((value) => ({ label: 'note', value })),
        ];
      },
      run: async (input) => {
        const bundle = parseBundle({
          workout_plan: input.workout_plan,
          diet_plan: input.diet_plan,
        });
        if (bundle.errors.length > 0) throw new Error(bundle.errors.join(' '));
        const done = await applyImport.mutateAsync(bundle);
        await refresh();
        return {
          content: {
            saved: true,
            workout_plan_id: done.workoutPlanId,
            workout_updated: done.workoutUpdated,
            diet_applied: done.dietApplied,
            created_exercises: done.createdExercises,
            skipped_exercises: done.skippedExercises,
            backup: done.backupName,
          },
        };
      },
    },
  ];

  /** Tools that need one category as a whole; mixed ones check inside (overview, day, foods…). */
  const needs: Record<string, AiCategory> = {
    get_body: 'profile',
    log_body: 'profile',
    get_workouts: 'training',
    get_workout_plans: 'training',
    get_diet: 'diet',
    add_supplement: 'diet',
    set_supplement: 'diet',
    create_food: 'diet',
    update_food: 'diet',
    delete_food: 'diet',
    log_food: 'diet',
    remove_food_log: 'diet',
    log_water: 'diet',
    set_meal_status: 'diet',
    set_nutrition_goal: 'diet',
  };
  const gateOf = (name: string): ToolDef['gate'] => {
    if (name === 'propose_plans')
      return (input) =>
        input.workout_plan != null && !access.training
          ? 'training'
          : input.diet_plan != null && !access.diet
            ? 'diet'
            : null;
    const category = needs[name];
    return category ? () => (access[category] ? null : category) : undefined;
  };
  return [...reads, ...writes].map((t) => {
    const gate = gateOf(t.name);
    return gate ? { ...t, gate } : t;
  });
}
