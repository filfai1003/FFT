import { Icon } from '@/components/ui/Icon';
import { AnimatedPressable, pressFeedback, usePressScale } from '@/components/ui/motion';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';

/**
 * The round "+" of a meal or a search result (canvas "Diet"): filled in the text colour where
 * adding is the next step (an empty meal, a result), soft once the meal has foods. Never the
 * accent: that stays the one main action of the page.
 */
export function AddButton({
  accessibilityLabel,
  onPress,
  filled,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  filled: boolean;
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
          backgroundColor: filled ? colors.text : colors.dotOff,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: press.opacity,
        },
        press.style,
      ]}
    >
      <Icon name="plus" size={20} color={filled ? colors.bg : colors.text} />
    </AnimatedPressable>
  );
}
