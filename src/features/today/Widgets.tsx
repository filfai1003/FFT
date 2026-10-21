import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DotBar } from '@/components/ui/DotBar';
import { Gauge } from '@/components/ui/Gauge';
import { CheckFill } from '@/components/ui/CheckFill';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Sparkline } from '@/components/ui/Sparkline';
import { StatusChip } from '@/components/ui/StatusChip';
import { IconButton } from '@/components/ui/IconButton';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { addDays, compactDateLabel, shortDateLabel } from '@/domain/day';
import { formatInt } from '@/domain/numbers';
import { checkAsPlanned, mealForHour, nextFixedMeal } from '@/domain/diet';
import { useDayTarget } from '@/features/diet/day-hooks';
import { calorieStatus } from '@/features/diet/summary';
import { useFixedChecks, useFixedPlan, useSetCheck } from '@/features/diet/fixed';
import {
  useAddWater,
  useCopyEntries,
  useDayLog,
  useDayTotals,
  useRemoveWater,
  useSetLogDeleted,
  useWater,
} from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useBodyEntries } from '@/features/progress/data';
import { MarkDoneSheet } from '@/features/train/MarkDoneSheet';
import { useHomeDay } from './home-day';
import { useStartWorkout } from '@/features/session/start';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { estimateMinutes } from '@/features/train/plans';
import { NewPlanSheet } from '@/features/train/NewPlanSheet';
import { useAskCoach, useCoachReady } from '@/features/ai/use-coach-ready';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';
import { useSetTaken, useSupplementLogs, useSupplements } from '@/features/supplements/data';
import { SupplementsSheet } from '@/features/supplements/SupplementsSheet';
import { StreakWidget } from '@/features/gamification/StreakWidget';
import { supplementsCount, waterGoal, weightLine, weightTrend } from './day-logic';
import { useTodayWorkout } from './day-status';
import type { WidgetId, WidgetSize } from './layout-store';

type Props = { size: WidgetSize };

/** Header tile size: the same on every Today card, full or half width. */
const HEAD_TILE = 32;

/**
 * A widget box: a full-width card, or a small tile that shares the row with another. Every card
 * has the same header: its area's icon tile and its title (colour code, DECISIONS 107).
 */
/** The box a CheckFill sits in: its own size, the check centred on the fill. */
const checkBox = (size: number) =>
  ({ width: size, height: size, alignItems: 'center', justifyContent: 'center' }) as const;

