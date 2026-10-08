import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { dayOfMonth, weekdayLetter, weekdayName } from '@/domain/day';

/** The 7 days of the week: tap one to see its food log. The selected day gets a white border. */
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
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isSelected ? colors.borderSelected : colors.borderDecorative,
              backgroundColor: isSelected ? colors.surfaceSelected : colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Text variant="label" style={{ color: isSelected ? colors.accent : colors.textMuted }}>
              {weekdayLetter(day)}
            </Text>
            <Text variant="displayS" numeric>
              {dayOfMonth(day)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
