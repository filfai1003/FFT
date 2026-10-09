import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { enterOfflineMode } from './session-store';

/** "Use without an account": everything is saved on this device only, no sync. */
export function OfflineChoice() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (
    <View style={{ gap: 10, paddingTop: 8 }}>
      <Text variant="bodyS" muted>
        {t('auth.offlineBody')}
      </Text>
      <Button
        label={t('auth.useOffline')}
        variant="secondary"
        onPress={() => void enterOfflineMode(queryClient)}
      />
    </View>
  );
}
