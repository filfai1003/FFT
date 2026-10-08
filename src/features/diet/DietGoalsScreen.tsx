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
import { parseDecimal } from '@/domain/numbers';
import {
  ageInYears,
  defaultMacros,
  macroPercents,
  macrosFromPercents,
  maintenanceKcal,
  minimumAllowedKcal,
  setMacroPercent,
  suggestedKcal,
  targetProblem,
  TRAINING_DAY_BONUS_KCAL,
} from '@/domain/nutrition';
import { useLatestWeight, useProfile, useUpdateProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { starterMeals } from '@/features/onboarding/logic';
import { useFixedPlan, useSaveFixedPlan } from './fixed';
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
  const changeKcal = (next: number) => {
    // Keep the percentages (grams follow the new target).
    setPercents(percents);
    setKcal(next);
  };

  const recalculate = () => {
    const p = profile.data;
    if (!p.birth_date || !p.sex || !p.height_cm || !p.activity_level || !p.goal || !weight.data)
      return;
    const m = maintenanceKcal({
      sex: p.sex as 'male' | 'female',
      weightKg: weight.data.weightKg,
      heightCm: Number(p.height_cm),
      ageYears: ageInYears(new Date(p.birth_date), new Date()),
      activity: p.activity_level as 'sedentary' | 'light' | 'active' | 'physical',
    });
    const next = suggestedKcal(m, p.goal as 'lose_fat' | 'maintain' | 'build_muscle');
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
      if (chosenMode === 'fixed_meals' && !plan.data) {
        await savePlan.mutateAsync({
          planId: null,
          name: t('onboarding.meals.planName'),
          removedIds: [],
          meals: starterMeals(kcal, macros).map((m) => ({
            id: newId(),
            name: m.name,
            kcal: m.kcal,
            proteinG: m.proteinG,
            carbsG: m.carbsG,
            fatG: m.fatG,
            description: '',
            isMain: false,
          })),
        });
      }
      if (chosenMode !== profile.data.diet_mode)
        await saveProfile.mutateAsync({ diet_mode: chosenMode });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const rows = [
    ['protein', macros.proteinG, colors.macroSplit.protein, percents.protein],
    ['carbs', macros.carbsG, colors.macroSplit.carbs, percents.carbs],
    ['fat', macros.fatG, colors.macroSplit.fat, percents.fat],
  ] as const;
  const dots = (pct: number) => Math.round((pct / 100) * 30);

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={18}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={t('goals.title')}
        />

        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
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
          <Text variant="label" muted>
            {t('goals.dailyCalories')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="displayXL" numeric style={{ fontSize: 52, lineHeight: 52 }}>
              {kcal}
            </Text>
            <Text variant="label" muted>
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
              borderStyle: 'dashed',
              borderColor: colors.borderDecorative,
              paddingTop: 10,
            }}
          >
            <Text variant="label" muted style={{ flex: 1, lineHeight: 16 }}>
              {suggestion}
            </Text>
            <Button
              label={t('goals.recalculate')}
              variant="secondary"
              block={false}
              onPress={recalculate}
            />
          </View>
          {problem ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {t(`goals.problem.${problem}`)}
            </Text>
          ) : null}
        </Card>

        <Card gap={12}>
          <Text variant="label" muted>
            {t('goals.macroSplit')}
          </Text>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('goals.splitLabel', {
              p: percents.protein,
              c: percents.carbs,
              f: percents.fat,
            })}
            style={{ flexDirection: 'row', gap: 3 }}
          >
            {Array.from({ length: 30 }, (_, i) => {
              const a = dots(percents.protein);
              const b = a + dots(percents.carbs);
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor:
                      i < a
                        ? colors.macroSplit.protein
                        : i < b
                          ? colors.macroSplit.carbs
                          : colors.macroSplit.fat,
                  }}
                />
              );
            })}
          </View>
          {rows.map(([key, grams, color, pct]) => (
            <View
              key={key}
              style={{
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderTopWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.borderDecorative,
              }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
              <Text style={{ flex: 1 }}>{t(`diet.macro.${key}`)}</Text>
              <Text variant="label" muted style={{ width: 52, textAlign: 'right' }}>
                {t('goals.gramsValue', { g: grams })}
              </Text>
              <View style={{ width: 84 }}>
                <Input
                  variant="compact"
                  accessibilityLabel={t('goals.percentOf', { name: t(`diet.macro.${key}`) })}
                  value={String(pct)}
                  onChangeText={(v) =>
                    setPercents(setMacroPercent(percents, key, parseDecimal(v) ?? 0))
                  }
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
              <Text variant="label" muted>
                {t('goals.percentSign')}
              </Text>
            </View>
          ))}
        </Card>

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
            <Text variant="label" muted>
              {t('goals.trainingBonusDetail')}
            </Text>
          </View>
          <Toggle
            value={bonusOn}
            onValueChange={setBonus}
            accessibilityLabel={t('goals.trainingBonus')}
          />
        </View>

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
          disabled={!!problem || saveGoal.isPending || saveProfile.isPending}
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
