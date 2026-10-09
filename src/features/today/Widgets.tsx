import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { addDays, deviceTimeZone, localDay, weekOf } from '@/domain/day';
import { checkAsPlanned, mealForHour, nextFixedMeal } from '@/domain/diet';
import { dotsOn } from '@/domain/dots';
import { useDayTarget } from '@/features/diet/day-hooks';
import { useFixedChecks, useFixedPlan, useSetCheck } from '@/features/diet/fixed';
import { useAddWater, useDayTotals, useRemoveWater, useWater } from '@/features/diet/log';
import { CalendarGrid, CalendarLegend, useCalendarData } from '@/features/progress/CalendarGrid';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useStartWorkout } from '@/features/session/start';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useMonthSessions } from '@/features/train/history';
import { monthGrid } from '@/features/train/HistoryScreen';
import { estimateMinutes, useActivePlan, useRotation } from '@/features/train/plans';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import { useCreatine } from './creatine-store';
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
      <Card gap={14} onPress={onPress} accessibilityLabel={onPress ? label : undefined}>
        {head}
        {children}
      </Card>
    );
  }
  return (
    <Card size="small" gap={10} onPress={onPress} accessibilityLabel={onPress ? label : undefined}>
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
  const bar = (
    <DotBar
      total={size === 'large' ? 40 : 16}
      on={dotsOn(eaten.kcal, target?.kcal ?? 0, size === 'large' ? 40 : 16)}
      size={size === 'large' ? 10 : 8}
      gap={size === 'large' ? 4 : 3}
      accessibilityLabel={t('diet.caloriesBar', {
        eaten: Math.round(eaten.kcal),
        target: Math.round(target?.kcal ?? 0),
      })}
    />
  );

  if (size === 'small') {
    return (
      <Frame size="small" label={t('today.caloriesLeft')}>
        <Text variant="displayL" numeric>
          {left}
        </Text>
        {bar}
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
    <Frame
      size="large"
      label={t('today.caloriesLeft')}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
          <Text variant="label" muted>
            {t('today.live')}
          </Text>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text variant="displayXL" numeric>
          {left}
        </Text>
        <Text variant="label" muted>
          {t('today.ofKcal', { kcal: Math.round(target?.kcal ?? 0) })}
        </Text>
      </View>
      {bar}
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
      <View
        style={{
          gap: 8,
          borderTopWidth: 1,
          borderStyle: 'dashed',
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
      <DotBar
        total={goalGlasses}
        on={Math.min(glasses, goalGlasses)}
        size={8}
        gap={3}
        off="outline"
        accessibilityLabel={t('today.waterBar', { n: glasses, total: goalGlasses })}
      />
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
    </Frame>
  );
}

/** One tick a day: did you take your creatine? */
export function CreatineWidget({ size }: Props) {
  const { t } = useTranslation();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const showToast = useToastStore((s) => s.show);
  const days = useCreatine((s) => s.days);
  const setTaken = useCreatine((s) => s.setTaken);
  const taken = days.includes(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) =>
    days.includes(d),
  ).length;

  const toggle = () => {
    setTaken(today, !taken);
    confirm();
    showToast({
      message: taken ? t('today.creatineRemoved') : t('today.creatineTaken'),
      actionLabel: t('common.undo'),
      bottomOffset: barHeight,
      onAction: () => setTaken(today, taken),
    });
  };

  return (
    <Frame size={size} label={t('today.creatine')}>
      <Text variant="displayS">{taken ? t('today.creatineYes') : t('today.creatineNo')}</Text>
      <DotBar
        total={7}
        on={week}
        size={8}
        gap={3}
        off="outline"
        accessibilityLabel={t('today.creatineWeek', { n: week })}
      />
      <IconButton
        icon={taken ? 'close' : 'check'}
        accessibilityLabel={taken ? t('today.creatineUndo') : t('today.creatineMark')}
        onPress={toggle}
      />
    </Frame>
  );
}

/** The calendar: this week or this month, with workouts and diet days. Tap a day to open it. */
export function CalendarWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const open = () => router.push({ pathname: '/progress/calendar', params: { from: '/(tabs)' } });

  const cells: (string | null)[] =
    mode === 'week' || size === 'small'
      ? weekOf(today, weekStart)
      : monthGrid(today.slice(0, 7), weekStart);
  const days = cells.filter((d): d is string => d != null);
  const data = useCalendarData([days[0]!.slice(0, 7), days[days.length - 1]!.slice(0, 7)]);
  const past = days.filter((d) => d <= today);

  if (size === 'small') {
    return (
      <Frame size="small" label={t('calendar.title')} onPress={open}>
        <Icon name="calendar" size={24} color={colors.text} />
        <Text variant="bodyS">
          {t('calendar.summary', {
            workouts: past.filter((d) => data.sessionsByDay.has(d)).length,
            diet: past.filter((d) => data.statusOf(d) === 'onTarget').length,
          })}
        </Text>
        <Text variant="label" muted>
          {t('calendar.week')}
        </Text>
      </Frame>
    );
  }

  return (
    <Frame
      size="large"
      label={t('calendar.title')}
      right={<IconButton icon="calendar" accessibilityLabel={t('calendar.open')} onPress={open} />}
    >
      <Segmented
        accessibilityLabel={t('calendar.view')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'week', label: t('calendar.week') },
          { value: 'month', label: t('calendar.month') },
        ]}
      />
      <CalendarGrid
        cells={cells}
        today={today}
        selected={today}
        onSelect={open}
        weekStart={weekStart}
        data={data}
      />
      <CalendarLegend />
    </Frame>
  );
}

export const widgetComponents: Record<WidgetId, (p: Props) => ReactNode> = {
  nutrition: NutritionWidget,
  workout: WorkoutWidget,
  water: WaterWidget,
  creatine: CreatineWidget,
  calendar: CalendarWidget,
};
