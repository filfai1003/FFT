import type { ReactNode } from 'react';
import { View } from 'react-native';
import { InfoButton, type ExplainTopic } from './InfoButton';
import { Text } from './Text';

/**
 * A small heading ("Sessions", "Other plans") over a block of rows: 13 semibold, muted. `info`
 * adds a "What's this?" button after the heading (DECISIONS 124).
 */
export function Section({
  title,
  children,
  gap = 6,
  info,
}: {
  title: string;
  children: ReactNode;
  gap?: number;
  info?: ExplainTopic;
}) {
  const heading = (
    <Text
      variant="bodyS"
      semibold
      muted
      accessibilityRole="header"
      style={{ paddingHorizontal: 2, paddingTop: 4 }}
    >
      {title}
    </Text>
  );
  return (
    <View style={{ gap }}>
      {info ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {heading}
          <InfoButton topic={info} />
        </View>
      ) : (
        heading
      )}
      {children}
    </View>
  );
}
