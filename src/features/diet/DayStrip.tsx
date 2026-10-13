import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, weekdayLetter, weekdayName } from '@/domain/day';

/** The 7 days of the week: tap one to see its food log. The selected day is filled dark. */
export function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: readonly string[];
  selected: string;
  onSelect: (day: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
      {days.map((day) => {
        const isSelected = day === selected;
        return (
          <Pressable
            key={day}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            aria-checked={isSelected}
            accessibilityLabel={`${weekdayName(day)} ${dayOfMonth(day)}`}
            onPress={() => onSelect(day)}
            style={{
              flex: 1,
              height: 56,
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
          </Pressable>
        );
      })}
    </View>
  );
}
