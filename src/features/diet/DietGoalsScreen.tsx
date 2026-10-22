import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconTile } from '@/components/ui/IconTile';
import { InfoButton } from '@/components/ui/InfoButton';
import { Input } from '@/components/ui/Input';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { radius } from '@/design/tokens';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { goalForDay, hasTarget } from '@/domain/diet';
import {
  ageInYears,
  clampTarget,
  DEFAULT_DAILY_KCAL,
  defaultMacros,
  macroPercents,
  macrosFromPercents,
  rebalanceMeals,
  maintenanceFromDetails,
  minimumAllowedKcal,
  startingMacros,
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
import { useGoals, useRemoveTarget, useSaveGoal, useSaveWaterTarget } from './log';
import { useWaterTarget } from './water-target';
import { litres, waterTargetLines } from './water-text';
import { DEFAULT_WATER_ML, WATER_MANUAL_MAX_ML, WATER_MANUAL_MIN_ML } from '@/domain/hydration';
import type { Translate } from '@/i18n';
import { useToastStore } from '@/lib/toast-store';
import { newId } from '@/lib/uuid';
import { goBack } from '@/lib/navigation';

/**
 * Diet goals & tracking mode: how you track, a calorie target or none (DECISIONS 104), daily
 * calories, macro split, training-day bonus, and the water target: automatic (from the user's
 * details, DECISIONS 127) or their own number.
 */
export function DietGoalsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const profile = useProfile();
  const weight = useLatestWeight();
  const goals = useGoals();
  const goal = goalForDay(goals.data ?? [], today);
  const plan = useFixedPlan();
  const saveGoal = useSaveGoal();
  const removeTarget = useRemoveTarget();
  const showToast = useToastStore((s) => s.show);
  const saveProfile = useUpdateProfile();
  const savePlan = useSaveFixedPlan();
  const saveWater = useSaveWaterTarget();
  const { target: water } = useWaterTarget(today);

  const [mode, setMode] = useState<'tracking' | 'fixed_meals' | null>(null);
  const [targetDraft, setTargetDraft] = useState<'set' | 'none' | null>(null);
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
  const [waterModeDraft, setWaterMode] = useState<'auto' | 'own' | null>(null);
  const [waterMlDraft, setWaterMl] = useState<number | null>(null);

  if (goals.isPending || !profile.data)
    return (
      <Screen gap={18}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={t('goals.title')}
        />
        <SkeletonGroup accessibilityLabel={t('common.loading')} gap={8}>
          <Skeleton height={76} style={{ borderRadius: radius.cardSmall }} />
          <Skeleton height={76} style={{ borderRadius: radius.cardSmall }} />
          <Skeleton height={200} style={{ borderRadius: radius.card, marginTop: 10 }} />
        </SkeletonGroup>
      </Screen>
    );

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

  const chosenMode = mode ?? (p.diet_mode as 'tracking' | 'fixed_meals');
  // "No target" (DECISIONS 104): calories are tracked without any target. Turning a target on
  // starts from the suggestion (or the default), never under the safety floor.
  const current = hasTarget(goal) ? goal : null;
  const withTarget = (targetDraft ?? (current ? 'set' : 'none')) === 'set';
  const startKcal = clampTarget(
    profileMaintenance != null
      ? suggestedKcalFromProfile(p, profileMaintenance)
      : DEFAULT_DAILY_KCAL,
    profileMaintenance,
  );
  const startMacros = current ?? startingMacros(startKcal, weight.data?.weightKg);
  const maintenance = maintenanceDraft ?? (current ? current.maintenanceKcal : profileMaintenance);
  const kcal = kcalDraft ?? current?.kcal ?? startKcal;
  // The split is edited as percentages of the calorie target; grams are derived from it.
  const percents =
    percentDraft ??
    macroPercents({
      proteinG: startMacros.proteinG,
      carbsG: startMacros.carbsG,
      fatG: startMacros.fatG,
    });
  const macros = percentDraft
    ? macrosFromPercents(kcal, percentDraft)
    : { proteinG: startMacros.proteinG, carbsG: startMacros.carbsG, fatG: startMacros.fatG };
  const bonusOn = bonusDraft ?? (current?.trainingDayBonusKcal ?? 0) > 0;
  const minimum = maintenance ? minimumAllowedKcal(maintenance) : 1500;
  // The safety limits apply whenever a target is set (1500 kcal floor, deficit at most 25%).
  const problem = !withTarget
    ? null
    : maintenance
      ? targetProblem(kcal, maintenance)
      : kcal < 1500
        ? 'below_minimum'
        : null;
  // Meals of the plan (fixed meals mode), kept on the target set above; without a target they
  // stay as the user sets them (the suggested ones start from the default day).
  const target = { kcal, ...macros };
  const baseMeals: MealDraft[] =
    mealsDraft ??
    (plan.data
      ? plan.data.meals.map(({ position: _p, ...m }) => m)
      : starterMeals(target).map((m, i) => ({ ...m, id: starterIds[i] })));
  const balanced = withTarget
    ? rebalanceMeals(
        target,
        baseMeals.map((m) => ({
          kcal: m.kcal,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
        })),
        -1,
      )
    : null;
  const meals: MealDraft[] = baseMeals.map((m, i) => ({ ...m, ...balanced?.[i] }));
  const requestedWorkout =
    workoutDraft === undefined ? (plan.data?.workoutAfterMealId ?? null) : workoutDraft;
  const workoutAfter = meals.some((m) => m.id === requestedWorkout) ? requestedWorkout : null;
  const mealsValid = chosenMode !== 'fixed_meals' || meals.every((m) => m.name.trim() !== '');

  // Water (DECISIONS 127): automatic unless the user set their own number.
  const autoWaterMl = water?.auto.ml ?? DEFAULT_WATER_ML;
  const savedWaterAuto = goal?.waterAuto ?? true;
  const waterMode = waterModeDraft ?? (savedWaterAuto ? 'auto' : 'own');
  // Their own number starts from the last one they chose, else from the automatic target.
  const ownWaterMl =
    waterMlDraft ?? (goal && !goal.waterAuto ? goal.waterMl : Math.round(autoWaterMl / 100) * 100);
  const waterAuto = waterMode === 'auto';
  const waterMlToSave = waterAuto ? (goal?.waterMl ?? DEFAULT_WATER_ML) : ownWaterMl;
  const waterChanged = waterAuto !== savedWaterAuto || (!waterAuto && ownWaterMl !== goal?.waterMl);
  const tr = t as unknown as Translate;

  const changeKcal = (next: number) => {
    // Keep the percentages (grams follow the new target).
    setPercents(percents);
    setKcal(next);
  };

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

  const isSuggested =
    maintenance != null && kcal === suggestedKcalFromProfile(p, maintenance) && !problem;
  const suggestion = (() => {
    if (!maintenance) return t('goals.noSuggestion');
    const pct = Math.round(((kcal - maintenance) / maintenance) * 100);
    return t('goals.suggested', {
      kcal: suggestedKcalFromProfile(p, maintenance),
      maintenance,
      pct: pct === 0 ? '±0%' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
    });
  })();

  const submit = async () => {
    if (problem) return;
    setError(null);
    try {
      let undo: (() => Promise<void>) | null = null;
      if (withTarget)
        await saveGoal.mutateAsync({
          validFrom: today,
          kcal,
          proteinG: macros.proteinG,
          carbsG: macros.carbsG,
          fatG: macros.fatG,
          trainingDayBonusKcal: bonusOn ? TRAINING_DAY_BONUS_KCAL : 0,
          maintenanceKcal: maintenance,
          waterMl: waterMlToSave,
          waterAuto,
        });
      else {
        if (current) undo = await removeTarget.mutateAsync({ day: today, current: goal });
        // Without a calorie target the water target still has its row (kcal null).
        if (waterChanged)
          await saveWater.mutateAsync({
            day: today,
            current: current ? null : goal,
            water: { auto: waterAuto, ml: waterMlToSave },
          });
      }
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
      if (chosenMode !== p.diet_mode) await saveProfile.mutateAsync({ diet_mode: chosenMode });
      goBack(router);
      if (undo) {
        const restore = undo;
        showToast({
          message: t('goals.targetRemoved'),
          actionLabel: t('common.undo'),
          onAction: () => void restore(),
        });
      }
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="bodyS" muted>
              {t('goals.howYouTrack')}
            </Text>
            <InfoButton topic="trackingMode" />
          </View>
          {/* Stacked, each with its icon (canvas "Diet goals"): side by side the two
              descriptions wrapped into narrow columns. */}
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            <OptionCard
              title={t('onboarding.mode.tracking')}
              description={t('onboarding.mode.trackingDetail')}
              icon={{ name: 'search', tint: colors.nutritionSoft, ink: colors.nutritionInk }}
              selected={chosenMode === 'tracking'}
              onPress={() => setMode('tracking')}
            />
            <OptionCard
              title={t('onboarding.mode.fixed')}
              description={t('onboarding.mode.fixedDetail')}
              icon={{ name: 'check', tint: colors.nutritionSoft, ink: colors.nutritionInk }}
              selected={chosenMode === 'fixed_meals'}
              onPress={() => setMode('fixed_meals')}
            />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="bodyS" muted>
            {t('goals.target')}
          </Text>
          <Segmented
            accessibilityLabel={t('goals.target')}
            value={withTarget ? 'set' : 'none'}
            onChange={setTargetDraft}
            options={[
              { value: 'set', label: t('goals.setTarget') },
              { value: 'none', label: t('goals.noTarget') },
            ]}
          />
          {withTarget ? null : (
            <Text variant="bodyS" muted>
              {t('goals.noTargetDetail')}
            </Text>
          )}
        </View>

        {withTarget ? (
          <>
            <Card gap={12}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text semibold>{t('goals.dailyCalories')}</Text>
                  <InfoButton topic="calorieTarget" />
                </View>
                {isSuggested ? (
                  <StatusChip area="nutrition" label={t('goals.suggestedChip')} />
                ) : null}
              </View>
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
                <InfoButton topic="maintenance" />
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
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                paddingLeft: 12,
                paddingRight: 8,
                borderRadius: radius.cardSmall,
                borderWidth: 1,
                borderColor: colors.borderDecorative,
                backgroundColor: colors.surface,
              }}
            >
              {/* Training's own colour: the bonus depends on a workout (DECISIONS 107). */}
              <IconTile icon="dumbbell" area="training" />
              <View style={{ flex: 1, gap: 2, paddingVertical: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ flexShrink: 1 }}>{t('goals.trainingBonus')}</Text>
                  <InfoButton topic="trainingBonus" />
                </View>
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
          </>
        ) : null}

        <Card gap={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconTile icon="droplet" area="water" />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text semibold style={{ flexShrink: 1 }}>
                {t('goals.waterMode')}
              </Text>
              <InfoButton
                topic="water"
                yours={
                  water
                    ? waterTargetLines(tr, {
                        ...water,
                        automatic: waterAuto,
                        ml: waterAuto ? water.auto.ml : ownWaterMl,
                      })
                    : undefined
                }
              />
            </View>
            <Text variant="bodyS" muted numeric>
              {waterAuto
                ? t('goals.waterAutoValue', { l: litres(autoWaterMl) })
                : t('goals.waterOwnValue', { l: litres(ownWaterMl) })}
            </Text>
          </View>
          <Segmented
            accessibilityLabel={t('goals.waterMode')}
            value={waterMode}
            onChange={setWaterMode}
            options={[
              { value: 'auto', label: t('goals.waterAuto') },
              { value: 'own', label: t('goals.waterOwn') },
            ]}
          />
          {waterAuto ? (
            <Text variant="bodyS" muted>
              {t('goals.waterAutoDetail', { l: litres(autoWaterMl) })}
            </Text>
          ) : (
            <>
              <Stepper
                value={ownWaterMl}
                min={WATER_MANUAL_MIN_ML}
                max={WATER_MANUAL_MAX_ML}
                step={100}
                onChange={setWaterMl}
                format={(v) => `${litres(v)} ${t('today.litresUnit')}`}
                decreaseLabel={t('goals.waterLower')}
                increaseLabel={t('goals.waterRaise')}
              />
              <Text variant="bodyS" muted>
                {t('goals.waterOwnDetail', { l: litres(autoWaterMl) })}
              </Text>
            </>
          )}
        </Card>

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
              goal={withTarget ? target : null}
              workoutAfter={workoutAfter}
              onWorkoutAfterChange={setWorkoutDraft}
            />
          </View>
        ) : null}

        {withTarget ? (
          <Text variant="bodyS" muted>
            {t('onboarding.target.safety')}
          </Text>
        ) : null}
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
            savePlan.isPending ||
            saveWater.isPending
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
