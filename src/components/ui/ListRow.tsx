import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Text } from './Text';

export type ListRowProps = {
  title: string;
  /** Small mono line under the title. */
  info?: string;
  /** Next to the title: "MINE", "IN DAY"… */
  badge?: string;
  /** Left side, usually an exercise image. */
  leading?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean };
  accessibilityRole?: 'button' | 'checkbox' | 'radio';
  /** `dashed` row separator like the lists in the mockups. */
  divider?: boolean;
};

/** A list item (≥ 52, usually 60 px high) with a dashed divider. */
export function ListRow({
  title,
  info,
  badge,
  leading,
  right,
  onPress,
  accessibilityLabel,
  accessibilityState,
  accessibilityRole = 'button',
  divider = true,
}: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="body">{title}</Text>
          {badge ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.borderControl,
              }}
            >
              <Text variant="label" style={{ color: colors.text }}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {info ? (
          <Text variant="label" muted>
            {info}
          </Text>
        ) : null}
      </View>
      {right}
    </>
  );

  const style = {
    minHeight: 60,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: colors.borderDecorative,
    paddingVertical: 6,
  };

  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      aria-checked={accessibilityState?.checked}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [
        style,
        { minHeight: Math.max(60, touch.listRowMin), opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {content}
    </Pressable>
  );
}
