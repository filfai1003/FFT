import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { monthGrid, shiftMonth } from '@/domain/day';
import { Button } from './Button';
import { MonthGrid, MonthSwitcher } from './MonthGrid';
import { Sheet } from './Sheet';

/**
 * The one month calendar of the app (DECISIONS 123): opened by the calendar button in the
 * header of every page with days (Today, Diet), it picks a day for that page and closes. Days
 * still to come cannot be picked; "Go to today" comes back from the past. What each day holds
 * is drawn by the page (`renderMarks`; `onMonthShown` says which month to load).
 */
export function CalendarSheet({
  visible,
  onClose,
  selected,
  today,
  weekStart,
  onSelect,
  renderMarks,
  describe,
  legend,
  onMonthShown,
}: {
  visible: boolean;
  onClose: () => void;
  selected: string;
  today: string;
  weekStart: 'mon' | 'sun';
  onSelect: (day: string) => void;
  renderMarks?: (day: string, future: boolean) => ReactNode;
  describe?: (day: string) => readonly (string | null | false | undefined)[];
  legend?: ReactNode;
  /** The month on screen (YYYY-MM), so the page can load what its days hold. */
  onMonthShown?: (month: string) => void;
}) {
  const { t } = useTranslation();
  // Months away from the selected day's: back to 0 each time the sheet closes.
  const [offset, setOffset] = useState(0);
  const month = shiftMonth(selected.slice(0, 7), offset);
  const close = () => {
    setOffset(0);
    onMonthShown?.(selected.slice(0, 7));
    onClose();
  };
  const pick = (day: string) => {
    onSelect(day);
    close();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('days.calendarTitle')}
      closeLabel={t('common.close')}
    >
      <MonthSwitcher
        month={month}
        today={today}
        onChange={(m) => {
          const [y1, m1] = selected.slice(0, 7).split('-').map(Number);
          const [y2, m2] = m.split('-').map(Number);
          setOffset((y2 - y1) * 12 + (m2 - m1));
          onMonthShown?.(m);
        }}
      />
      <MonthGrid
        cells={monthGrid(month, weekStart)}
        weekStart={weekStart}
        today={today}
        selected={selected}
        onSelect={pick}
        renderMarks={renderMarks}
        describe={describe}
      />
      {legend}
      {selected !== today ? (
        <Button variant="secondary" label={t('days.goToToday')} onPress={() => pick(today)} />
      ) : null}
    </Sheet>
  );
}
