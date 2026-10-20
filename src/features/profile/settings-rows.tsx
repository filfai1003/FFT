import { type Href, useNavigation, useRouter } from 'expo-router';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Icon';
import type { Area } from '@/components/ui/IconTile';
import { Text } from '@/components/ui/Text';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { useTheme } from '@/design/use-theme';

export type ToggleRowItem = {
  name: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Optional tile in an area's colour (data categories: Diet, Training…). */
  icon?: IconName;
  area?: Area;
};

/**
 * Rows of a settings card: a name, a short help line and a switch, hairline between them. Each
 * row is a switch as a whole (`ToggleRow`, DECISIONS 115).
 */
export function ToggleRows({ items }: { items: ToggleRowItem[] }) {
  return items.map((r, i) => (
    <ToggleRow
      key={r.name}
      name={r.name}
      detail={r.detail}
      value={r.value}
      onValueChange={r.onChange}
      disabled={r.disabled}
      icon={r.icon}
      area={r.area}
      divider={i > 0}
    />
  ));
}

/** A settings row with a name, a short help line and a small button (Export, Withdraw…). */
export function ActionRow({
  name,
  detail,
  label,
  onPress,
  disabled,
  loading,
  divider,
}: {
  name: string;
  detail: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The action is running: a spinner in its button. */
  loading?: boolean;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderTopWidth: divider ? 1 : 0,
        borderColor: colors.borderDecorative,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{name}</Text>
        <Text variant="bodyS" muted>
          {detail}
        </Text>
      </View>
      <Button
        label={label}
        block={false}
        variant="secondary"
        disabled={disabled}
        loading={loading}
        onPress={onPress}
        accessibilityLabel={`${label}, ${name}`}
      />
    </View>
  );
}

/**
 * Opens a sibling settings page (Your data and Phone privacy, DECISIONS 102): back when it is the
 * page underneath, so the two do not pile up; otherwise pushed.
 */
export function useOpenSibling() {
  const router = useRouter();
  const navigation = useNavigation();
  return (routeName: string, href: Href) => {
    const routes = navigation.getState()?.routes ?? [];
    if (routes.length > 1 && routes[routes.length - 2].name === routeName) router.back();
    else router.push(href);
  };
}
