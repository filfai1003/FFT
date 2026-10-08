import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { color } from '@/design/tokens';

// Temporary type specimen. Replaced by the component catalogue in step 0.15.
export default function Index() {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
    >
      <Text variant="label" muted>
        {t('today.caloriesLeft')}
      </Text>
      <Text variant="displayL">{t('today.title')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text variant="displayXL" numeric>
          {1360}
        </Text>
        <Text variant="label" muted>
          {`/ 2350 ${t('common.kcal')}`}
        </Text>
      </View>
    </ScrollView>
  );
}
