import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { IconButton } from '@/components/ui/IconButton';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import { checkAsPlanned, mealForHour, nextFixedMeal } from '@/domain/diet';
import { useDayTarget } from '@/features/diet/day-hooks';
import { useFixedChecks, useFixedPlan, useSetCheck } from '@/features/diet/fixed';
import { useAddWater, useDayTotals, useRemoveWater, useWater } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useBodyEntries } from '@/features/progress/data';
import { useToday } from '@/features/profile/use-today';
import { useStartWorkout } from '@/features/session/start';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useMonthSessions } from '@/features/train/history';
import { estimateMinutes, useActivePlan, useRotation } from '@/features/train/plans';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import {
  supplementDay,
  useSetTaken,
  useSupplementLogs,
  useSupplements,
} from '@/features/supplements/data';
import { SupplementsSheet } from '@/features/supplements/SupplementsSheet';
import type { WidgetId, WidgetSize } from './layout-store';

type Props = { size: WidgetSize };

/** A widget box: a full-width card, or a small tile that shares the row with another. */
function Frame({
  size,
  label,
  right,
  onPress,
  children,
}: {
  size: WidgetSize;
  label: string;
  right?: ReactNode;
  onPress?: () => void;
  children: ReactNode;
}) {
  const head = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="label" muted>
        {label}
      </Text>
      {right}
    </View>
  );
  if (size === 'large') {
    return (
      <Card
        gap={14}
        style={{ flexGrow: 1, padding: 16 }}
        onPress={onPress}
        accessibilityLabel={onPress ? label : undefined}
      >
        {head}
        {children}
      </Card>
    );
  }
  return (
    <Card
      size="small"
      gap={10}
      style={{ flexGrow: 1, padding: 16 }}
      onPress={onPress}
      accessibilityLabel={onPress ? label : undefined}
    >
      {head}
      {children}
    </Card>
  );
}

