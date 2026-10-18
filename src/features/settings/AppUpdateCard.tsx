import Constants from 'expo-constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { appUpdateInfo, checkForAppUpdate, restartApp } from '@/lib/app-update';

/**
 * Which version of the app runs, and a way to look for a newer one without waiting for the next
 * start. One row as in the canvas Settings: icon tile, version and state, a small Check button.
 */
export function AppUpdateCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
    <Card gap={10} style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.tile,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="info" size={18} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text medium>
            {t('settings.app.version', { version: Constants.expoConfig?.version ?? '' })}
          </Text>
          {state === 'none' ? (
            <Text variant="bodyS" semibold style={{ color: colors.successText }}>
              {t('settings.app.upToDate')}
            </Text>
          ) : state === 'error' ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {t('settings.app.error')}
            </Text>
          ) : (
            <Text variant="bodyS" muted>
              {info.enabled
                ? `${running} · ${t('settings.app.runtime', { runtime: (info.runtime ?? '').slice(0, 8), channel: info.channel ?? '' })}`
                : t('settings.app.noUpdates')}
            </Text>
          )}
        </View>
        {info.enabled && state !== 'ready' ? (
          <Button
            variant="secondary"
            block={false}
            label={state === 'checking' ? t('settings.app.checking') : t('settings.app.check')}
            disabled={state === 'checking'}
            onPress={() => void check()}
            style={{ height: 44, paddingHorizontal: 14, borderRadius: 22 }}
          />
        ) : null}
      </View>
      {info.enabled && state === 'ready' ? (
        <Button label={t('settings.app.restart')} onPress={() => void restartApp()} />
      ) : null}
    </Card>
  );
}
