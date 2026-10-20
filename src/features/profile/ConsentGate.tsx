import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { openLegal } from '@/lib/legal';
import { deleteAccount, logOutAnyway, useSetConsent } from './account';
import { deliverFile, exportFileNames, fullExportZip } from './export';

/**
 * Shown when the health-data consent has been withdrawn: the app cannot work without it. The
 * user can give it again, take their data out, delete the account or log out.
 *
 * `reconfirm`: the consent in force was given for an older policy text (DECISIONS 99). Asked once:
 * "I agree, continue" records the consent for the current version and opens the app. It can never
 * keep anyone out: if recording fails, the app opens anyway (`onContinue`) and asks again next time.
 */
export function ConsentGate({
  reconfirm = false,
  onContinue,
}: {
  reconfirm?: boolean;
  onContinue?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setConsent = useSetConsent();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const agree = () => {
    if (!reconfirm) {
      setConsent.mutate({ type: 'health_data', granted: true });
      return;
    }
    setConsent.mutate(
      { type: 'health_data', granted: true },
      { onSuccess: () => onContinue?.(), onError: () => onContinue?.() },
    );
  };

  return (
    <Screen scroll gap={16}>
      <View style={{ gap: 8, paddingTop: 24 }}>
        <Text variant="screenTitle" accessibilityRole="header">
          {reconfirm ? t('gate.updatedTitle') : t('gate.title')}
        </Text>
        <Text muted>{reconfirm ? t('gate.updatedBody') : t('gate.body')}</Text>
        {reconfirm ? <Text>{t('onboarding.consent.body')}</Text> : null}
      </View>
      <Button
        size="large"
        label={reconfirm ? t('gate.agree') : t('gate.give')}
        disabled={setConsent.isPending}
        onPress={agree}
      />
      {reconfirm ? (
        <Button
          variant="secondary"
          label={t('legal.privacy')}
          onPress={() => openLegal('privacy')}
        />
      ) : null}
      <Button
        variant="secondary"
        label={t('privacy.downloadAll')}
        loading={busy}
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
