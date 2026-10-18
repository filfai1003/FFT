import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';

export type ToggleRowItem = {
  name: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

/** Rows of a settings card: a name, a short help line and a switch, hairline between them. */
export function ToggleRows({ items }: { items: ToggleRowItem[] }) {
  const { colors } = useTheme();
  return items.map((r, i) => (
    <View
      key={r.name}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderTopWidth: i === 0 ? 0 : 1,
        borderColor: colors.borderDecorative,
        opacity: r.disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyS">{r.name}</Text>
        <Text variant="bodyS" muted>
          {r.detail}
        </Text>
      </View>
      <Toggle value={r.value} onValueChange={r.onChange} accessibilityLabel={r.name} />
    </View>
  ));
}

/** A settings row with a name, a short help line and a small button (Export, Withdraw…). */
export function ActionRow({
  name,
  detail,
  label,
  onPress,
  disabled,
  divider,
}: {
  name: string;
  detail: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
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
        <Text variant="bodyS">{name}</Text>
        <Text variant="bodyS" muted>
          {detail}
        </Text>
      </View>
      <Button
        label={label}
        block={false}
        variant="secondary"
        disabled={disabled}
        onPress={onPress}
        accessibilityLabel={`${label}, ${name}`}
      />
    </View>
  );
}
