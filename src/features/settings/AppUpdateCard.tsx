import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { appUpdateInfo, checkForAppUpdate, restartApp } from '@/lib/app-update';

/** Which version of the app runs, and a way to look for a newer one without waiting for the next start. */
export function AppUpdateCard() {
  const { t } = useTranslation();
  const info = appUpdateInfo();
  const [state, setState] = useState<'idle' | 'checking' | 'none' | 'ready' | 'error'>('idle');

  const check = async () => {
    setState('checking');
    setState(await checkForAppUpdate());
  };

  const running = info.embedded
    ? t('settings.app.builtIn')
    : t('settings.app.update', {
        id: (info.updateId ?? '').slice(0, 8),
        date: info.createdAt ? info.createdAt.toLocaleString() : '',
      });

  return (
    <Card gap={10}>
      <Text variant="label" muted>
        {t('settings.app.title')}
      </Text>
      <View style={{ gap: 4 }}>
        <Text variant="bodyS">
          {t('settings.app.version', { version: Constants.expoConfig?.version ?? '' })}
        </Text>
        <Text variant="label" muted>
          {info.enabled
            ? `${running} · ${t('settings.app.runtime', { runtime: (info.runtime ?? '').slice(0, 8), channel: info.channel ?? '' })}`
            : t('settings.app.noUpdates')}
        </Text>
      </View>
      {info.enabled ? (
        state === 'ready' ? (
          <Button label={t('settings.app.restart')} onPress={() => void restartApp()} />
        ) : (
          <Button
            variant="secondary"
            label={state === 'checking' ? t('settings.app.checking') : t('settings.app.check')}
            disabled={state === 'checking'}
            onPress={() => void check()}
          />
        )
      ) : null}
      {state === 'none' ? (
        <Text variant="bodyS" muted>
          {t('settings.app.upToDate')}
        </Text>
      ) : null}
      {state === 'error' ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('settings.app.error')}
        </Text>
      ) : null}
    </Card>
  );
}
