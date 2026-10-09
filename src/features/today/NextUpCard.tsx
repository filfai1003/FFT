import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { deviceTimeZone, localDay } from '@/domain/day';
import { checkAsPlanned, mealForHour, nextFixedMeal } from '@/domain/diet';
import { useFixedChecks, useFixedPlan, useSetCheck } from '@/features/diet/fixed';
import { useDayTotals } from '@/features/diet/log';
import { useDayTarget } from '@/features/diet/day-hooks';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useStartWorkout } from '@/features/session/start';
import { useSessionStore } from '@/features/session/store';
import { useMonthSessions } from '@/features/train/history';
import { estimateMinutes, useActivePlan, useRotation } from '@/features/train/plans';
import { confirm } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';

/**
 * The one thing to do now: start today's workout, eat the next meal, or nothing (all done).
 * Everything else on Today is status you can glance at.
 */
export function NextUpCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const profile = useProfile();
  const showToast = useToastStore((s) => s.show);
  const active = useSessionStore((s) => s.active);

  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const { startDay } = useStartWorkout();
  const tz = profile.data?.timezone ?? deviceTimeZone();
  const monthSessions = useMonthSessions(today.slice(0, 7));
  const trainedToday = (monthSessions.data ?? []).some(
    (s) => localDay(new Date(s.startedAt), tz) === today,
  );
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];

  const fixed = profile.data?.diet_mode === 'fixed_meals';
  const plannedMeals = useFixedPlan();
  const checks = useFixedChecks(today);
  const setCheck = useSetCheck();
  const nextMeal = plannedMeals.data?.meals.find(
    (m) => m.id === nextFixedMeal(plannedMeals.data!.meals, checks.data ?? []),
  );
  const totals = useDayTotals(today);
  const target = useDayTarget(today);
  const kcalLeft = target ? Math.round(target.kcal - (totals.data?.kcal ?? 0)) : 0;

  // A workout already in progress has its own banner on top.
  if (active) return null;

  let kicker = t('today.focus.done');
  let title = t('today.focus.doneTitle');
  let info: string | null = t('today.focus.doneInfo');
  let action: { label: string; icon: 'play' | 'check' | 'plus'; run: () => void } | null = null;

  if (upNext && plan && !trainedToday && upNext.exercises.length > 0) {
    kicker = t('today.focus.train');
    title = upNext.name;
    info = t('train.exerciseCount', {
      count: upNext.exercises.length,
      min: estimateMinutes(upNext),
    });
    action = {
      label: t('train.start'),
      icon: 'play',
      run: () => startDay(plan, upNext, rotation),
    };
  } else if (fixed && nextMeal) {
    kicker = t('today.focus.eat');
    title = nextMeal.name;
    info = t('diet.mealLine', {
      kcal: nextMeal.kcal,
      p: Math.round(nextMeal.proteinG),
      c: Math.round(nextMeal.carbsG),
      f: Math.round(nextMeal.fatG),
    });
    action = {
      label: t('today.markEaten', { name: nextMeal.name }),
      icon: 'check',
      run: () => {
        setCheck.mutate({ day: today, mealId: nextMeal.id, check: checkAsPlanned(nextMeal) });
        confirm();
        showToast({
          message: t('diet.mealDone', { name: nextMeal.name }),
          actionLabel: t('common.undo'),
          bottomOffset: barHeight,
          onAction: () => setCheck.mutate({ day: today, mealId: nextMeal.id, check: null }),
        });
      },
    };
  } else if (!fixed && kcalLeft > 0) {
    kicker = t('today.focus.eat');
    title = t('today.focus.logTitle');
    info = t('today.focus.logInfo', { kcal: kcalLeft });
    action = {
      label: t('today.logMeal'),
      icon: 'plus',
      run: () =>
        router.push({
          pathname: '/food-search',
          params: { meal: mealForHour(new Date().getHours()), day: today },
        }),
    };
  }

  return (
    <Card gap={12}>
      <Text variant="label" muted>
        {kicker}
      </Text>
      <View style={{ gap: 4 }}>
        <Text variant="displayM" numberOfLines={2}>
          {title}
        </Text>
        {info ? (
          <Text variant="bodyS" muted>
            {info}
          </Text>
        ) : null}
      </View>
      {action ? <Button label={action.label} icon={action.icon} onPress={action.run} /> : null}
    </Card>
  );
}
