import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, monthYearLabel, shiftMonth, weekdayLetters, weekdayName } from '@/domain/day';
import { tick } from '@/lib/haptics';
import { IconButton } from './IconButton';
import { pressFeedback } from './motion';
import { Text } from './Text';

/**
 * The one month (or week) grid of the app (DECISIONS 123): the calendar sheet, the Progress
 * calendar and the training history draw their days with it, so a day looks and behaves the same
 * everywhere. A tap selects the day (2px border in the text colour, read as selected); today has
 * a thin ring; days still to come cannot be picked. What a day holds is drawn under its number
 * by the page (`renderMarks`) and read out with it (`describe`).
 */
export function MonthGrid({
  cells,
  weekStart,
  today,
  selected,
  onSelect,
  renderMarks,
  describe,
}: {
  /** Days in order (YYYY-MM-DD), null for the blanks before the 1st. */
  cells: readonly (string | null)[];
  weekStart: 'mon' | 'sun';
  today: string;
  selected?: string | null;
  onSelect: (day: string) => void;
  renderMarks?: (day: string, future: boolean) => ReactNode;
  /** Extra words for screen readers ("trained", "diet on target"). */
  describe?: (day: string) => readonly (string | null | false | undefined)[];
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {weekdayLetters(weekStart).map((l, i) => (
        <View
          key={`h${i}`}
          aria-hidden
          style={{ width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 4 }}
        >
          <Text variant="label" muted>
            {l}
          </Text>
        </View>
      ))}
      {cells.map((day, i) => {
        if (!day) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 50 }} />;
        const future = day > today;
        const isSelected = day === selected;
        const isToday = day === today;
        const label = [
          `${weekdayName(day)} ${dayOfMonth(day)}`,
          isToday ? t('days.today') : null,
          ...(future ? [] : (describe?.(day) ?? [])),
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <View key={day} style={{ width: `${100 / 7}%`, alignItems: 'center', padding: 1 }}>
            <Pressable
              testID={`cell-${day}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isSelected, disabled: future }}
              aria-selected={isSelected}
              aria-disabled={future}
              disabled={future}
              onPress={() => {
                tick();
                onSelect(day);
              }}
              style={({ pressed }) => ({
                width: 44,
                height: 48,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                // Selection = 2px border in the text colour; today a thin ring when not selected.
                borderWidth: isSelected ? 2 : isToday ? 1 : 0,
                borderColor: isSelected ? colors.borderSelected : colors.borderControl,
                backgroundColor: isSelected ? colors.surfaceSelected : 'transparent',
                opacity: future ? 0.35 : pressed ? pressFeedback.opacity : 1,
              })}
            >
              <Text variant="label" numeric semibold={isToday || isSelected}>
                {dayOfMonth(day)}
              </Text>
              {renderMarks ? renderMarks(day, future) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** "‹ October 2026 ›": the month switcher over a month grid (no months after `today`'s). */
export function MonthSwitcher({
  month,
  today,
  onChange,
  children,
}: {
  /** YYYY-MM */
  month: string;
  today: string;
  onChange: (month: string) => void;
  /** Under the month's name (e.g. the month's counts). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton
        icon="chevronLeft"
        accessibilityLabel={t('history.prevMonth')}
        onPress={() => onChange(shiftMonth(month, -1))}
      />
      <View style={{ alignItems: 'center', gap: 4, flexShrink: 1 }}>
        <Text variant="label" accessibilityRole="header">
          {monthYearLabel(`${month}-01`)}
        </Text>
        {children}
      </View>
      <IconButton
        icon="chevronRight"
        accessibilityLabel={t('history.nextMonth')}
        disabled={month >= today.slice(0, 7)}
        onPress={() => onChange(shiftMonth(month, 1))}
      />
    </View>
  );
}