/** Calories left, macros and the next meal, together. */
export function NutritionWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const profile = useProfile();
  const showToast = useToastStore((s) => s.show);
  const totals = useDayTotals(today);
  const target = useDayTarget(today);
  const eaten = totals.data ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const left = target ? Math.max(0, Math.round(target.kcal - eaten.kcal)) : 0;

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

  const macroRows = target
    ? ([
        ['protein', eaten.protein, target.protein],
        ['carbs', eaten.carbs, target.carbs],
        ['fat', eaten.fat, target.fat],
      ] as const)
    : [];
  const share = target && target.kcal > 0 ? eaten.kcal / target.kcal : 0;
  const gaugeLabel = t('diet.caloriesBar', {
    eaten: Math.round(eaten.kcal),
    target: Math.round(target?.kcal ?? 0),
  });
  const over = target ? eaten.kcal > target.kcal * 1.1 : false;

  if (size === 'small') {
    return (
      <Frame size="small" label={t('today.caloriesLeft')}>
        <Gauge value={share} size={110} stroke={10} sweep={0.75} accessibilityLabel={gaugeLabel}>
          <Text variant="displayS" numeric>
            {left}
          </Text>
          <Text variant="label" muted>
            {t('today.kcalLeftShort')}
          </Text>
        </Gauge>
        {fixed && nextMeal ? (
          <Text variant="bodyS" numberOfLines={1}>
            {nextMeal.name}
          </Text>
        ) : null}
        <IconButton
          icon={fixed ? 'check' : 'plus'}
          accessibilityLabel={
            fixed && nextMeal ? t('today.markEaten', { name: nextMeal.name }) : t('today.logMeal')
          }
          disabled={fixed && !nextMeal}
          onPress={onMeal}
        />
      </Frame>
    );
  }

  return (
    <Frame size="large" label={t('today.calories')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Gauge
          value={share}
          size={150}
          stroke={12}
          sweep={0.75}
          color={over ? colors.warning : colors.dotOn}
          accessibilityLabel={gaugeLabel}
        >
          <Text variant="displayM" numeric>
            {left}
          </Text>
          <Text variant="bodyS" muted>
            {t('today.kcalLeftShort')}
          </Text>
        </Gauge>
        <View style={{ flex: 1, gap: 10 }}>
          <View>
            <Text variant="bodyS" muted>
              {t('today.eaten')}
            </Text>
            <Text variant="displayS" numeric>
              {Math.round(eaten.kcal)}
            </Text>
          </View>
          <View>
            <Text variant="bodyS" muted>
              {t('today.target')}
            </Text>
            <Text variant="displayS" numeric>
              {Math.round(target?.kcal ?? 0)}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          borderTopWidth: 1,
          borderColor: colors.borderDecorative,
          paddingTop: 12,
        }}
      >
        {macroRows.map(([key, value, goal]) => (
          <View key={key} style={{ flex: 1, gap: 6 }}>
            <Text variant="bodyS" medium>
              {t(`diet.macro.${key}`)}
            </Text>
            <DotBar
              total={Math.max(1, goal)}
              on={value}
              color={colors.macroSplit[key]}
              track={colors.macroSoft[key]}
              accessibilityLabel={t(`diet.macro.${key}`)}
            />
            <Text variant="label" muted numeric>
              {`${Math.round(value)} / ${Math.round(goal)} g`}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={{
          gap: 8,
          borderTopWidth: 1,
          borderColor: colors.borderDecorative,
          paddingTop: 12,
        }}
      >
        {fixed ? (
          nextMeal ? (
            <>
              <Text variant="label" muted>
                {t('today.nextMeal')}
              </Text>
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
          )
        ) : (
          <Button label={t('today.logMeal')} icon="plus" variant="secondary" onPress={onMeal} />
        )}
      </View>
    </Frame>
  );
}

/** Today's workout: up next, or a note that it is already done. */
export function WorkoutWidget({ size }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const today = useToday();
  const profile = useProfile();
  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const { startDay } = useStartWorkout();
  const tz = profile.data?.timezone ?? deviceTimeZone();
  const monthSessions = useMonthSessions(today.slice(0, 7));
  const doneToday = (monthSessions.data ?? []).filter(
    (s) => localDay(new Date(s.startedAt), tz) === today,
  );
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];
  const openPlan = () =>
    plan && router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } });
  const small = size === 'small';

  const cycle =
    plan && rotation && !small ? (
      <Text variant="label" muted>
        {t('today.cycleProgress', {
          n: rotation.state.cycle,
          done: rotation.state.doneCount,
          total: rotation.state.totalDays,
        })}
      </Text>
    ) : undefined;

  let body: ReactNode;
  if (doneToday.length > 0) {
    body = (
      <>
        <View style={{ gap: 4 }}>
          <Text variant={small ? 'displayS' : 'displayM'} numberOfLines={2}>
            {t('today.workoutDone')}
          </Text>
          <Text variant="bodyS" muted>
            {t('today.workoutDoneInfo', {
              names: doneToday.map((s) => s.name || t('train.emptyWorkout')).join(', '),
              sets: doneToday.reduce((a, s) => a + s.stats.sets, 0),
            })}
          </Text>
        </View>
        {plan ? <Button label={t('today.trainAgain')} variant="ghost" onPress={openPlan} /> : null}
      </>
    );
  } else if (upNext && plan) {
    const start = (
      <Button
        label={t('train.start')}
        icon="play"
        block={small}
        disabled={upNext.exercises.length === 0}
        onPress={() => startDay(plan, upNext, rotation)}
      />
    );
    body = small ? (
      <>
        <Text variant="displayS" numberOfLines={2}>
          {upNext.name}
        </Text>
        {start}
      </>
    ) : (
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
          {start}
        </View>
        <Button label={t('train.differentDay')} variant="ghost" onPress={openPlan} />
      </>
    );
  } else {
    body = (
      <View style={{ gap: 10 }}>
        <Text muted>{t('today.noPlan')}</Text>
        <Button
          label={t('today.goTrain')}
          variant="secondary"
          onPress={() => router.push('/train')}
        />
      </View>
    );
  }

  return (
    <Frame size={size} label={t('today.workout')} right={cycle}>
      {body}
    </Frame>
  );
}

export function WaterWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const glassMl = usePreferencesStore((s) => s.waterGlassMl);
  const showToast = useToastStore((s) => s.show);
  const water = useWater(today);
  const addWater = useAddWater();
  const removeWater = useRemoveWater();
  const goalGlasses = Math.max(1, Math.round(2000 / glassMl));
  const glasses = Math.round((water.data?.totalMl ?? 0) / glassMl);

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

  return (
    <Frame size={size} label={t('today.waterLabel')}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('today.waterBar', { n: glasses, total: goalGlasses })}
          style={{
            width: 28,
            height: 64,
            borderRadius: 9,
            backgroundColor: colors.waterSoft,
            overflow: 'hidden',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              height: `${Math.min(100, (glasses / goalGlasses) * 100)}%`,
              backgroundColor: colors.water,
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="displayS" numeric>
            {t('today.litres', { l: ((water.data?.totalMl ?? 0) / 1000).toFixed(1) })}
          </Text>
          <Text variant="bodyS" muted>
            {t('today.water', { n: glasses, total: goalGlasses })}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <IconButton
          icon="minus"
          accessibilityLabel={t('today.removeWater')}
          disabled={!water.data || water.data.rows.length === 0}
          onPress={onWaterLess}
        />
        <IconButton icon="plus" accessibilityLabel={t('today.addWater')} onPress={onWater} />
      </View>
    </Frame>
  );
}

