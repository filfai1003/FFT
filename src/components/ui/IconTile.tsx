import { View } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { Icon, type IconName } from './Icon';

/**
 * The areas of the colour code (DECISIONS 107). Each has a fill, a soft background and an ink
 * for text and icons on the soft background.
 */
export type Area =
  'training' | 'nutrition' | 'water' | 'supplements' | 'streak' | 'better' | 'worse' | 'neutral';

export function useAreaColors(area: Area) {
  const { colors } = useTheme();
  switch (area) {
    case 'training':
      return { fill: colors.training, soft: colors.trainingSoft, ink: colors.trainingInk };
    case 'nutrition':
      return { fill: colors.nutrition, soft: colors.nutritionSoft, ink: colors.nutritionInk };
    // Home cards (owner's polish): water in sky blue, supplements in green.
    case 'water':
      return { fill: colors.water, soft: colors.waterSoft, ink: colors.waterInk };
    case 'supplements':
    case 'better':
      return { fill: colors.success, soft: colors.successSoft, ink: colors.successText };
    case 'streak':
      return { fill: colors.streak, soft: colors.streakSoft, ink: colors.streakInk };
    case 'worse':
      return { fill: colors.danger, soft: colors.dangerSoft, ink: colors.danger };
    default:
      return { fill: colors.text, soft: colors.surfaceAlt, ink: colors.text };
  }
}

/** A rounded square in an area's soft colour with its icon: tells at a glance what a card is about. */
export function IconTile({ icon, area, size = 40 }: { icon: IconName; area: Area; size?: number }) {
  const c = useAreaColors(area);
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        backgroundColor: c.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={Math.round(size / 2)} color={c.ink} />
    </View>
  );
}
