import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, weekdayLetter, weekdayName } from '@/domain/day';
import type { StripDayStatus } from './week-status';

/**
 * The 7 days of the week: tap one to see its food log. The selected day is filled dark. Under
 * each past day a short mark tells how it went (DECISIONS 112): filled green = on target,
 * red outline = off target, teal = logged (today, or no target), grey = nothing logged. The
 * shapes differ too (filled / outline), and each day reads its status aloud.
 */
export function DayStrip({
  days,
  selected,
  onSelect,
  statuses,
}: {
  days: readonly string[];
  selected: string;
  onSelect: (day: string) => void;
  /** Null while loading: the marks are left out rather than shown wrong. */
  statuses?: Record<string, StripDayStatus> | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
      {days.map((day) => {
        const isSelected = day === selected;
        const status = statuses?.[day];
        const spoken = status && status !== 'future' ? `, ${t(`diet.dayStatus.${status}`)}` : '';
        return (
          <Pressable
            key={day}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            aria-checked={isSelected}
            accessibilityLabel={`${weekdayName(day)} ${dayOfMonth(day)}${spoken}`}
            onPress={() => onSelect(day)}
            style={{
              flex: 1,
              height: statuses === undefined ? 56 : 62,
              borderRadius: 14,
              backgroundColor: isSelected ? colors.text : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Text variant="label" style={{ color: isSelected ? colors.bg : colors.textMuted }}>
              {weekdayLetter(day)}
            </Text>
            <Text
              variant="body"
              numeric
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: isSelected ? colors.bg : colors.text,
              }}
            >
              {dayOfMonth(day)}
            </Text>
            {statuses === undefined ? null : <StatusMark status={status} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusMark({ status }: { status: StripDayStatus | undefined }) {
  const { colors } = useTheme();
  const base = { width: 20, height: 4, borderRadius: 2 } as const;
  if (!status || status === 'future') return <View aria-hidden style={base} />;
  if (status === 'off')
    return (
      <View
        aria-hidden
        style={{ ...base, height: 5, borderWidth: 1.5, borderColor: colors.danger }}
      />
    );
  const fill =
    status === 'onTarget' ? colors.success : status === 'logged' ? colors.nutrition : colors.dotOff;
  return <View aria-hidden style={{ ...base, backgroundColor: fill }} />;
}
