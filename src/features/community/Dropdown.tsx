import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { tick } from '@/lib/haptics';

/**
 * A small dropdown for the community board (DECISIONS 117): a pill showing the current value and,
 * when open, a list of radio-like options right under the row of pills (in the page, not a sheet).
 * Kept here because there is no shared dropdown in components/ui yet.
 */
export function DropdownButton({
  value,
  icon,
  expanded,
  accessibilityLabel,
  onPress,
}: {
  value: string;
  icon?: IconName;
  expanded: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      aria-expanded={expanded}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingLeft: 14,
        paddingRight: 10,
        borderRadius: 22,
        borderWidth: expanded ? 2 : 1,
        borderColor: expanded ? colors.borderSelected : colors.borderControl,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={colors.text} /> : null}
      <Text variant="body" semibold style={{ fontSize: 14 }} numberOfLines={1}>
        {value}
      </Text>
      <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
        <Icon name="chevronDown" size={16} color={colors.text} />
      </View>
    </Pressable>
  );
}

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  detail?: string;
  /** A small tag on the right (e.g. "Supporter") for an option the plan does not include. */
  tag?: string;
  /** Read by screen readers instead of the label and detail. */
  accessibilityLabel?: string;
};

export function DropdownMenu<T extends string>({
  label,
  options,
  value,
  onSelect,
  footer,
}: {
  label: string;
  options: readonly DropdownOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={
                o.accessibilityLabel ?? (o.detail ? `${o.label}. ${o.detail}` : o.label)
              }
              onPress={() => {
                tick();
                onSelect(o.value);
              }}
              style={({ pressed }) => ({
                minHeight: 52,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.divider,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: on ? colors.borderSelected : colors.borderControl,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? (
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colors.dotOn,
                    }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text semibold={on} medium={!on}>
                  {o.label}
                </Text>
                {o.detail ? (
                  <Text variant="bodyS" muted>
                    {o.detail}
                  </Text>
                ) : null}
              </View>
              {o.tag ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    minHeight: 24,
                    paddingHorizontal: 8,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Icon name="star" size={12} color={colors.textMuted} />
                  <Text variant="label" semibold style={{ color: colors.textMuted }}>
                    {o.tag}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {footer}
    </Card>
  );
}
