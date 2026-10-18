import { deviceTimeZone, localDay } from '@/domain/day';
import { getSupabase } from '@/lib/supabase';
import { stableId } from '@/lib/uuid';
import {
  bodyDetails,
  POLICY_VERSION,
  starterMeals,
  targetsFor,
  toIsoDate,
  type OnboardingDraft,
} from './logic';

export const DEFAULT_WATER_ML = 2000;

/**
 * Writes everything the onboarding collected. Every row has a client UUID and the profile is
 * updated LAST, so if something fails halfway the user stays in onboarding and can retry
 * (the rows already written are replaced by upsert, never duplicated).
 */
export async function completeOnboarding(
  draft: OnboardingDraft,
  userId: string,
  planName: string,
  now = new Date(),
): Promise<string | null> {
  // The two required inputs; the screens never get here without them.
  if (draft.name.trim() === '' || !draft.adultConfirmed) return 'NAME_AND_AGE_REQUIRED';
  const supabase = getSupabase();
  const timezone = deviceTimeZone();
  const day = localDay(now, timezone);
  const t = targetsFor(draft, now);
  const goal = { kcal: t.kcal, ...t.macros };
  // Everything but the name and the 18+ confirmation is optional (DECISIONS 103): what is missing
  // stays null (no weight row without a weight).
  const details = bodyDetails(draft, now);

  const id = (purpose: string) => stableId(userId, purpose);
  const ids = {
    weight: await id('first-weight'),
    goal: await id(`goal-${day}`), // same id as a later "Save goals" of that day: one goal per day
    plan: await id('first-meal-plan'),
    health: await id('consent-health_data'),
    analytics: await id('consent-analytics'),
  };

  const steps: (() => PromiseLike<{ error: { message: string } | null }>)[] = [];
  if (t.weightKg != null) {
    const weightKg = t.weightKg;
    steps.push(() =>
      supabase.from('body_metrics').upsert({
        id: ids.weight,
        user_id: userId,
        day,
        weight_kg: weightKg,
      }),
    );
  }
  // "No target" (DECISIONS 104) is a row too: no calories or macros from that day on, the water
  // goal kept. So a target set later never applies to the days before it.
  const withTarget = draft.target === 'set';
  steps.push(() =>
    supabase.from('nutrition_goals').upsert({
      id: ids.goal,
      user_id: userId,
      valid_from: day,
      kcal: withTarget ? t.kcal : null,
      protein_g: withTarget ? t.macros.proteinG : null,
      carbs_g: withTarget ? t.macros.carbsG : null,
      fat_g: withTarget ? t.macros.fatG : null,
      maintenance_kcal: withTarget ? t.maintenance : null,
      water_ml: DEFAULT_WATER_ML,
    }),
  );

  if (draft.dietMode === 'fixed_meals') {
    const planId = ids.plan;
    // Without a target the suggested meals still start from the default day (the user edits them).
    const meals = draft.meals ?? starterMeals(goal);
    // Suggested meals have placeholder ids: give them stable UUIDs so a retry never duplicates.
    const mealId = (m: { id: string }) =>
      m.id.startsWith('starter-') ? id(`first-meal-${m.id}`) : Promise.resolve(m.id);
    const mealIds = await Promise.all(meals.map(mealId));
    const workoutIndex = meals.findIndex((m) => m.id === draft.workoutAfterId);
    steps.push(
      () =>
        supabase.from('fixed_meal_plans').upsert({
          id: planId,
          user_id: userId,
          name: planName,
          workout_after_meal_id: workoutIndex >= 0 ? mealIds[workoutIndex] : null,
        }),
      () =>
        supabase.from('fixed_meals').upsert(
          meals.map((m, position) => ({
            id: mealIds[position],
            user_id: userId,
            plan_id: planId,
            position,
            name: m.name.trim(),
            kcal: m.kcal,
            protein_g: m.proteinG,
            carbs_g: m.carbsG,
            fat_g: m.fatG,
            description: m.description.trim() || null,
            is_main: m.isMain,
          })),
        ),
    );
  }

  const consents = [{ type: 'health_data' as const, granted: draft.consentHealth }].filter(
    (c) => c.granted,
  );
  steps.push(() =>
    supabase.from('consents').upsert(
      consents.map((c) => ({
        id: c.type === 'health_data' ? ids.health : ids.analytics,
        user_id: userId,
        type: c.type,
        policy_version: POLICY_VERSION,
      })),
    ),
  );

  steps.push(() =>
    supabase
      .from('profiles')
      .update({
        name: draft.name.trim(),
        adult_confirmed_at: draft.adultConfirmed ? now.toISOString() : null,
        birth_date: details.birth ? toIsoDate(details.birth) : null,
        sex: draft.sex,
        height_cm: details.heightCm,
        activity_level: draft.activity,
        experience: draft.experience,
        training_location: draft.location,
        goal: draft.goal,
        timezone,
        diet_mode: draft.dietMode ?? 'tracking',
        onboarding_completed_at: now.toISOString(),
      })
      .eq('id', userId),
  );

  for (const step of steps) {
    const { error } = await step();
    if (error) return error.message;
  }
  return null;
}
