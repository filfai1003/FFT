import { View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/design/use-theme';

/**
 * A small green circle with a tick: the food's values were checked (canvas "Food search").
 * Decorative: the row or the source line also says "Verified" in words.
 */
export function VerifiedTick() {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.success,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="check" size={12} color={colors.bg} />
    </View>
  );
}
