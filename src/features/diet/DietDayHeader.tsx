import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DayStrip } from '@/components/ui/DayStrip';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { shortDateLabel, weekOf } from '@/domain/day';
import { DayCalendarSheet } from '@/features/progress/calendar-data';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useStripStatuses } from './week-status';

/**
 * The top of the Diet page, the same in both modes (DECISIONS 123): the shown day over the title,
 * the goals button, the calendar button at the right end (shared calendar sheet), then the shared
 * row of days with its marks. Picking a day anywhere shows that day's log.
 */
export function DietDayHeader({
  day,
  today,
  setDay,
}: {
  day: string;
  today: string;
  setDay: (day: string) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const weekStart = usePreferencesStore((s) => s.weekStart);
  const week = weekOf(day, weekStart);
  const marks = useStripStatuses(week, today);
  const [calendar, setCalendar] = useState(false);
  return (
    <>
      <PageHeader
        // The day itself (not only the month): which day the log shows, at a glance.
        overline={shortDateLabel(day)}
        title={t('nav.diet')}
        actions={
          <IconButton
            icon="gear"
            accessibilityLabel={t('diet.goalsAndMode')}
            onPress={() => router.push('/diet-goals')}
          />
        }
        onCalendar={() => setCalendar(true)}
      />
      <DayStrip days={week} selected={day} today={today} onSelect={setDay} marks={marks} />
      <DayCalendarSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        selected={day}
        onSelect={setDay}
      />
    </>
  );
}
