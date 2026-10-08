import { deviceTimeZone, localDay } from '@/domain/day';
import { getSupabase } from '@/lib/supabase';
import { stableId } from '@/lib/uuid';
import {
  parseBirthDate,
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
  const supabase = getSupabase();
  const timezone = deviceTimeZone();
  const day = localDay(now, timezone);
  const t = targetsFor(draft, now);
  const birth = parseBirthDate(draft.birthDay, draft.birthMonth, draft.birthYear)!;

  const id = (purpose: string) => stableId(userId, purpose);
  const ids = {
    weight: await id('first-weight'),
    goal: await id(`goal-${day}`), // same id as a later "Save goals" of that day: one goal per day
    plan: await id('first-meal-plan'),
    health: await id('consent-health_data'),
    analytics: await id('consent-analytics'),
    meals: await Promise.all([0, 1, 2, 3].map((i) => id(`first-meal-${i}`))),
  };

  const steps: (() => PromiseLike<{ error: { message: string } | null }>)[] = [
    () =>
      supabase.from('body_metrics').upsert({
        id: ids.weight,
        user_id: userId,
        day,
        weight_kg: t.weightKg,
      }),
    () =>
      supabase.from('nutrition_goals').upsert({
        id: ids.goal,
        user_id: userId,
        valid_from: day,
        kcal: t.kcal,
        protein_g: t.macros.proteinG,
        carbs_g: t.macros.carbsG,
        fat_g: t.macros.fatG,
        maintenance_kcal: t.maintenance,
        water_ml: DEFAULT_WATER_ML,
      }),
  ];

  if (draft.dietMode === 'fixed_meals') {
    const planId = ids.plan;
    steps.push(
      () =>
        supabase.from('fixed_meal_plans').upsert({ id: planId, user_id: userId, name: planName }),
      () =>
        supabase.from('fixed_meals').upsert(
          starterMeals(t.kcal, t.macros).map((m) => ({
            id: ids.meals[m.position],
            user_id: userId,
            plan_id: planId,
            position: m.position,
            name: m.name,
            kcal: m.kcal,
            protein_g: m.proteinG,
            carbs_g: m.carbsG,
            fat_g: m.fatG,
          })),
        ),
    );
  }

  const consents = [
    { type: 'health_data' as const, granted: draft.consentHealth },
    { type: 'analytics' as const, granted: draft.consentAnalytics },
  ].filter((c) => c.granted);
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
        birth_date: toIsoDate(birth),
        sex: draft.sex,
        height_cm: Number(draft.heightCm.replace(',', '.')),
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
