import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, deviceTimeZone, localDay, monthYearLabel, shortDateLabel } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay, type DietDayStatus } from '@/domain/diet';
import { useGoals, useDayTotals } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { monthGrid, shiftMonth } from '@/features/train/HistoryScreen';
import { useMonthSessions, type SessionView } from '@/features/train/history';
import { goBack } from '@/lib/navigation';
import { getSupabase } from '@/lib/supabase';

/** Calories eaten on each day of a month (from the same view as Today and the diary). */
function useMonthKcal(ym: string) {
  return useQuery({
    queryKey: ['diet', 'month-kcal', ym],
    queryFn: async () => {
      const last = new Date(
        Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0),
      ).getUTCDate();
      const { data, error } = await getSupabase()
        .from('daily_nutrition_totals')
        .select('day, kcal')
        .gte('day', `${ym}-01`)
        .lte('day', `${ym}-${String(last).padStart(2, '0')}`);
      if (error) throw error;
      return new Map(
        (data as { day: string; kcal: number | string }[]).map((r) => [r.day, Number(r.kcal)]),
      );
    },
  });
}

/** Calendar of the month: which days you trained and which days you followed the diet. */
export function CalendarScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useTabBarHeight();
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  const sessions = useMonthSessions(ym);
  const kcal = useMonthKcal(ym);
  const goals = useGoals();

  const sessionsByDay = new Map<string, SessionView[]>();
  for (const s of sessions.data ?? []) {
    const day = localDay(new Date(s.startedAt), tz);
    if (day.slice(0, 7) !== ym) continue;
    sessionsByDay.set(day, [...(sessionsByDay.get(day) ?? []), s]);
  }

  const statusOf = (day: string): DietDayStatus => {
    const goal = goalForDay(goals.data ?? [], day);
    if (!goal) return 'none';
    const target = targetForDay(goal, sessionsByDay.has(day));
    return dietDayStatus(kcal.data?.get(day) ?? 0, target.kcal);
  };

  const cells = monthGrid(ym, weekStart);
  const letters =
    weekStart === 'mon' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const monthDays = cells.filter((d): d is string => d != null && d <= today);
  const trainedCount = monthDays.filter((d) => sessionsByDay.has(d)).length;
  const onTargetCount = monthDays.filter((d) => statusOf(d) === 'onTarget').length;
  const isCurrent = ym === today.slice(0, 7);

  const dot = (filled: boolean, ring: boolean) => ({
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: filled ? colors.dotOn : 'transparent',
    borderWidth: filled ? 0 : 1,
    borderColor: ring ? colors.text : colors.dotOff,
  });

  return (
    <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
      <TopBar onBack={() => goBack(router, '/progress')} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('calendar.title')}</Text>

      <Card size="small" gap={10}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={t('history.prevMonth')}
            onPress={() => setYm(shiftMonth(ym, -1))}
          />
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="label">{monthYearLabel(`${ym}-01`)}</Text>
            <Text variant="label" muted>
              {t('calendar.summary', { workouts: trainedCount, diet: onTargetCount })}
            </Text>
          </View>
          <IconButton
            icon="chevronRight"
            accessibilityLabel={t('history.nextMonth')}
            disabled={isCurrent}
            onPress={() => setYm(shiftMonth(ym, 1))}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {letters.map((l, i) => (
            <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 4 }}>
              <Text variant="label" muted>
                {l}
              </Text>
            </View>
          ))}
          {cells.map((day, i) => {
            const future = day != null && day > today;
            const trained = day != null && sessionsByDay.has(day);
            const status = day != null && !future ? statusOf(day) : 'none';
            const isSelected = day === selected;
            const isToday = day === today;
            return (
              <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', padding: 1 }}>
                {day ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={[
                      String(dayOfMonth(day)),
                      trained ? t('calendar.trained') : null,
                      status === 'onTarget'
                        ? t('calendar.dietOnTarget')
                        : status === 'off'
                          ? t('calendar.dietOff')
                          : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    aria-selected={isSelected}
                    accessibilityState={{ selected: isSelected, disabled: future }}
                    aria-disabled={future}
                    disabled={future}
                    onPress={() => setSelected(day)}
                    style={{
                      width: 44,
                      height: 48,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      borderWidth: isSelected || isToday ? 1 : 0,
                      borderColor: isSelected ? colors.borderSelected : colors.accent,
                      backgroundColor: isSelected ? colors.surfaceSelected : 'transparent',
                      opacity: future ? 0.35 : 1,
                    }}
                  >
                    <Text variant="label" style={{ letterSpacing: 0 }}>
                      {dayOfMonth(day)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <View style={dot(trained, trained)} />
                      <View style={dot(status === 'onTarget', status === 'off')} />
                    </View>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 4 }}>
          <LegendItem style={dot(true, true)} label={t('calendar.legendWorkout')} />
          <LegendItem style={dot(true, false)} label={t('calendar.legendDietOn')} />
          <LegendItem style={dot(false, true)} label={t('calendar.legendDietOff')} />
        </View>
      </Card>

      <DayDetail day={selected} today={today} sessions={sessionsByDay.get(selected) ?? []} />
    </Screen>
  );
}

function LegendItem({ style, label }: { style: object; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={style} />
      <Text variant="label" muted>
        {label}
      </Text>
    </View>
  );
}

/** What happened on the selected day: workouts and the diet against its target. */
function DayDetail({
  day,
  today,
  sessions,
}: {
  day: string;
  today: string;
  sessions: SessionView[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const goals = useGoals();
  const totals = useDayTotals(day);
  const goal = goalForDay(goals.data ?? [], day);
  const target = goal ? targetForDay(goal, sessions.length > 0) : null;
  const eaten = totals.data;
  const status = target && eaten ? dietDayStatus(eaten.kcal, target.kcal) : 'none';
  const future = day > today;

  return (
    <Card gap={12}>
      <Text variant="label" muted>
        {shortDateLabel(day)}
      </Text>

      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          {t('calendar.workouts')}
        </Text>
        {sessions.length === 0 ? (
          <Text variant="bodyS" muted>
            {future ? t('calendar.future') : t('calendar.noWorkout')}
          </Text>
        ) : (
          sessions.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.name || t('train.emptyWorkout')}
              onPress={() =>
                router.push({
                  pathname: '/progress/history/[sessionId]',
                  params: { sessionId: s.id },
                })
              }
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text variant="body">{s.name || t('train.emptyWorkout')}</Text>
              <Text variant="label" muted>
                {t('calendar.workoutInfo', { sets: s.stats.sets })}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          {t('calendar.diet')}
        </Text>
        {future || !eaten || eaten.kcal <= 0 ? (
          <Text variant="bodyS" muted>
            {future ? t('calendar.future') : t('calendar.noDiet')}
          </Text>
        ) : (
          <>
            <Text variant="body">
              {t('calendar.dietLine', {
                eaten: Math.round(eaten.kcal),
                target: Math.round(target?.kcal ?? 0),
              })}
            </Text>
            <Text variant="label" muted>
              {t('diet.mealLine', {
                kcal: Math.round(eaten.kcal),
                p: Math.round(eaten.protein),
                c: Math.round(eaten.carbs),
                f: Math.round(eaten.fat),
              })}
            </Text>
            <Text variant="label" muted>
              {status === 'onTarget' ? t('calendar.dietOnTarget') : t('calendar.dietOff')}
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}
