import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { linkAccount } from './link-account';

/** Account-less mode -> an account, with Google: every piece of data on this phone comes along. */
export function LinkAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const barHeight = useActionBarHeight();
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The web page leaves for Google and reloads: the move is done in the phone app.
  const web = Platform.OS === 'web';

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await linkAccount(queryClient);
      if (result.ok) showToast({ message: t('link.done') });
      else if (!result.cancelled) setError(result.message ?? t('link.failed'));
    } catch {
      setError(t('link.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
        <Text variant="screenTitle">{t('link.title')}</Text>
        {web ? <Text muted>{t('link.phoneOnly')}</Text> : null}
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={busy ? t('link.working') : t('auth.google')}
          disabled={busy || web}
          onPress={() => void submit()}
        />
      </BottomActionBar>
    </>
  );
}
