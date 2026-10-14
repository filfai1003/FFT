import { Linking, Text as RNText, View } from 'react-native';
import { fontFamily } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { parseMarkdown, type Inline } from '@/lib/markdown';
import { Text } from './Text';

/**
 * Text written in Markdown (the AI coach's replies), drawn with the app's own type: bold, italic,
 * code, headings, lists, quotes, code blocks, tables and links. Selectable, like plain text.
 */
export function Markdown({ text }: { text: string }) {
  const { colors } = useTheme();
  const blocks = parseMarkdown(text);

  const inline = (items: Inline[]) =>
    items.map((i, n) => (
      <RNText
        key={n}
        onPress={i.href ? () => void Linking.openURL(i.href!) : undefined}
        style={[
          i.bold ? { fontFamily: fontFamily.bodyBold } : null,
          i.italic ? { fontStyle: 'italic' as const } : null,
          i.code ? { backgroundColor: colors.surfaceAlt } : null,
          i.href ? { textDecorationLine: 'underline' as const } : null,
        ]}
      >
        {i.code ? ` ${i.text} ` : i.text}
      </RNText>
    ));

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, n) => {
        switch (b.kind) {
          case 'heading':
            return (
              <Text key={n} selectable variant={b.level === 1 ? 'titleM' : 'body'} medium>
                {inline(b.inlines)}
              </Text>
            );
          case 'item':
            return (
              <View key={n} style={{ flexDirection: 'row', gap: 8, paddingLeft: b.depth * 16 }}>
                <Text numeric={b.ordered} muted>
                  {b.marker}
                </Text>
                <Text selectable style={{ flex: 1 }}>
                  {inline(b.inlines)}
                </Text>
              </View>
            );
          case 'quote':
            return (
              <View
                key={n}
                style={{
                  borderLeftWidth: 3,
                  borderColor: colors.borderDecorative,
                  paddingLeft: 10,
                }}
              >
                <Text selectable muted>
                  {inline(b.inlines)}
                </Text>
              </View>
            );
          case 'code':
            return (
              <View
                key={n}
                style={{ backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 }}
              >
                <Text selectable variant="bodyS">
                  {b.text}
                </Text>
              </View>
            );
          case 'rule':
            return <View key={n} style={{ height: 1, backgroundColor: colors.divider }} />;
          case 'table':
            return (
              <View
                key={n}
                style={{ borderWidth: 1, borderColor: colors.borderDecorative, borderRadius: 10 }}
              >
                {[b.header, ...b.rows].map((row, r) => (
                  <View
                    key={r}
                    style={{
                      flexDirection: 'row',
                      borderTopWidth: r === 0 ? 0 : 1,
                      borderColor: colors.borderDecorative,
                    }}
                  >
                    {row.map((cell, c) => (
                      <Text
                        key={c}
                        selectable
                        variant="bodyS"
                        numeric
                        medium={r === 0}
                        style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 }}
                      >
                        {inline(cell)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          default:
            return (
              <Text key={n} selectable>
                {inline(b.inlines)}
              </Text>
            );
        }
      })}
    </View>
  );
}
