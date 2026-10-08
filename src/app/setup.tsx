import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

/** Shown when the Supabase URL / key are missing (no .env.local). */
export default function Setup() {
  const { t } = useTranslation();
  return (
    <Screen scroll gap={12}>
      <Text variant="screenTitle">{t('app.setupTitle')}</Text>
      <Text muted>{t('app.setupBody')}</Text>
    </Screen>
  );
}
