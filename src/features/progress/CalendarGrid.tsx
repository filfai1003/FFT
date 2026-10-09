import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, deviceTimeZone, localDay } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay, type DietDayStatus } from '@/domain/diet';
import { useGoals } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useMonthSessions, type SessionView } from '@/features/train/history';
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

export type CalendarData = {
  sessionsByDay: Map<string, SessionView[]>;
  statusOf: (day: string) => DietDayStatus;
};

/** Workouts and diet status per day for the given months (a week can span two). */
export function useCalendarData(yms: readonly [string, string]): CalendarData {
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const first = useMonthSessions(yms[0]);
  const second = useMonthSessions(yms[1]);
  const kcalA = useMonthKcal(yms[0]);
  const kcalB = useMonthKcal(yms[1]);
  const goals = useGoals();

  const sessionsByDay = new Map<string, SessionView[]>();
  for (const s of [...(first.data ?? []), ...(yms[1] === yms[0] ? [] : (second.data ?? []))]) {
    const day = localDay(new Date(s.startedAt), tz);
    if (day.slice(0, 7) !== yms[0] && day.slice(0, 7) !== yms[1]) continue;
    sessionsByDay.set(day, [...(sessionsByDay.get(day) ?? []), s]);
  }

  const statusOf = (day: string): DietDayStatus => {
    const goal = goalForDay(goals.data ?? [], day);
    if (!goal) return 'none';
    const target = targetForDay(goal, sessionsByDay.has(day));
    const kcal = (day.slice(0, 7) === yms[0] ? kcalA : kcalB).data?.get(day) ?? 0;
    return dietDayStatus(kcal, target.kcal);
  };
  return { sessionsByDay, statusOf };
}

/** Rows of 7 days (null = empty cell) with the weekday letters on top. */
export function CalendarGrid({
  cells,
  today,
  selected,
  onSelect,
  weekStart,
  data,
}: {
  cells: readonly (string | null)[];
  today: string;
  selected: string;
  onSelect: (day: string) => void;
  weekStart: 'mon' | 'sun';
  data: CalendarData;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const letters =
    weekStart === 'mon' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const dot = (filled: boolean, ring: boolean) => ({
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: filled ? colors.dotOn : 'transparent',
    borderWidth: filled ? 0 : 1,
    borderColor: ring ? colors.text : colors.dotOff,
  });

  return (
    <>
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
          const trained = day != null && data.sessionsByDay.has(day);
          const status = day != null && !future ? data.statusOf(day) : 'none';
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
                  onPress={() => onSelect(day)}
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
    </>
  );
}

export function CalendarLegend() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dot = (filled: boolean, ring: boolean) => ({
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: filled ? colors.dotOn : 'transparent',
    borderWidth: filled ? 0 : 1,
    borderColor: ring ? colors.text : colors.dotOff,
  });
  const items = [
    [dot(true, true), t('calendar.legendWorkout')],
    [dot(true, false), t('calendar.legendDietOn')],
    [dot(false, true), t('calendar.legendDietOff')],
  ] as const;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 4 }}>
      {items.map(([style, label]) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={style} />
          <Text variant="label" muted>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
