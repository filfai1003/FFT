import { Pressable, View } from 'react-native';
import { radius, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type MenuItem = {
  icon: IconName;
  label: string;
  /** One muted line under the label ("Connect AI apps and your own tools"). */
  help?: string;
  /** Current value on the right ("kg · cm", "Light"). */
  value?: string;
  onPress: () => void;
};

/**
 * A card of navigation rows (Profile, Settings), as in the canvas: icon in a soft tile, label (and
 * an optional help line), value, chevron. Rows are 56 high with a hairline divider between them;
 * `title` puts a small heading over the card ("Account", "Data").
 */
export function MenuList({ items, title }: { items: readonly MenuItem[]; title?: string }) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  const card = (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
      }}
    >
      {items.map((r, j) => (
        <Pressable
          key={r.label}
          accessibilityRole="button"
          accessibilityLabel={[r.label, r.value, r.help].filter(Boolean).join(', ')}
          onPress={() => {
            tick();
            r.onPress();
          }}
          style={({ pressed }) => ({
            minHeight: Math.max(56, touch.listRowMin),
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 6,
            borderTopWidth: j === 0 ? 0 : 1,
            borderColor: colors.divider,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.tile,
              backgroundColor: colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={r.icon} size={18} color={colors.text} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text medium>{r.label}</Text>
            {r.help ? (
              <Text variant="bodyS" muted>
                {r.help}
              </Text>
            ) : null}
          </View>
          {r.value ? (
            <Text
              variant="bodyS"
              muted
              numberOfLines={1}
              style={{ flexShrink: 1, maxWidth: '45%', textAlign: 'right' }}
            >
              {r.value}
            </Text>
          ) : null}
          <Icon name="chevronRight" size={18} color={colors.textPlaceholderIcon} />
        </Pressable>
      ))}
    </View>
  );
  if (!title) return card;
  return (
    <View style={{ gap: 6 }}>
      <SectionLabel>{title}</SectionLabel>
      {card}
    </View>
  );
}

/** The small heading over a group of rows: 13 semibold, muted, sentence case. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      variant="bodyS"
      muted
      semibold
      accessibilityRole="header"
      style={{ paddingHorizontal: 2 }}
    >
      {children}
    </Text>
  );
}
