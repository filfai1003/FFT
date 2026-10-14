import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { addDays, monthYearLabel, shortDateLabel, weekOf } from '@/domain/day';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { monthGrid, shiftMonth } from '@/features/train/HistoryScreen';
import { goBack as goBackTo } from '@/lib/navigation';
import { CalendarGrid, CalendarLegend, useCalendarData } from './CalendarGrid';
import { DayDetail } from './DayDetail';

export type CalendarMode = 'week' | 'month';

/** Calendar of the week or the month: which days you trained and which days you followed the diet. */
export function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = () => goBackTo(router, '/(tabs)');
  const today = useToday();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const [mode, setMode] = useState<CalendarMode>('month');
  const [selected, setSelected] = useState(today);

  const ym = selected.slice(0, 7);
  const cells: (string | null)[] =
    mode === 'week' ? weekOf(selected, weekStart) : monthGrid(ym, weekStart);
  const days = cells.filter((d): d is string => d != null);
  const data = useCalendarData([days[0]!.slice(0, 7), days[days.length - 1]!.slice(0, 7)]);

  const past = days.filter((d) => d <= today);
  const trainedCount = past.filter((d) => data.sessionsByDay.has(d)).length;
  const onTargetCount = past.filter((d) => data.statusOf(d) === 'onTarget').length;
  const atEnd = days[days.length - 1]! >= today;

  const move = (delta: -1 | 1) => {
    if (mode === 'week') {
      setSelected(addDays(selected, 7 * delta));
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
      <Text variant="screenTitle">{t('calendar.title')}</Text>

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
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="label">{title}</Text>
            <Text variant="label" muted>
              {t('calendar.summary', { workouts: trainedCount, diet: onTargetCount })}
            </Text>
          </View>
          <IconButton
            icon="chevronRight"
            accessibilityLabel={mode === 'week' ? t('calendar.nextWeek') : t('history.nextMonth')}
            disabled={atEnd}
            onPress={() => move(1)}
          />
        </View>

        <CalendarGrid
          cells={cells}
          today={today}
          selected={selected}
          onSelect={setSelected}
          weekStart={weekStart}
          data={data}
        />
        <CalendarLegend />
      </Card>

      <DayDetail day={selected} sessions={data.sessionsByDay.get(selected) ?? []} />
    </Screen>
  );
}
