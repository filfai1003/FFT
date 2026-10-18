import { View } from 'react-native';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { Button, type ButtonVariant } from './Button';
import type { IconName } from './Icon';
import { IconTile, type Area } from './IconTile';
import { Text } from './Text';

export type EmptyStateAction = { label: string; onPress: () => void; icon?: IconName };

export type EmptyStateProps = {
  icon: IconName;
  /** The area's colour for the tile (DECISIONS 107): training, nutrition, streak… */
  area?: Area;
  /** Short, sentence case: "No plan yet". */
  title: string;
  /** One encouraging line: what to do and what it brings. */
  body?: string;
  action?: EmptyStateAction;
  /**
   * `primary` (accent) only when this is the main action of the screen: one accent per screen.
   * Default `secondary`.
   */
  actionVariant?: Extract<ButtonVariant, 'primary' | 'secondary'>;
  /** A second, quieter way out (plain text button). */
  secondaryAction?: EmptyStateAction;
  /** Drawn as a card (default). `false` = only the content, inside a card the screen already has. */
  card?: boolean;
  /** Smaller tile and title, for a section of a page rather than a whole page. */
  compact?: boolean;
};

/**
 * What a list or page shows when there is nothing yet (DECISIONS 109): a big tile in the area's
 * colour, a short title, one encouraging line and, when there is one, the way to fill it.
 */
export function EmptyState({
  icon,
  area = 'neutral',
  title,
  body,
  action,
  actionVariant = 'secondary',
  secondaryAction,
  card = true,
  compact = false,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const content = (
    <View style={{ alignItems: 'center', gap: compact ? 6 : 8 }}>
      <View style={{ marginBottom: compact ? 4 : 6 }}>
        <IconTile icon={icon} area={area} size={compact ? 48 : 64} />
      </View>
      <Text
        variant={compact ? 'body' : 'titleM'}
        semibold
        accessibilityRole="header"
        style={{ textAlign: 'center' }}
      >
        {title}
      </Text>
      {body ? (
        <Text variant="bodyS" muted style={{ textAlign: 'center', maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action || secondaryAction ? (
        <View style={{ alignSelf: 'stretch', gap: 4, marginTop: compact ? 6 : 10 }}>
          {action ? (
            <Button
              label={action.label}
              icon={action.icon}
              variant={actionVariant}
              onPress={action.onPress}
            />
          ) : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              icon={secondaryAction.icon}
              variant="ghost"
              onPress={secondaryAction.onPress}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!card) return content;
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        borderRadius: radius.card,
        paddingHorizontal: 20,
        paddingVertical: compact ? 20 : 28,
      }}
    >
      {content}
    </View>
  );
}
