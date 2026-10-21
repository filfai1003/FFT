import { View } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

/**
 * A one-time "how this page works" card (DECISIONS 124): a title, 2–3 short bullets and a
 * "Got it" that hides it for good (the caller remembers that, e.g. with the hints store).
 */
export function HintCard({
  title,
  bullets,
  doneLabel,
  onDismiss,
}: {
  title: string;
  bullets: readonly string[];
  doneLabel: string;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card gap={10} style={{ padding: 14 }}>
      <Text semibold accessibilityRole="header">
        {title}
      </Text>
      {bullets.map((b) => (
        <View key={b} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              marginTop: 8,
              backgroundColor: colors.text,
            }}
          />
          <Text variant="bodyS" style={{ flex: 1 }}>
            {b}
          </Text>
        </View>
      ))}
      <Button
        label={doneLabel}
        variant="secondary"
        size="small"
        block={false}
        onPress={onDismiss}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  );
}
