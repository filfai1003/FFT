import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Icon';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Text } from '@/components/ui/Text';
import type { WidgetSize } from './layout-store';

/** Header tile size: the same on every Today card, full or half width. */
const HEAD_TILE = 32;

/**
 * A widget box: a full-width card, or a small tile that shares the row with another. Every card
 * has the same header: its area's icon tile and its title (colour code, DECISIONS 107).
 */
export function Frame({
  size,
  label,
  icon,
  area,
  right,
  onPress,
  pressLabel,
  children,
}: {
  size: WidgetSize;
  label: string;
  icon: IconName;
  area: Area;
  right?: ReactNode;
  onPress?: () => void;
  /** What a tap on the card does, when it differs from its title ("Log your weight"). */
  pressLabel?: string;
  children: ReactNode;
}) {
  const title = (
    <Text semibold accessibilityRole="header" numberOfLines={2} style={{ flex: 1 }}>
      {label}
    </Text>
  );
  // Half width: the title goes under the tile, so a long word ("Supplements") never splits.
  const head =
    size === 'large' ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <IconTile icon={icon} area={area} size={HEAD_TILE} />
        {title}
        {right}
      </View>
    ) : (
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 36,
          }}
        >
          <IconTile icon={icon} area={area} size={HEAD_TILE} />
          {right}
        </View>
        {title}
      </View>
    );
  if (size === 'large') {
    return (
      <Card
        gap={12}
        style={{ flexGrow: 1, padding: 16 }}
        onPress={onPress}
        accessibilityLabel={onPress ? (pressLabel ?? label) : undefined}
      >
        {head}
        {children}
      </Card>
    );
  }
  return (
    <Card
      size="small"
      gap={12}
      style={{ flexGrow: 1, padding: 16 }}
      onPress={onPress}
      accessibilityLabel={onPress ? (pressLabel ?? label) : undefined}
    >
      {head}
      {children}
    </Card>
  );
}

/**
 * The number of a small Home card, in the calories' style (big, semibold, tabular digits), with
 * its unit beside it in muted text.
 */
export function BigNumber({ value, unit }: { value: string; unit?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
      <Text variant="displayM" numeric>
        {value}
      </Text>
      {unit ? (
        <Text variant="bodyS" muted>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}
