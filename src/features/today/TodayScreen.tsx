import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { checkAsPlanned, mealForHour, nextFixedMeal } from '@/domain/diet';
import { dotsOn } from '@/domain/dots';
import { parseDecimal } from '@/domain/numbers';
import { displayWeight, storedWeight } from '@/domain/units';
import { useDayTarget } from '@/features/diet/day-hooks';
import { useFixedChecks, useFixedPlan, useSetCheck } from '@/features/diet/fixed';
import { useAddWater, useDayTotals, useRemoveWater, useWater } from '@/features/diet/log';
import { useProfile, useLatestWeight } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useSaveCheckIn } from '@/features/progress/data';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { useStartWorkout } from '@/features/session/start';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { estimateMinutes, useActivePlan, useRotation } from '@/features/train/plans';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';

/** Today: calories left, today's workout, and one-tap logging of a meal, weight and water. */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const profile = useProfile();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const glassMl = usePreferencesStore((s) => s.waterGlassMl);
  const showToast = useToastStore((s) => s.show);

  const totals = useDayTotals(today);
  const target = useDayTarget(today);
  const eaten = totals.data ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const left = target ? Math.max(0, Math.round(target.kcal - eaten.kcal)) : 0;

  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const { startDay } = useStartWorkout();
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];

  const weight = useLatestWeight();
  const saveCheckIn = useSaveCheckIn();
  const [weightSheet, setWeightSheet] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  const water = useWater(today);
  const addWater = useAddWater();
  const removeWater = useRemoveWater();
  const goalGlasses = Math.max(1, Math.round((target ? 2000 : 2000) / glassMl));
  const glasses = Math.round((water.data?.totalMl ?? 0) / glassMl);

  const fixed = profile.data?.diet_mode === 'fixed_meals';
  const plannedMeals = useFixedPlan();
  const checks = useFixedChecks(today);
  const setCheck = useSetCheck();
  const nextMealId = plannedMeals.data
    ? nextFixedMeal(plannedMeals.data.meals, checks.data ?? [])
    : null;
  const nextMeal = plannedMeals.data?.meals.find((m) => m.id === nextMealId);

  const onMeal = () => {
    if (fixed) {
      if (!nextMeal) return;
      setCheck.mutate({ day: today, mealId: nextMeal.id, check: checkAsPlanned(nextMeal) });
      confirm();
      showToast({
        message: t('diet.mealDone', { name: nextMeal.name }),
        actionLabel: t('common.undo'),
        bottomOffset: barHeight,
        onAction: () => setCheck.mutate({ day: today, mealId: nextMeal.id, check: null }),
      });
    } else {
      router.push({
        pathname: '/food-search',
        params: { meal: mealForHour(new Date().getHours()), day: today },
      });
    }
  };

  const onWater = async () => {
    const id = await addWater.mutateAsync({ day: today, ml: glassMl });
    confirm();
    showToast({
      message: t('today.waterAdded'),
      actionLabel: t('common.undo'),
      bottomOffset: barHeight,
      onAction: () => removeWater.mutate(id),
    });
  };

  // Takes back the last glass; UNDO puts the same entry back.
  const onWaterLess = () => {
    const last = water.data?.rows.at(-1);
    if (!last) return;
    removeWater.mutate(last.id);
    confirm();
    showToast({
      message: t('today.waterRemoved'),
      actionLabel: t('common.undo'),
      bottomOffset: barHeight,
      onAction: () => addWater.mutate({ day: today, ml: last.ml, id: last.id }),
    });
  };

  const macroRows = target
    ? ([
        ['protein', eaten.protein, target.protein],
        ['carbs', eaten.carbs, target.carbs],
        ['fat', eaten.fat, target.fat],
      ] as const)
    : [];

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={16}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            <Text variant="label" muted>
              {shortDateLabel(today)}
            </Text>
            <Text variant="displayL">{t('today.title')}</Text>
          </View>
          <IconButton
            icon="bell"
            accessibilityLabel={t('today.notifications')}
            onPress={() => router.push('/profile/settings')}
          />
        </View>

        <ActiveSessionBanner />

        <Card gap={14}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text variant="label" muted>
              {t('today.caloriesLeft')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }}
              />
              <Text variant="label" muted>
                {t('today.live')}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text variant="displayXL" numeric>
              {left}
            </Text>
            <Text variant="label" muted>
              {t('today.ofKcal', { kcal: Math.round(target?.kcal ?? 0) })}
            </Text>
          </View>
          <DotBar
            total={40}
            on={dotsOn(eaten.kcal, target?.kcal ?? 0, 40)}
            size={10}
            gap={4}
            accessibilityLabel={t('diet.caloriesBar', {
              eaten: Math.round(eaten.kcal),
              target: Math.round(target?.kcal ?? 0),
            })}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              borderTopWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.borderDecorative,
              paddingTop: 12,
            }}
          >
            {macroRows.map(([key, value, goal]) => (
              <View key={key} style={{ flex: 1, gap: 6 }}>
                <Text variant="label" muted>
                  {t(`diet.macro.${key}`)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text variant="displayS" numeric>
                    {Math.round(value)}
                  </Text>
                  <Text variant="label" muted>
                    {`/${Math.round(goal)}g`}
                  </Text>
                </View>
                <DotBar
                  total={10}
                  on={dotsOn(value, goal, 10)}
                  size={6}
                  gap={3}
                  accessibilityLabel={t(`diet.macro.${key}`)}
                />
              </View>
            ))}
          </View>
        </Card>

        <Card gap={10} style={{ paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" muted>
              {t('today.workout')}
            </Text>
            {plan && rotation ? (
              <Text variant="label" muted>
                {t('today.cycleProgress', {
                  n: rotation.state.cycle,
                  done: rotation.state.doneCount,
                  total: rotation.state.totalDays,
                })}
              </Text>
            ) : null}
          </View>
          {upNext && plan ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="displayM" numberOfLines={1}>
                    {upNext.name}
                  </Text>
                  <Text variant="bodyS" muted>
                    {t('train.exerciseCount', {
                      count: upNext.exercises.length,
                      min: estimateMinutes(upNext),
                    })}
                  </Text>
                </View>
                <Button
                  label={t('train.start')}
                  icon="play"
                  block={false}
                  disabled={upNext.exercises.length === 0}
                  onPress={() => startDay(plan, upNext, rotation)}
                />
              </View>
              <Button
                label={t('train.differentDay')}
                variant="ghost"
                onPress={() =>
                  router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } })
                }
              />
            </>
          ) : (
            <View style={{ gap: 10, paddingBottom: 10 }}>
              <Text muted>{t('today.noPlan')}</Text>
              <Button
                label={t('today.goTrain')}
                variant="secondary"
                onPress={() => router.push('/train')}
              />
            </View>
          )}
        </Card>

        {fixed ? (
          <Card gap={10}>
            <Text variant="label" muted>
              {t('today.nextMeal')}
            </Text>
            {nextMeal ? (
              <>
                <Text variant="displayM">{nextMeal.name}</Text>
                {nextMeal.description ? <Text>{nextMeal.description}</Text> : null}
                <Text variant="label" muted>
                  {t('diet.mealLine', {
                    kcal: nextMeal.kcal,
                    p: Math.round(nextMeal.proteinG),
                    c: Math.round(nextMeal.carbsG),
                    f: Math.round(nextMeal.fatG),
                  })}
                </Text>
                <Button
                  label={t('today.markEaten', { name: nextMeal.name })}
                  icon="check"
                  variant="secondary"
                  onPress={onMeal}
                />
              </>
            ) : (
              <Text muted>{t('today.allMealsDone')}</Text>
            )}
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {fixed ? null : (
            <Tile onPress={onMeal} label={t('today.meal')} accessibilityLabel={t('today.logMeal')}>
              <Icon name="plus" size={22} color={colors.text} />
            </Tile>
          )}
          <Tile
            onPress={() => {
              setWeightInput(weight.data ? String(displayWeight(weight.data.weightKg, unit)) : '');
              setWeightSheet(true);
            }}
            label={t('today.weight', { unit })}
            accessibilityLabel={t('today.logWeight')}
          >
            <Text variant="displayS" numeric>
              {weight.data ? displayWeight(weight.data.weightKg, unit) : '—'}
            </Text>
          </Tile>
          <View
            style={{
              flex: 1,
              minHeight: 88,
              borderRadius: radius.cardSmall,
              borderWidth: 1,
              borderColor: colors.borderDecorative,
              backgroundColor: colors.surface,
              padding: 14,
              gap: 10,
            }}
          >
            <View style={{ width: 60 }}>
              <DotBar
                total={goalGlasses}
                on={Math.min(glasses, goalGlasses)}
                size={8}
                gap={3}
                off="outline"
                accessibilityLabel={t('today.waterBar', { n: glasses, total: goalGlasses })}
              />
            </View>
            <Text variant="bodyS" medium>
              {t('today.water', { n: glasses, total: goalGlasses })}
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <IconButton
                icon="minus"
                accessibilityLabel={t('today.removeWater')}
                disabled={!water.data || water.data.rows.length === 0}
                onPress={onWaterLess}
              />
              <IconButton icon="plus" accessibilityLabel={t('today.addWater')} onPress={onWater} />
            </View>
          </View>
        </View>
      </Screen>

      <Sheet
        visible={weightSheet}
        onClose={() => setWeightSheet(false)}
        title={t('today.logWeight')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            label={t('common.save')}
            disabled={parseDecimal(weightInput) == null}
            onPress={async () => {
              await saveCheckIn.mutateAsync({
                day: today,
                weightKg: storedWeight(parseDecimal(weightInput)!, unit),
              });
              setWeightSheet(false);
              showToast({ message: t('progress.weightSaved'), bottomOffset: barHeight });
            }}
          />
        }
      >
        <Input
          label={t('progress.todayWeight', { unit })}
          value={weightInput}
          onChangeText={setWeightInput}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
        />
      </Sheet>
    </>
  );
}

function Tile({
  children,
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}. ${label}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 88,
        borderRadius: radius.cardSmall,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        padding: 14,
        gap: 10,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      {children}
      <Text variant="bodyS" medium>
        {label}
      </Text>
    </Pressable>
  );
}