function Frame({
  size,
  label,
  icon,
  area,
  right,
  onPress,
  pressLabel,
  children,
}: {
  size: WidgetSize;
  label: string;
  icon: IconName;
  area: Area;
  right?: ReactNode;
  onPress?: () => void;
  /** What a tap on the card does, when it differs from its title ("Log your weight"). */
  pressLabel?: string;
  children: ReactNode;
}) {
  const title = (
    <Text semibold accessibilityRole="header" numberOfLines={2} style={{ flex: 1 }}>
      {label}
    </Text>
  );
  // Half width: the title goes under the tile, so a long word ("Supplements") never splits.
  const head =
    size === 'large' ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <IconTile icon={icon} area={area} size={HEAD_TILE} />
        {title}
        {right}
      </View>
    ) : (
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 36,
          }}
        >
          <IconTile icon={icon} area={area} size={HEAD_TILE} />
          {right}
        </View>
        {title}
      </View>
    );
  if (size === 'large') {
    return (
      <Card
        gap={12}
        style={{ flexGrow: 1, padding: 16 }}
        onPress={onPress}
        accessibilityLabel={onPress ? (pressLabel ?? label) : undefined}
      >
        {head}
        {children}
      </Card>
    );
  }
  return (
    <Card
      size="small"
      gap={12}
      style={{ flexGrow: 1, padding: 16 }}
      onPress={onPress}
      accessibilityLabel={onPress ? (pressLabel ?? label) : undefined}
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
  // The day Home shows: today, or a past day picked on the row of days (DECISIONS 123).
  const { day: today } = useHomeDay();
  const profile = useProfile();
  const showToast = useToastStore((s) => s.show);
  const totals = useDayTotals(today);
  const log = useDayLog(today);
  const yesterday = useDayLog(addDays(today, -1));
  const copy = useCopyEntries();
  const setDeleted = useSetLogDeleted();
  const target = useDayTarget(today);
  const eaten = totals.data ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const status = target ? calorieStatus(eaten.kcal, target.kcal) : null;
  const left = status && !status.over ? status.amount : 0;
  // Past the target the middle says how much over, never "0 kcal left".
  const overBy = status?.over ? status.amount : 0;

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

  // Nothing logged today yet (the first days, or a new morning): the card looks the same, just
  // unfilled (an empty arc, empty macro bars with their targets), and offers yesterday's meals.
  const empty =
    !fixed && totals.data != null && eaten.kcal === 0 && log.data != null && log.data.length === 0;
  const yesterdayEntries = fixed ? [] : (yesterday.data ?? []);
  const yesterdayKcal = Math.round(yesterdayEntries.reduce((a, e) => a + e.macros.kcal, 0));
  const sameAsYesterday = async () => {
    if (copy.isPending || yesterdayEntries.length === 0) return;
    const meals = [...new Set(yesterdayEntries.map((e) => e.meal))];
    const ids: string[] = [];
    for (const meal of meals)
      ids.push(
        ...(await copy.mutateAsync({
          entries: yesterdayEntries.filter((e) => e.meal === meal),
          day: today,
          meal,
        })),
      );
    confirm();
    showToast({
      message: t('today.copiedDay', { count: ids.length }),
      actionLabel: t('common.undo'),
      bottomOffset: barHeight,
      onAction: () => {
        for (const id of ids) setDeleted.mutate({ id, deleted: true });
      },
    });
  };

  // No target (DECISIONS 104): what was eaten, no "left" and no arcs, and a quiet way to set one.
  if (!target && size === 'small') {
    return (
      <Frame size="small" label={t('today.calories')} icon="bowl" area="nutrition">
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
      <Frame
        size="small"
        label={overBy > 0 ? t('today.calories') : t('today.caloriesLeft')}
        icon="bowl"
        area="nutrition"
      >
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
            {formatInt(overBy > 0 ? overBy : left)}
          </Text>
          <Text variant="bodyS" muted>
            {overBy > 0 ? t('today.kcalOverShort') : t('today.kcalLeftShort')}
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
    <Frame size="large" label={t('today.calories')} icon="bowl" area="nutrition">
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.macroSplit[key],
                    }}
                  />
                  <Text variant="bodyS" medium>
                    {t(`diet.macro.${key}`)}
                  </Text>
                </View>
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
                {formatInt(overBy > 0 ? overBy : left)}
              </Text>
              <Text variant="bodyS" muted>
                {overBy > 0 ? t('today.kcalOverShort') : t('today.kcalLeftShort')}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View aria-hidden style={checkBox(28)}>
                <CheckFill
                  done
                  size={28}
                  fill={colors.nutrition}
                  iconOn={colors.bg}
                  iconOff="transparent"
                  iconSize={16}
                />
              </View>
              <Text semibold style={{ flex: 1 }}>
                {t('today.allMealsDone')}
              </Text>
            </View>
          )
        ) : (
          <>
            <Button label={t('today.logMeal')} icon="plus" variant="secondary" onPress={onMeal} />
            {empty && yesterdayEntries.length > 0 ? (
              <Button
                label={t('today.sameAsYesterday')}
                accessibilityLabel={t('today.sameAsYesterdayLabel', {
                  count: yesterdayEntries.length,
                  kcal: formatInt(yesterdayKcal),
                })}
                icon="copy"
                variant="ghost"
                disabled={copy.isPending}
                onPress={() => void sameAsYesterday()}
              />
            ) : null}
          </>
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
  const { day, past } = useHomeDay();
  const { plan, rotation, upNext, doneToday } = useTodayWorkout(day);
  const { startDay } = useStartWorkout();
  const [creating, setCreating] = useState(false);
  const [marking, setMarking] = useState(false);
  const coachReady = useCoachReady();
  const askCoach = useAskCoach();
  const openPlan = () =>
    plan && router.push({ pathname: '/train/plan/[planId]', params: { planId: plan.id } });
  const small = size === 'small';

  const cycle =
    plan && rotation && !small && !past ? (
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
        {/* Done at a glance: a filled training check beside the words (above them at half width). */}
        <View
          style={{
            flexDirection: small ? 'column' : 'row',
            alignItems: small ? 'flex-start' : 'center',
            gap: small ? 8 : 12,
          }}
        >
          {/* The fill is absolute: the box gives it its size, or it spills over the words. */}
          <View aria-hidden style={checkBox(small ? 36 : 44)}>
            <CheckFill
              done
              size={small ? 36 : 44}
              fill={colors.training}
              iconOn={colors.bg}
              iconOff="transparent"
              iconSize={small ? 20 : 24}
            />
          </View>
          <View style={{ flex: small ? undefined : 1, gap: 2 }}>
            <Text variant={small ? 'titleM' : 'displayS'} numberOfLines={2}>
              {past ? t('today.past.workoutDone') : t('today.workoutDone')}
            </Text>
            <Text variant="bodyS" muted>
              {t('today.workoutDoneInfo', {
                names: doneToday.map((s) => s.name || t('train.emptyWorkout')).join(', '),
                count: doneToday.reduce((a, s) => a + s.stats.sets, 0),
              })}
            </Text>
          </View>
        </View>
        {plan && !past ? (
          <Button label={t('today.trainAgain')} variant="ghost" onPress={openPlan} />
        ) : null}
      </>
    );
  } else if (past) {
    // A past day: a workout cannot start there, but one trained and not logged can be marked.
    body = (
      <View style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text variant={small ? 'titleM' : 'displayS'} numberOfLines={2}>
            {t('today.past.noWorkout')}
          </Text>
          {small ? null : (
            <Text variant="bodyS" muted>
              {t('today.past.noWorkoutInfo')}
            </Text>
          )}
        </View>
        <Button
          label={t('calendar.markDone')}
          icon="check"
          variant="secondary"
          onPress={() => setMarking(true)}
        />
      </View>
    );
  } else if (upNext && plan) {
    // A day without exercises cannot start: instead of a dead Start, the way to fill it.
    const start =
      upNext.exercises.length === 0 ? (
        <Button
          label={t('today.addExercises')}
          icon="plus"
          variant="secondary"
          onPress={openPlan}
        />
      ) : (
        <Button
          label={t('train.start')}
          icon="play"
          block
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
        <View style={{ gap: 2 }}>
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
        {upNext.exercises.length > 0 ? (
          <Button label={t('train.differentDay')} variant="ghost" onPress={openPlan} />
        ) : null}
      </>
    );
  } else {
    // No plan: plan creation opens right here (and the coach can draft one when it is set up).
    // Shaped like the "up next" card: a big title where the day's name goes, one short line.
    body = (
      <View style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text variant={small ? 'titleM' : 'displayS'} numberOfLines={2}>
            {t('today.noPlanTitle')}
          </Text>
          {small ? null : (
            <Text variant="bodyS" muted>
              {t('today.noPlanInfo')}
            </Text>
          )}
        </View>
        <Button label={t('train.createPlan')} icon="plus" onPress={() => setCreating(true)} />
        {coachReady ? (
          <Button
            label={t('today.askCoachPlan')}
            icon="chat"
            variant="ghost"
            onPress={() => askCoach(t('today.askCoachPlanPrompt'))}
          />
        ) : null}
      </View>
    );
  }

  return (
    <>
      <Frame size={size} label={t('today.workout')} icon="dumbbell" area="training" right={cycle}>
        {body}
      </Frame>
      <NewPlanSheet visible={creating} onClose={() => setCreating(false)} />
      {past ? (
        <MarkDoneSheet visible={marking} onClose={() => setMarking(false)} day={day} />
      ) : null}
    </>
  );
}

