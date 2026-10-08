import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './Text';

/** A small mono heading ("SESSIONS", "OTHER PLANS") over a block of rows. */
export function Section({
  title,
  children,
  gap = 0,
}: {
  title: string;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      <Text variant="label" muted accessibilityRole="header" style={{ paddingVertical: 6 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
