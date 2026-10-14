import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { signInWithGoogle } from './google';
import { OfflineChoice } from './OfflineChoice';

/**
 * Sign in: with Google only (new and older accounts alike: an account made before with email and
 * password opens with the Google account of the same email). Or use the app without an account.
 */
export function AuthScreen() {
  const { t } = useTranslation();
  const barHeight = useActionBarHeight();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await signInWithGoogle();
      if (!r.ok && !r.cancelled) setError(r.message ?? t('auth.googleFailed'));
    } catch (e) {
      // No server configured or no connection: say so instead of spinning forever.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={20}>
        <View style={{ gap: 6, paddingTop: 24 }}>
          <Text variant="label" muted>
            {t('auth.kicker')}
          </Text>
          <Text variant="screenTitle">{t('auth.title')}</Text>
          <Text muted>{t('auth.tagline')}</Text>
        </View>

        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Text variant="bodyS" muted>
          {t('auth.legal')}
        </Text>

        <OfflineChoice />
      </Screen>

      <BottomActionBar>
        <Button
          label={busy ? t('auth.googleOpening') : t('auth.google')}
          size="large"
          disabled={busy}
          onPress={() => void google()}
        />
      </BottomActionBar>
    </>
  );
}