/** One wave period is the glass's width: the wave strip is two periods wide and slides by one. */
const WAVE_MS = 2600;
const WAVE_AMP = 3;

/**
 * A glass filled to `share` (0..1) with water whose surface moves in a small wave. Still with
 * "reduce motion" (and when empty or full the wave is out of sight anyway).
 */
export function WaterGlass({
  share,
  width,
  height,
  accessibilityLabel,
}: {
  share: number;
  width: number;
  height: number;
  accessibilityLabel: string;
}) {
  const { colors, reduceMotion } = useTheme();
  const level = Math.max(0, Math.min(1, share));
  const fillH = Math.round(level * height);
  const moving = !reduceMotion && level > 0 && level < 1;
  const phase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(phase);
    phase.set(0);
    if (!moving) return;
    phase.set(withRepeat(withTiming(1, { duration: WAVE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(phase);
  }, [moving, phase]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: -phase.get() * width }] }));

  // Crest at the top of the strip, trough 2 × amplitude below: the mean level sits at `fillH`.
  const w = width;
  const svgH = fillH + WAVE_AMP * 2;
  const wave =
    `M0 ${WAVE_AMP} Q${w / 4} ${-WAVE_AMP} ${w / 2} ${WAVE_AMP} T${w} ${WAVE_AMP} ` +
    `T${w * 1.5} ${WAVE_AMP} T${w * 2} ${WAVE_AMP} L${w * 2} ${svgH} L0 ${svgH} Z`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      testID="water-glass"
      style={{
        width,
        height,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        backgroundColor: colors.waterSoft,
        overflow: 'hidden',
      }}
    >
      {fillH > 0 ? (
        <View
          aria-hidden
          testID="water-level"
          style={{ position: 'absolute', left: 0, bottom: 0, width, height: fillH + WAVE_AMP }}
        >
          <Animated.View style={[{ width: w * 2, height: svgH }, slide]}>
            <Svg width={w * 2} height={svgH}>
              <Path d={wave} fill={colors.water} />
            </Svg>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

export function WaterWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const barHeight = useTabBarHeight();
  // The day Home shows: today, or a past day picked on the row of days (DECISIONS 123).
  const { day: today } = useHomeDay();
  const glassMl = usePreferencesStore((s) => s.waterGlassMl);
  const showToast = useToastStore((s) => s.show);
  const water = useWater(today);
  const addWater = useAddWater();
  const removeWater = useRemoveWater();
  const goalGlasses = waterGoal(glassMl).glasses;
  const totalMl = water.data?.totalMl ?? 0;
  const glasses = Math.round(totalMl / glassMl);
  const small = size === 'small';

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
    <Frame
      size={size}
      label={t('today.waterLabel')}
      icon="droplet"
      area="water"
      right={
        <Text variant="label" muted numeric aria-hidden>
          {t('today.glassesOf', { n: glasses, total: goalGlasses })}
        </Text>
      }
    >
      <View style={{ flexDirection: 'row', gap: small ? 10 : 12, alignItems: 'flex-end' }}>
        {/* A glass that fills to today's amount (water: sky blue). */}
        <WaterGlass
          share={glasses / goalGlasses}
          width={small ? 40 : 44}
          height={small ? 64 : 72}
          accessibilityLabel={t('today.waterBar', { n: glasses, total: goalGlasses })}
        />
        <View style={{ flex: 1 }}>
          <BigNumber value={(totalMl / 1000).toFixed(1)} unit={t('today.litresUnit')} />
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
            backgroundColor: colors.waterSoft,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="plus" size={18} color={colors.waterInk} />
          <Text variant="bodyS" semibold style={{ color: colors.waterInk }}>
            {t('today.addGlass')}
          </Text>
        </Pressable>
      </View>
    </Frame>
  );
}

