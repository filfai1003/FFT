import { View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

export type DayPillState = 'done' | 'doneOutOfOrder' | 'next' | 'todo';

/**
 * One day of the plan in the cycle strip. The state is shown with border style AND a check mark,
 * not with colour alone.
 */
export function DayPill({ label, state }: { label: string; state: DayPillState }) {
  const { colors } = useTheme();
  const done = state === 'done' || state === 'doneOutOfOrder';
  return (
    <View
      style={{
        height: 40,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderStyle: state === 'doneOutOfOrder' || state === 'todo' ? 'dashed' : 'solid',
        borderColor:
          state === 'next'
            ? colors.borderSelected
            : state === 'doneOutOfOrder'
              ? colors.textPlaceholderIcon
              : colors.borderControl,
        backgroundColor: done ? colors.surfaceRaised : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 4,
      }}
    >
      {done ? <Icon name="check" size={14} color={colors.text} /> : null}
      <Text
        variant="label"
        numberOfLines={1}
        style={{ color: state === 'todo' ? colors.textMuted : colors.text, letterSpacing: 0.4 }}
      >
        {label}
      </Text>
    </View>
  );
}

/** "Pull" -> "PULL", "Push A" -> "PUSH A", "Day 2" -> "DAY 2": at most 6 characters. */
export function shortDayLabel(name: string): string {
  const words = name.trim().split(/\s+/);
  // A short suffix (A, B, 2) keeps the days of a plan tell-apart-able.
  const last = words[words.length - 1] ?? '';
  const label = words.length > 1 && last.length <= 2 ? `${words[0]} ${last}` : words[0];
  return label.slice(0, 6);
}