/** The latest weight and how it moved over the last week. Opens Body. */
export function WeightWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const entries = useBodyEntries();
  const weights = (entries.data ?? []).filter((e) => e.weightKg != null);
  const latest = weights[0];
  const weekAgo = weights.find((e) => e.day <= addDays(today, -7));
  const change =
    latest?.weightKg != null && weekAgo?.weightKg != null
      ? latest.weightKg - weekAgo.weightKg
      : null;

  return (
    <Frame size={size} label={t('today.weight')} onPress={() => router.push('/progress/body')}>
      {latest?.weightKg != null ? (
        <>
          <Text variant="displayS" numeric>
            {t('today.kg', { kg: latest.weightKg.toFixed(1) })}
          </Text>
          {change != null ? (
            <Text
              variant="bodyS"
              medium
              style={{ color: change <= 0 ? colors.successText : colors.text }}
            >
              {t('today.weightChange', { kg: (change > 0 ? '+' : '') + change.toFixed(1) })}
            </Text>
          ) : (
            <Text variant="bodyS" muted>
              {t('today.weightOn', { day: latest.day })}
            </Text>
          )}
        </>
      ) : (
        <Text variant="bodyS" muted>
          {t('today.noWeight')}
        </Text>
      )}
    </Frame>
  );
}

/**
 * Supplements of today (the same list and ticks as the calendar): how many were taken, the last
 * seven days, and one tap to mark them all. Tap the card to tick them one by one or edit the list.
 */
export function SupplementsWidget({ size }: Props) {
  const { t } = useTranslation();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const showToast = useToastStore((s) => s.show);
  const [open, setOpen] = useState(false);
  const list = useSupplements().data ?? [];
  const logs = useSupplementLogs(addDays(today, -6), today).data;
  const setTaken = useSetTaken();
  const takenToday = list.filter((s) => logs?.get(today)?.has(s.id)).length;
  const all = list.length > 0 && takenToday === list.length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter(
    (d) => supplementDay(logs?.get(d), list) === 'all',
  ).length;

  /** Marks every supplement of today (or, when all were taken, none); UNDO restores the ticks. */
  const toggleAll = async () => {
    const before = new Set(logs?.get(today) ?? []);
    await Promise.all(
      list.map((s) => setTaken.mutateAsync({ day: today, supplementId: s.id, taken: !all })),
    );
    confirm();
    showToast({
      message: all ? t('today.supplementsRemoved') : t('today.supplementsTaken'),
      actionLabel: t('common.undo'),
      bottomOffset: barHeight,
      onAction: () =>
        list.forEach((s) =>
          setTaken.mutate({ day: today, supplementId: s.id, taken: before.has(s.id) }),
        ),
    });
  };

  return (
    <>
      <Frame
        size={size}
        label={t('today.supplements')}
        right={
          list.length ? (
            <IconButton
              icon="edit"
              size={36}
              accessibilityLabel={t('calendar.editSupplements')}
              onPress={() => setOpen(true)}
            />
          ) : undefined
        }
      >
        {list.length === 0 ? (
          <IconButton
            icon="plus"
            accessibilityLabel={t('today.supplementsAdd')}
            onPress={() => setOpen(true)}
          />
        ) : (
          <>
            <Text variant="displayS" numeric>
              {t('today.supplementsCount', { taken: takenToday, total: list.length })}
            </Text>
            <DotBar
              total={7}
              on={week}
              size={8}
              gap={3}
              off="outline"
              accessibilityLabel={t('today.supplementsWeek', { n: week })}
            />
            <IconButton
              icon={all ? 'close' : 'check'}
              accessibilityLabel={
                all ? t('today.supplementsUndoAll') : t('today.supplementsMarkAll')
              }
              onPress={() => void toggleAll()}
            />
          </>
        )}
      </Frame>
      <SupplementsSheet visible={open} onClose={() => setOpen(false)} day={today} />
    </>
  );
}

export const widgetComponents: Record<WidgetId, (p: Props) => ReactNode> = {
  nutrition: NutritionWidget,
  workout: WorkoutWidget,
  water: WaterWidget,
  weight: WeightWidget,
  supplements: SupplementsWidget,
};
