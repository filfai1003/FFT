import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormHeader } from '@/components/ui/FormHeader';
import { Input } from '@/components/ui/Input';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import {
  ageInYears,
  defaultMacros,
  macroPercents,
  macrosFromPercents,
  rebalanceMeals,
  maintenanceFromDetails,
  minimumAllowedKcal,
  suggestedKcal,
  targetProblem,
  TRAINING_DAY_BONUS_KCAL,
} from '@/domain/nutrition';
import { useLatestWeight, useProfile, useUpdateProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { starterMeals } from '@/features/onboarding/logic';
import { useFixedPlan, useSaveFixedPlan } from './fixed';
import { MacroSplitCard } from './MacroSplitCard';
import { MealPlanEditor, type MealDraft } from './MealPlanEditor';
import { useGoalForDay, useSaveGoal } from './log';
import { newId } from '@/lib/uuid';
import { goBack } from '@/lib/navigation';

/** Diet goals & tracking mode: how you track, daily calories, macro split, training-day bonus. */
export function DietGoalsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const profile = useProfile();
  const weight = useLatestWeight();
  const goal = useGoalForDay(today);
  const plan = useFixedPlan();
  const saveGoal = useSaveGoal();
  const saveProfile = useUpdateProfile();
  const savePlan = useSaveFixedPlan();

  const [mode, setMode] = useState<'tracking' | 'fixed_meals' | null>(null);
  const [kcalDraft, setKcal] = useState<number | null>(null);
  const [percentDraft, setPercents] = useState<{
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [bonusDraft, setBonus] = useState<boolean | null>(null);
  const [maintenanceDraft, setMaintenance] = useState<number | null>(null);
  // Ids of the suggested meals (used when there is no plan yet): stable between renders.
  const [starterIds] = useState(() => Array.from({ length: 8 }, () => newId()));
  const [mealsDraft, setMealsDraft] = useState<MealDraft[] | null>(null);
  const [workoutDraft, setWorkoutDraft] = useState<string | null | undefined>(undefined);
  const [planName, setPlanName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!goal || !profile.data) return <Screen>{null}</Screen>;

  const chosenMode = mode ?? (profile.data.diet_mode as 'tracking' | 'fixed_meals');
  const maintenance = maintenanceDraft ?? goal.maintenanceKcal;
  const kcal = kcalDraft ?? goal.kcal;
  // The split is edited as percentages of the calorie target; grams are derived from it.
  const percents =
    percentDraft ??
    macroPercents({ proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG });
  const macros = percentDraft
    ? macrosFromPercents(kcal, percentDraft)
    : { proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG };
  const bonusOn = bonusDraft ?? goal.trainingDayBonusKcal > 0;
  const minimum = maintenance ? minimumAllowedKcal(maintenance) : 1500;
  const problem = maintenance
    ? targetProblem(kcal, maintenance)
    : kcal < 1500
      ? 'below_minimum'
      : null;
  // Meals of the plan (fixed meals mode), always kept on the target set above.
  const target = { kcal, ...macros };
  const baseMeals: MealDraft[] =
    mealsDraft ??
    (plan.data
      ? plan.data.meals.map(({ position: _p, ...m }) => m)
      : starterMeals(target).map((m, i) => ({ ...m, id: starterIds[i] })));
  const balanced = rebalanceMeals(
    target,
    baseMeals.map((m) => ({ kcal: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG })),
    -1,
  );
  const meals: MealDraft[] = baseMeals.map((m, i) => ({ ...m, ...balanced[i] }));
  const requestedWorkout =
    workoutDraft === undefined ? (plan.data?.workoutAfterMealId ?? null) : workoutDraft;
  const workoutAfter = meals.some((m) => m.id === requestedWorkout) ? requestedWorkout : null;
  const mealsValid = chosenMode !== 'fixed_meals' || meals.every((m) => m.name.trim() !== '');

  const changeKcal = (next: number) => {
    // Keep the percentages (grams follow the new target).
    setPercents(percents);
    setKcal(next);
  };

  const p = profile.data;
  // Every detail is optional (DECISIONS 103): no suggestion without sex, age, height and weight
  // (the screen then says to add them); a skipped activity or goal uses the cautious default.
  const profileMaintenance = maintenanceFromDetails({
    sex: p.sex as 'male' | 'female' | null,
    weightKg: weight.data?.weightKg,
    heightCm: p.height_cm != null ? Number(p.height_cm) : null,
    ageYears: p.birth_date ? ageInYears(new Date(p.birth_date), new Date()) : null,
    activity: p.activity_level as 'sedentary' | 'light' | 'active' | 'physical' | null,
  });

  const recalculate = () => {
    const m = profileMaintenance;
    if (m == null || !weight.data) return;
    const next = suggestedKcal(
      m,
      (p.goal ?? 'maintain') as 'lose_fat' | 'maintain' | 'build_muscle',
    );
    setMaintenance(m);
    setKcal(next);
    setPercents(macroPercents(defaultMacros(next, weight.data.weightKg)));
  };

  const suggestion = (() => {
    if (!maintenance) return t('goals.noSuggestion');
    const pct = Math.round(((kcal - maintenance) / maintenance) * 100);
    return t('goals.suggested', {
      kcal: suggestedKcalFromProfile(profile.data, maintenance),
      maintenance,
      pct: pct === 0 ? '±0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
    });
  })();

  const submit = async () => {
    if (problem) return;
    setError(null);
    try {
      await saveGoal.mutateAsync({
        validFrom: today,
        kcal,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        trainingDayBonusKcal: bonusOn ? TRAINING_DAY_BONUS_KCAL : 0,
        maintenanceKcal: maintenance,
        waterMl: goal.waterMl,
      });
      if (chosenMode === 'fixed_meals') {
        await savePlan.mutateAsync({
          planId: plan.data?.id ?? null,
          name:
            (planName ?? plan.data?.name ?? t('onboarding.meals.planName')).trim() ||
            t('onboarding.meals.planName'),
          meals,
          workoutAfterMealId: workoutAfter,
          removedIds: (plan.data?.meals ?? [])
            .map((m) => m.id)
            .filter((id) => !meals.some((m) => m.id === id)),
        });
      }
      if (chosenMode !== profile.data.diet_mode)
        await saveProfile.mutateAsync({ diet_mode: chosenMode });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={18}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={t('goals.title')}
        />

        <View style={{ gap: 8 }}>
          <Text variant="bodyS" muted>
            {t('goals.howYouTrack')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
            <View style={{ flex: 1 }}>
              <OptionCard
                title={t('onboarding.mode.tracking')}
                description={t('onboarding.mode.trackingDetail')}
                selected={chosenMode === 'tracking'}
                onPress={() => setMode('tracking')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <OptionCard
                title={t('onboarding.mode.fixed')}
                description={t('onboarding.mode.fixedDetail')}
                selected={chosenMode === 'fixed_meals'}
                onPress={() => setMode('fixed_meals')}
              />
            </View>
          </View>
        </View>

        <Card gap={12}>
          <Text variant="bodyS" muted>
            {t('goals.dailyCalories')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="displayXL" numeric style={{ fontSize: 52, lineHeight: 52 }}>
              {kcal}
            </Text>
            <Text variant="bodyS" muted>
              {t('common.kcal')}
            </Text>
          </View>
          <Stepper
            value={kcal}
            min={minimum}
            max={6000}
            step={50}
            onChange={changeKcal}
            format={(v) => `${v} ${t('common.kcal')}`}
            decreaseLabel={t('goals.lower')}
            increaseLabel={t('goals.raise')}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              borderTopWidth: 1,
              borderColor: colors.borderDecorative,
              paddingTop: 10,
            }}
          >
            <Text variant="bodyS" muted style={{ flex: 1, lineHeight: 16 }}>
              {suggestion}
            </Text>
            <Button
              label={t('goals.recalculate')}
              variant="secondary"
              block={false}
              disabled={profileMaintenance == null}
              onPress={recalculate}
            />
          </View>
          {problem ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {t(`goals.problem.${problem}`)}
            </Text>
          ) : null}
        </Card>

        <MacroSplitCard kcal={kcal} percents={percents} onChange={setPercents} />

        <View
          style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingLeft: 16,
            paddingRight: 8,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.borderDecorative,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text>{t('goals.trainingBonus')}</Text>
            <Text variant="bodyS" muted>
              {t('goals.trainingBonusDetail')}
            </Text>
          </View>
          <Toggle
            value={bonusOn}
            onValueChange={setBonus}
            accessibilityLabel={t('goals.trainingBonus')}
          />
        </View>

        {chosenMode === 'fixed_meals' ? (
          <View style={{ gap: 12 }}>
            <Text variant="bodyS" muted>
              {t('goals.mealsTitle')}
            </Text>
            <Input
              label={t('fixed.planName')}
              value={planName ?? plan.data?.name ?? t('onboarding.meals.planName')}
              onChangeText={setPlanName}
            />
            <MealPlanEditor
              meals={meals}
              onMealsChange={setMealsDraft}
              goal={target}
              workoutAfter={workoutAfter}
              onWorkoutAfterChange={setWorkoutDraft}
            />
          </View>
        ) : null}

        <Text variant="bodyS" muted>
          {t('onboarding.target.safety')}
        </Text>
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={t('goals.save')}
          disabled={
            !!problem ||
            !mealsValid ||
            saveGoal.isPending ||
            saveProfile.isPending ||
            savePlan.isPending
          }
          onPress={submit}
        />
      </BottomActionBar>
    </>
  );
}

/** The calorie suggestion for the profile goal at a given maintenance. */
function suggestedKcalFromProfile(profile: { goal: string | null }, maintenance: number): number {
  return suggestedKcal(
    maintenance,
    (profile.goal as 'lose_fat' | 'maintain' | 'build_muscle') ?? 'maintain',
  );
}
