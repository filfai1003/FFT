import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

// Temporary specimen. Replaced by the component catalogue in step 0.15.
export default function Index() {
  const { t } = useTranslation();
  return (
    <Screen scroll>
      <Text variant="label" muted>
        {t('today.caloriesLeft')}
      </Text>
      <Text variant="displayL">{t('today.title')}</Text>
      <Card>
        <Text variant="label" muted>
          {t('today.caloriesLeft')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text variant="displayXL" numeric>
            {1360}
          </Text>
          <Text variant="label" muted>
            {`/ 2350 ${t('common.kcal')}`}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
