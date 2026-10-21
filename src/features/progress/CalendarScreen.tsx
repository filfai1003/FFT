import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { MonthGrid } from '@/components/ui/MonthGrid';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { StatusChip } from '@/components/ui/StatusChip';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import {
  addDays,
  monthGrid,
  monthYearLabel,
  shiftMonth,
  shortDateLabel,
  weekOf,
} from '@/domain/day';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { goBack as goBackTo } from '@/lib/navigation';
import { CalendarLegend, useCalendarData, useCalendarMarks } from './calendar-data';
import { DayDetail } from './DayDetail';

export type CalendarMode = 'week' | 'month';

/**
 * Progress calendar: the week or the month, which days you trained and followed the diet, and
 * the chosen day's detail. Its grid is the shared month grid (DECISIONS 123): a tap selects the
 * day and the detail below follows.
 */
export function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = () => goBackTo(router, '/progress');
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const [mode, setMode] = useState<CalendarMode>('month');
  const [selected, setSelected] = useState(today);

  const ym = selected.slice(0, 7);
  const cells: (string | null)[] =
    mode === 'week' ? weekOf(selected, weekStart) : monthGrid(ym, weekStart);
  const days = cells.filter((d): d is string => d != null);
  const data = useCalendarData([days[0]!.slice(0, 7), days[days.length - 1]!.slice(0, 7)]);
  const marks = useCalendarMarks(data);

  const past = days.filter((d) => d <= today);
  const trainedCount = past.filter((d) => data.sessionsByDay.has(d)).length;
  const onTargetCount = past.filter((d) => data.statusOf(d) === 'onTarget').length;
  const atEnd = days[days.length - 1]! >= today;

  const move = (delta: -1 | 1) => {
    if (mode === 'week') {
      const next = addDays(selected, 7 * delta);
      setSelected(next > today ? today : next);
      return;
    }
    const next = shiftMonth(ym, delta);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  };
  const title =
    mode === 'week'
      ? `${shortDateLabel(days[0]!)} – ${shortDateLabel(days[days.length - 1]!)}`
      : monthYearLabel(`${ym}-01`);

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={goBack} backLabel={t('common.back')} />
      <Text variant="screenTitle" accessibilityRole="header">
        {t('calendar.title')}
      </Text>

      <Segmented
        accessibilityLabel={t('calendar.view')}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setSelected(today);
        }}
        options={[
          { value: 'week', label: t('calendar.week') },
          { value: 'month', label: t('calendar.month') },
        ]}
      />

      <Card size="small" gap={10}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={mode === 'week' ? t('calendar.prevWeek') : t('history.prevMonth')}
            onPress={() => move(-1)}
          />
          <View style={{ alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <Text variant="label">{title}</Text>
            {/* The period at a glance, in the areas' colours (DECISIONS 114). */}
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}
            >
              <StatusChip
                area="training"
                icon="dumbbell"
                label={t('calendar.workoutsCount', { count: trainedCount })}
              />
              <StatusChip
                area="nutrition"
                icon="bowl"
                label={t('calendar.onTargetCount', { count: onTargetCount })}
              />
            </View>
          </View>
          <IconButton
            icon="chevronRight"
            accessibilityLabel={mode === 'week' ? t('calendar.nextWeek') : t('history.nextMonth')}
            disabled={atEnd}
            onPress={() => move(1)}
          />
        </View>

        <MonthGrid
          cells={cells}
          weekStart={weekStart}
          today={today}
          selected={selected}
          onSelect={setSelected}
          renderMarks={marks.renderMarks}
          describe={marks.describe}
        />
        <CalendarLegend />
      </Card>

      <DayDetail day={selected} sessions={data.sessionsByDay.get(selected) ?? []} />
    </Screen>
  );
}
