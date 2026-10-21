import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { CalendarSheet } from '@/components/ui/CalendarSheet';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { deviceTimeZone, localDay } from '@/domain/day';
import { dietDayStatus, goalForDay, targetForDay, type DietDayStatus } from '@/domain/diet';
import { useGoals } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
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

/**
 * What a day of a month grid shows and says (DECISIONS 114, 123): three dots, training, diet and
 * supplements, in their areas' colours, the shape telling the state. `only: 'training'` keeps the
 * training dot alone (the training history).
 */
export function useCalendarMarks(data: CalendarData, only?: 'training') {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dot = trackDot(colors);
  const renderMarks = (day: string, future: boolean) => {
    const trained = data.sessionsByDay.has(day);
    const status = future ? 'none' : data.statusOf(day);
    const supps = future ? 'none' : data.supplementsOf(day);
    return (
      <View aria-hidden style={{ flexDirection: 'row', gap: 3 }}>
        <View
          testID={trained ? `trained-${day}` : undefined}
          style={dot(colors.track.workout, trained ? 'full' : 'empty')}
        />
        {only === 'training' ? null : (
          <>
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
          </>
        )}
      </View>
    );
  };
  const describe = (day: string) => {
    const trained = data.sessionsByDay.has(day) ? t('calendar.trained') : null;
    if (only === 'training') return [trained];
    const status = data.statusOf(day);
    const supps = data.supplementsOf(day);
    return [
      trained,
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
    ];
  };
  return { renderMarks, describe };
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

/**
 * The calendar sheet of the pages with days (Today, Diet), with the same three dots as the
 * Progress calendar: one component, one look (DECISIONS 123).
 */
export function DayCalendarSheet({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const [month, setMonth] = useState<string | null>(null);
  const ym = month ?? selected.slice(0, 7);
  const data = useCalendarData([ym, ym]);
  const marks = useCalendarMarks(data);
  return (
    <CalendarSheet
      visible={visible}
      onClose={() => {
        setMonth(null);
        onClose();
      }}
      selected={selected}
      today={today}
      weekStart={weekStart}
      onSelect={onSelect}
      onMonthShown={setMonth}
      renderMarks={marks.renderMarks}
      describe={marks.describe}
      legend={<CalendarLegend />}
    />
  );
}
