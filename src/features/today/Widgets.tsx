import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { Sparkline } from '@/components/ui/Sparkline';
import { StatusChip } from '@/components/ui/StatusChip';
import { IconButton } from '@/components/ui/IconButton';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { addDays, compactDateLabel, deviceTimeZone, localDay, shortDateLabel } from '@/domain/day';
import { formatInt } from '@/domain/numbers';
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
import { useSetTaken, useSupplementLogs, useSupplements } from '@/features/supplements/data';
import { SupplementsSheet } from '@/features/supplements/SupplementsSheet';
import { StreakWidget } from '@/features/gamification/StreakWidget';
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
  // Canvas Home: a full card is titled in 15 semibold ("Calories"), a tile in 13 muted ("Water").
  const head = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      {size === 'large' ? (
        <Text semibold accessibilityRole="header">
          {label}
        </Text>
      ) : (
        <Text variant="bodyS" muted>
          {label}
        </Text>
      )}
      {right}
    </View>
  );
  if (size === 'large') {
    return (
      <Card
        gap={12}
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
  // Each macro's share of the calories eaten (protein and carbs 4 kcal/g, fat 9).
  const macroKcal = { protein: eaten.protein * 4, carbs: eaten.carbs * 4, fat: eaten.fat * 9 };
  const macroSum = macroKcal.protein + macroKcal.carbs + macroKcal.fat;
  const macroSegments =
    macroSum > 0
      ? (['protein', 'carbs', 'fat'] as const).map((k) => ({
          share: macroKcal[k] / macroSum,
          color: colors.macroSplit[k],
        }))
      : undefined;
  const gaugeLabel = t('diet.caloriesBar', {
    eaten: Math.round(eaten.kcal),
    target: Math.round(target?.kcal ?? 0),
  });
  const over = target ? eaten.kcal > target.kcal * 1.1 : false;
  const setTarget = () => router.push('/diet-goals');

  // No target (DECISIONS 104): what was eaten, no "left" and no arcs, and a quiet way to set one.
  if (!target && size === 'small') {
    return (
      <Frame size="small" label={t('today.calories')}>
        <View>
          <Text variant="displayS" numeric>
            {formatInt(eaten.kcal)}
          </Text>
          <Text variant="bodyS" muted>
            {t('today.kcalEatenShort')}
          </Text>
        </View>
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

  if (size === 'small') {
    return (
      <Frame size="small" label={t('today.caloriesLeft')}>
        <Gauge
          value={share}
          size={110}
          stroke={10}
          sweep={0.75}
          color={over ? colors.danger : colors.nutrition}
          segments={over ? undefined : macroSegments}
          accessibilityLabel={gaugeLabel}
        >
          <Text variant="displayS" numeric>
            {formatInt(left)}
          </Text>
          <Text variant="bodyS" muted>
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
      {target ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyS" muted>
                {t('today.eaten')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text variant="displayM" numeric>
                  {formatInt(eaten.kcal)}
                </Text>
                <Text variant="bodyS" muted>
                  {t('common.kcal')}
                </Text>
              </View>
            </View>
            <Button
              label={t('today.setTarget')}
              variant="ghost"
              size="small"
              block={false}
              onPress={setTarget}
            />
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
            {(['protein', 'carbs', 'fat'] as const).map((key) => (
              <View key={key} style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyS" medium>
                  {t(`diet.macro.${key}`)}
                </Text>
                <Text variant="bodyS" muted numeric>
                  {`${Math.round(eaten[key])} g`}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      {target ? (
        <>
          {/* The arc is filled with the macro colours of what was eaten (colour code, DECISIONS 107);
              each macro says how much is left. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Gauge
              value={share}
              size={150}
              stroke={14}
              sweep={0.75}
              color={over ? colors.danger : colors.nutrition}
              segments={over ? undefined : macroSegments}
              accessibilityLabel={gaugeLabel}
            >
              <Text variant="displayM" numeric>
                {formatInt(left)}
              </Text>
              <Text variant="bodyS" muted>
                {t('today.kcalLeftShort')}
              </Text>
              <Text variant="label" muted numeric>
                {t('today.eatenOf', {
                  eaten: formatInt(eaten.kcal),
                  target: formatInt(target?.kcal ?? 0),
                })}
              </Text>
            </Gauge>
            <View style={{ flex: 1, gap: 12 }}>
              {macroRows.map(([key, value, goal]) => (
                <View key={key} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                    <Text variant="bodyS" semibold>
                      {t(`diet.macro.${key}`)}
                    </Text>
                    <Text variant="label" muted numeric>
                      {value <= goal
                        ? t('today.macroLeft', { g: Math.round(goal - value) })
                        : t('today.macroOver', { g: Math.round(value - goal) })}
                    </Text>
                  </View>
                  <DotBar
                    total={Math.max(1, goal)}
                    on={value}
                    color={colors.macroSplit[key]}
                    track={colors.macroSoft[key]}
                    accessibilityLabel={`${t(`diet.macro.${key}`)} ${Math.round(value)} / ${Math.round(goal)} g`}
                  />
                  <Text variant="label" semibold numeric>
                    {`${Math.round(value)} / ${Math.round(goal)} g`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}
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
              <Text variant="bodyS" muted>
                {t('today.nextMeal')}
              </Text>
              <Text variant="displayM">{nextMeal.name}</Text>
              {nextMeal.description ? <Text>{nextMeal.description}</Text> : null}
              <Text variant="bodyS" muted>
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
  const { colors } = useTheme();
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
      <View
        accessible
        accessibilityLabel={t('today.cycleProgress', {
          n: rotation.state.cycle,
          done: rotation.state.doneCount,
          total: rotation.state.totalDays,
        })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Text variant="label" muted aria-hidden>
          {t('today.cycleShort', { n: rotation.state.cycle })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 3 }} aria-hidden>
          {Array.from({ length: rotation.state.totalDays }, (_, i) => (
            <View
              key={i}
              style={{
                width: 16,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i < rotation.state.doneCount ? colors.training : colors.trainingSoft,
              }}
            />
          ))}
        </View>
      </View>
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
        block
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile icon="dumbbell" area="training" size={56} />
          <View style={{ flex: 1, gap: 2 }}>
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
        </View>
        {upNext.exercises.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {upNext.exercises.slice(0, 3).map((e) => (
              <View
                key={e.id}
                style={{
                  minHeight: 30,
                  paddingHorizontal: 11,
                  borderRadius: 15,
                  backgroundColor: colors.surfaceAlt,
                  justifyContent: 'center',
                }}
              >
                <Text variant="bodyS" medium numberOfLines={1}>
                  {e.exercise.name}
                </Text>
              </View>
            ))}
            {upNext.exercises.length > 3 ? (
              <View
                style={{
                  minHeight: 30,
                  paddingHorizontal: 11,
                  borderRadius: 15,
                  backgroundColor: colors.surfaceAlt,
                  justifyContent: 'center',
                }}
              >
                <Text variant="bodyS" medium>
                  {t('today.moreExercises', { count: upNext.exercises.length - 3 })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {start}
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
      <View
        style={{ flexDirection: 'row', gap: size === 'small' ? 10 : 12, alignItems: 'flex-end' }}
      >
        {/* A glass that fills (water is part of nutrition: teal). */}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('today.waterBar', { n: glasses, total: goalGlasses })}
          style={{
            // Half width: a slimmer glass leaves the litres room to breathe.
            width: size === 'small' ? 32 : 40,
            height: size === 'small' ? 56 : 68,
            borderTopLeftRadius: 9,
            borderTopRightRadius: 9,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 14,
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
          <Text variant="label" muted numeric>
            {glasses >= goalGlasses
              ? t('today.waterGoalReached')
              : t('today.waterToGo', {
                  l: (((goalGlasses - glasses) * glassMl) / 1000).toFixed(1),
                })}
          </Text>
        </View>
      </View>
      <View aria-hidden style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: goalGlasses }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i < glasses ? colors.water : colors.waterSoft,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <IconButton
          icon="minus"
          accessibilityLabel={t('today.removeWater')}
          disabled={!water.data || water.data.rows.length === 0}
          onPress={onWaterLess}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.addWater')}
          onPress={onWater}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 44,
            borderRadius: 22,
            backgroundColor: colors.nutritionSoft,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="plus" size={18} color={colors.nutritionInk} />
          <Text variant="bodyS" semibold style={{ color: colors.nutritionInk }}>
            {t('today.addGlass')}
          </Text>
        </Pressable>
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
  // Better or worse depends on the goal: down when losing fat, up when building muscle.
  const goal = useProfile().data?.goal;
  const better =
    change == null || Math.abs(change) < 0.05
      ? null
      : goal === 'build_muscle'
        ? change > 0
        : goal === 'lose_fat'
          ? change < 0
          : Math.abs(change) <= 0.3;
  // The last two weeks, oldest first (entries come newest first).
  const line = weights
    .filter((e) => e.day > addDays(today, -15))
    .map((e) => e.weightKg as number)
    .reverse();
  const small = size === 'small';

  return (
    <Frame size={size} label={t('today.weight')} onPress={() => router.push('/progress/body')}>
      {latest?.weightKg != null ? (
        <>
          <Text variant="displayS" numeric>
            {t('today.kg', { kg: latest.weightKg.toFixed(1) })}
          </Text>
          {line.length > 1 ? (
            <Sparkline
              values={line}
              height={small ? 32 : 44}
              color={colors.text}
              accessibilityLabel={t('today.weightLineA11y')}
            />
          ) : null}
          {change != null ? (
            <StatusChip
              area={better == null ? 'neutral' : better ? 'better' : 'worse'}
              icon={change < 0 ? 'arrowDown' : change > 0 ? 'arrowUp' : undefined}
              label={t(small ? 'today.weightChangeShort' : 'today.weightChange', {
                kg: (change > 0 ? '+' : '') + change.toFixed(1),
              })}
            />
          ) : (
            // Half width: "Logged Sun 18", wrapping rather than cut.
            <Text variant={small ? 'label' : 'bodyS'} muted>
              {t('today.weightOn', {
                day: small ? compactDateLabel(latest.day) : shortDateLabel(latest.day),
              })}
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
 * Today's supplements: the list (same as the calendar) with an on/off for each one taken.
 * The pencil opens the list to add or remove supplements.
 */
export function SupplementsWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const list = useSupplements().data ?? [];
  const taken = useSupplementLogs(today, today).data?.get(today);
  const setTaken = useSetTaken();

  return (
    <>
      <Frame
        size={size}
        label={t('today.supplements')}
        right={
          <IconButton
            icon={list.length ? 'edit' : 'plus'}
            size={36}
            accessibilityLabel={
              list.length ? t('calendar.editSupplements') : t('today.supplementsAdd')
            }
            onPress={() => setOpen(true)}
          />
        }
      >
        {/* Taking a supplement is a tick, not a setting: tap the pill (nutrition: teal). */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {list.map((s) => {
            const label = s.dose ? `${s.name} · ${s.dose}` : s.name;
            const on = taken?.has(s.id) ?? false;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={label}
                onPress={() => {
                  if (!on) confirm();
                  setTaken.mutate({ day: today, supplementId: s.id, taken: !on });
                }}
                style={({ pressed }) => ({
                  flexGrow: 1,
                  flexBasis: size === 'large' ? '40%' : '100%',
                  minHeight: 52,
                  borderRadius: 14,
                  borderWidth: on ? 0 : 1,
                  borderColor: colors.borderControl,
                  backgroundColor: on ? colors.nutritionSoft : colors.surface,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 12,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: on ? 0 : 2,
                    borderColor: colors.borderControl,
                    backgroundColor: on ? colors.nutrition : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on ? <Icon name="check" size={14} color={colors.surface} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  {/* Half width: long names wrap to a second line instead of being cut. */}
                  <Text
                    variant="bodyS"
                    semibold
                    numberOfLines={size === 'small' ? 2 : 1}
                    style={on ? { color: colors.nutritionInk } : undefined}
                  >
                    {s.name}
                  </Text>
                  {s.dose ? (
                    <Text
                      variant="label"
                      numberOfLines={size === 'small' ? 2 : 1}
                      muted={!on}
                      style={on ? { color: colors.nutritionInk } : undefined}
                    >
                      {s.dose}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
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
  streak: StreakWidget,
  supplements: SupplementsWidget,
};
