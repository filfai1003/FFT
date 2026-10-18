import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { howToFor } from './how-to';

/** "How to perform": numbered steps and what to avoid. Nothing for the user's own exercises. */
export function HowToCard({ exerciseId }: { exerciseId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const h = howToFor(exerciseId);
  if (!h) return null;
  return (
    <Card size="small" gap={10}>
      <Text variant="bodyS" muted accessibilityRole="header">
        {t('exerciseDetail.howTo')}
      </Text>
      {h.steps.map((step, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: colors.borderControl,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="label" numeric>
              {String(i + 1)}
            </Text>
          </View>
          <Text variant="bodyS" style={{ flex: 1 }}>
            {step}
          </Text>
        </View>
      ))}
      <View style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderColor: colors.divider }}>
        <Text variant="bodyS" muted>
          {t('exerciseDetail.avoid')}
        </Text>
        {h.mistakes.map((m, i) => (
          <Text key={i} variant="bodyS">
            {`× ${m}`}
          </Text>
        ))}
      </View>
    </Card>
  );
}