/**
 * The number of a small Home card, in the calories' style (big, semibold, tabular digits), with
 * its unit beside it in muted text.
 */
function BigNumber({ value, unit }: { value: string; unit?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
      <Text variant="displayM" numeric>
        {value}
      </Text>
      {unit ? (
        <Text variant="bodyS" muted>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

/** Where the weight line will be: a flat row of dashes in the empty-track colour. */
function PendingLine({ height }: { height: number }) {
  const { colors } = useTheme();
  return (
    <View aria-hidden testID="pending-line" style={{ height, justifyContent: 'center' }}>
      {/* Dashes drawn as small bars: a one-sided dashed border is solid on Android. */}
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.dotOff }}
          />
        ))}
      </View>
    </View>
  );
}

/** The latest weight, a line of the last weeks and how it moved this week. Opens Body. */
export function WeightWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  // The day Home shows: today, or a past day picked on the row of days (DECISIONS 123).
  const { day: today, past } = useHomeDay();
  // On a past day: the weight as it was then (nothing logged after it counts).
  const entries = (useBodyEntries().data ?? []).filter((e) => e.day <= today);
  const latest = entries.find((e) => e.weightKg != null);
  // Toward the profile goal is green; otherwise neutral (arrow and words say the direction).
  const trend = weightTrend(entries, today, useProfile().data?.goal);
  const line = weightLine(entries, today);
  const small = size === 'small';
  const kg = trend ? Math.abs(trend.change).toFixed(1) : '';

  return (
    <Frame
      size={size}
      label={t('today.weight')}
      icon="scale"
      area="neutral"
      // The check-in logs today: a past day without a weight has nothing to open.
      onPress={
        latest
          ? () => router.push('/progress/body')
          : past
            ? undefined
            : () => router.push('/check-in')
      }
      pressLabel={latest ? undefined : t('today.logWeight')}
    >
      {latest?.weightKg != null ? (
        <>
          <BigNumber value={latest.weightKg.toFixed(1)} unit={t('today.kgUnit')} />
          {line.length > 1 ? (
            <Sparkline
              values={line}
              height={small ? 40 : 48}
              color={colors.text}
              accessibilityLabel={t('today.weightLineA11y')}
            />
          ) : (
            // One weigh-in: the line starts with the second one.
            <PendingLine height={small ? 40 : 48} />
          )}
          {trend ? (
            <View
              accessible
              accessibilityLabel={
                trend.direction === 'flat'
                  ? t('today.weightSteady')
                  : t(trend.direction === 'down' ? 'today.weightDownA11y' : 'today.weightUpA11y', {
                      kg,
                    })
              }
            >
              <StatusChip
                area={trend.towardGoal ? 'better' : 'neutral'}
                icon={
                  trend.direction === 'down'
                    ? 'arrowDown'
                    : trend.direction === 'up'
                      ? 'arrowUp'
                      : undefined
                }
                label={
                  trend.direction === 'flat'
                    ? t('today.weightSteady')
                    : t('today.weightChange', { kg })
                }
              />
            </View>
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
        // No weight yet: the same card unfilled (a dash for the number, a flat dashed line where
        // the trend goes) and the way to log it; the whole card opens the check-in.
        <>
          <BigNumber value={'–'} unit={t('today.kgUnit')} />
          <PendingLine height={small ? 40 : 48} />
          {past ? (
            <Text variant="bodyS" muted>
              {t('today.past.noWeight')}
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={18} color={colors.text} />
              <Text variant="bodyS" semibold>
                {t('today.logWeight')}
              </Text>
            </View>
          )}
        </>
      )}
    </Frame>
  );
}

/**
 * Today's supplements: how many are taken (number and filled bar) and the list as pills to tick.
 * The pencil opens the list to add or remove supplements.
 */
export function SupplementsWidget({ size }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // The day Home shows: today, or a past day picked on the row of days (DECISIONS 123).
  const { day: today } = useHomeDay();
  const [open, setOpen] = useState(false);
  const list = useSupplements().data ?? [];
  const taken = useSupplementLogs(today, today).data?.get(today);
  const setTaken = useSetTaken();
  const count = supplementsCount(list, taken);

  return (
    <>
      <Frame
        size={size}
        label={t('today.supplements')}
        icon="pill"
        area="supplements"
        right={
          // With an empty list the dashed pill below is the one way in.
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
          // No list yet: one empty pill, the shape the supplements will take, opens the list.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('today.supplementsAdd')}
            onPress={() => setOpen(true)}
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: 14,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.borderControl,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="plus" size={20} color={colors.text} />
            <Text variant="bodyS" semibold style={{ flex: 1 }}>
              {t('today.supplementsAdd')}
            </Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            <View
              accessible
              accessibilityLabel={t('today.supplementsTaken', {
                n: count.taken,
                total: count.total,
              })}
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}
            >
              <Text variant="displayM" numeric aria-hidden>
                {String(count.taken)}
              </Text>
              <Text variant="bodyS" muted numeric aria-hidden>
                {t('today.supplementsOfTaken', { total: count.total })}
              </Text>
            </View>
            <DotBar
              total={count.total}
              on={count.taken}
              color={colors.success}
              track={colors.successSoft}
              accessibilityLabel={t('today.supplements')}
            />
          </View>
        )}
        {/* Taking a supplement is a tick, not a setting: tap the pill (supplements: green). */}
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
                  backgroundColor: on ? colors.successSoft : colors.surface,
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
                    borderWidth: 2,
                    borderColor: on ? colors.success : colors.borderControl,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckFill
                    done={on}
                    size={20}
                    fill={colors.success}
                    iconOn={colors.surface}
                    iconOff="transparent"
                    iconSize={14}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Half width: long names wrap to a second line instead of being cut. */}
                  <Text
                    variant="bodyS"
                    semibold
                    numberOfLines={size === 'small' ? 2 : 1}
                    style={on ? { color: colors.successText } : undefined}
                  >
                    {s.name}
                  </Text>
                  {s.dose ? (
                    <Text
                      variant="label"
                      numberOfLines={size === 'small' ? 2 : 1}
                      muted={!on}
                      style={on ? { color: colors.successText } : undefined}
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
