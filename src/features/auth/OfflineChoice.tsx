import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { enterOfflineMode } from './session-store';

/**
 * "Use without an account": everything is saved on this device only, no sync. Not on the web: the
 * web app is the online version of premium accounts (kept in development, for the preview).
 */
export function OfflineChoice() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  if (Platform.OS === 'web' && !__DEV__) return null;
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
