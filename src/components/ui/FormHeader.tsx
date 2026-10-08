import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon } from './Icon';
import { Text } from './Text';

export type FormHeaderProps = {
  title?: string;
  /** Top-left: "Cancel"/"Close" for editors (thumb-safe place of the design), or a back arrow. */
  left?: { label: string; onPress: () => void; icon?: 'chevronLeft' | 'close' };
  right?: ReactNode;
};

/**
 * Header of editors, pickers and pushed screens: cancel/back on the left, short mono title in
 * the middle. The main action is NOT here: it goes in the BottomActionBar.
 */
export function FormHeader({ title, left, right }: FormHeaderProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: touch.minTarget,
        gap: 12,
      }}
    >
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {left ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={left.label}
            onPress={() => {
              tick();
              left.onPress();
            }}
            style={({ pressed }) => ({
              minHeight: touch.minTarget,
              minWidth: touch.minTarget,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {left.icon ? <Icon name={left.icon} color={colors.text} /> : null}
            <Text variant="body">{left.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {title ? (
        <Text variant="label" muted accessibilityRole="header" style={{ textAlign: 'center' }}>
          {title}
        </Text>
      ) : null}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}
