import { View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { useAreaColors, type Area } from './IconTile';

/**
 * A small pill: green when something got better, red when it got worse, neutral otherwise,
 * or an area's colour. The words always say it too (never colour alone).
 */
export function StatusChip({
  label,
  area = 'neutral',
  icon,
}: {
  label: string;
  area?: Area;
  icon?: IconName;
}) {
  const c = useAreaColors(area);
  const bg = c.soft;
  const ink = c.ink;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        minHeight: 26,
        paddingHorizontal: 9,
        borderRadius: 13,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {icon ? <Icon name={icon} size={13} color={ink} /> : null}
      <Text variant="label" semibold numeric style={{ color: ink }}>
        {label}
      </Text>
    </View>
  );
}
