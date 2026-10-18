import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './Text';

/** A small heading ("Sessions", "Other plans") over a block of rows: 13 semibold, muted. */
export function Section({
  title,
  children,
  gap = 6,
}: {
  title: string;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      <Text
        variant="bodyS"
        semibold
        muted
        accessibilityRole="header"
        style={{ paddingHorizontal: 2, paddingTop: 4 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
