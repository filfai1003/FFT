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
import {
  supplementDay,
  useSupplementLogs,
  useSupplements,
  type SupplementDay,
} from '@/features/supplements/data';
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
  supplementsOf: (day: string) => SupplementDay;
};

/** Workouts and diet status per day for the given months (a week can span two). */
export function useCalendarData(yms: readonly [string, string]): CalendarData {
  const tz = useProfile().data?.timezone ?? deviceTimeZone();
  const first = useMonthSessions(yms[0]);
  const second = useMonthSessions(yms[1]);
  const kcalA = useMonthKcal(yms[0]);
  const kcalB = useMonthKcal(yms[1]);
  const goals = useGoals();
  const lastDay = new Date(
    Date.UTC(Number(yms[1].slice(0, 4)), Number(yms[1].slice(5, 7)), 0),
  ).getUTCDate();
  const supplements = useSupplements();
  const taken = useSupplementLogs(`${yms[0]}-01`, `${yms[1]}-${String(lastDay).padStart(2, '0')}`);

  const sessionsByDay = new Map<string, SessionView[]>();
  for (const s of [...(first.data ?? []), ...(yms[1] === yms[0] ? [] : (second.data ?? []))]) {
    const day = localDay(new Date(s.startedAt), tz);
    if (day.slice(0, 7) !== yms[0] && day.slice(0, 7) !== yms[1]) continue;
    sessionsByDay.set(day, [...(sessionsByDay.get(day) ?? []), s]);
  }

  const statusOf = (day: string): DietDayStatus => {
    // No target that day (DECISIONS 104): nothing to be on or off.
    const target = targetForDay(goalForDay(goals.data ?? [], day), sessionsByDay.has(day));
    if (!target) return 'none';
    const kcal = (day.slice(0, 7) === yms[0] ? kcalA : kcalB).data?.get(day) ?? 0;
    return dietDayStatus(kcal, target.kcal);
  };
  const supplementsOf = (day: string): SupplementDay =>
    supplementDay(taken.data?.get(day), supplements.data ?? []);
  return { sessionsByDay, statusOf, supplementsOf };
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

  const dot = trackDot(colors);

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
          const supps = day != null && !future ? data.supplementsOf(day) : 'none';
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
                    supps === 'all'
                      ? t('calendar.supplementsAll')
                      : supps === 'some'
                        ? t('calendar.supplementsSome')
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
                  <Text variant="label">{dayOfMonth(day)}</Text>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    <View style={dot(colors.track.workout, trained ? 'full' : 'empty')} />
                    <View
                      style={dot(
                        colors.track.diet,
                        status === 'onTarget' ? 'full' : status === 'off' ? 'ring' : 'empty',
                      )}
                    />
                    <View
                      style={dot(
                        colors.success,
                        supps === 'all' ? 'full' : supps === 'some' ? 'ring' : 'empty',
                      )}
                    />
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

/**
 * One calendar dot: `full` = done / on target, `ring` = off target / only part, `empty` = nothing.
 * The shape always tells the state; the colour only tells which of the three it is.
 */
function trackDot(colors: { dotOff: string }) {
  return (color: string, state: 'full' | 'ring' | 'empty') => ({
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: state === 'full' ? color : 'transparent',
    borderWidth: state === 'full' ? 0 : 1.5,
    borderColor: state === 'ring' ? color : colors.dotOff,
  });
}

export function CalendarLegend() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dot = trackDot(colors);
  const items = [
    [dot(colors.track.workout, 'full'), t('calendar.legendWorkout')],
    [dot(colors.track.diet, 'full'), t('calendar.legendDietOn')],
    [dot(colors.success, 'full'), t('calendar.legendSupplements')],
    [dot(colors.textMuted, 'ring'), t('calendar.legendPartly')],
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
