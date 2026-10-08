import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { deleteAccount, logOutAnyway, useSetConsent } from './account';
import { deliverFile, exportFileNames, fullExportZip } from './export';

/**
 * Shown when the health-data consent has been withdrawn: the app cannot work without it. The
 * user can give it again, take their data out, delete the account or log out.
 */
export function ConsentGate() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setConsent = useSetConsent();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen scroll gap={16}>
      <View style={{ gap: 8, paddingTop: 24 }}>
        <Text variant="screenTitle">{t('gate.title')}</Text>
        <Text muted>{t('gate.body')}</Text>
      </View>
      <Button
        size="large"
        label={t('gate.give')}
        disabled={setConsent.isPending}
        onPress={() => setConsent.mutate({ type: 'health_data', granted: true })}
      />
      <Button
        variant="secondary"
        label={t('privacy.downloadAll')}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await deliverFile(exportFileNames.full(), await fullExportZip(), 'application/zip');
          } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
          }
          setBusy(false);
        }}
      />
      <Button
        variant="danger"
        label={t('privacy.delete')}
        onPress={async () => setMessage(await deleteAccount(queryClient))}
      />
      <Button
        variant="ghost"
        label={t('profile.logOut')}
        onPress={() => void logOutAnyway(queryClient)}
      />
      {message ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}
