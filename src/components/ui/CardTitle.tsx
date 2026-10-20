import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IconName } from './Icon';
import { IconTile, type Area } from './IconTile';
import { Text } from './Text';

/**
 * The header of a settings card, as in the canvas (Your data, Accessibility, AI coach…): a small
 * tile in the area's colour and the title in 15 semibold, so what a card is about reads before its
 * rows. `right` holds a small value or action on the same line.
 */
export function CardTitle({
  icon,
  title,
  area = 'neutral',
  right,
}: {
  icon: IconName;
  title: string;
  area?: Area;
  right?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
      <IconTile icon={icon} area={area} size={28} />
      <Text variant="body" semibold accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Text>
      {right}
    </View>
  );
}
