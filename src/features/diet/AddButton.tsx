import { Icon } from '@/components/ui/Icon';
import { AnimatedPressable, pressFeedback, usePressScale } from '@/components/ui/motion';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';

/**
 * The round "+" of a meal or a search result: always soft (the empty-track fill, text-colour icon),
 * the same quiet look for every in-page add (DECISIONS 123). Never filled and never the accent:
 * that stays the one main action of the page.
 */
export function AddButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const press = usePressScale(pressFeedback.icon);
  const box = touch.minTarget;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        tick();
        onPress();
      }}
      style={[
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          backgroundColor: colors.dotOff,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: press.opacity,
        },
        press.style,
      ]}
    >
      <Icon name="plus" size={20} color={colors.text} />
    </AnimatedPressable>
  );
}
