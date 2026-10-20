import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { authenticate, canAuthenticate, unlockApp } from '@/lib/biometrics';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { LOCK_AFTER_OPTIONS, type LockAfter, usePrivacyStore } from './privacy-store';
import { ToggleRows, useOpenSibling } from './settings-rows';

/**
 * Phone privacy (DECISIONS 102): settings that change only how the app behaves on this phone,
 * never what happens to the data. App lock with its timeout, screenshots, photo blur and lock.
 * Everything that moves or processes data is on Your data (`/profile/data`).
 */
export function PhonePrivacyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const openSibling = useOpenSibling();
  const privacy = usePrivacyStore();
  const showToast = useToastStore((s) => s.show);

  const toggleLock = async (value: boolean) => {
    if (value && !(await authenticate(t('photos.unlockToEnable')))) return;
    privacy.set('lockPhotos', value);
  };

  /** App lock (DECISIONS 95): only with a lock on the phone, and after passing it once. */
  const toggleAppLock = async (value: boolean) => {
    if (!value) {
      privacy.set('appLock', false);
      return;
    }
    if (!(await canAuthenticate())) {
      showToast({ message: t('privacy.appLockUnavailable') });
      return;
    }
    if ((await unlockApp(t('appLock.reason'))) === 'passed') privacy.set('appLock', true);
  };

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/profile/settings')} backLabel={t('common.back')} />
      <Text variant="screenTitle" accessibilityRole="header" style={{ fontSize: 28 }}>
        {t('phonePrivacy.title')}
      </Text>
      <Text variant="bodyS" muted>
        {t('phonePrivacy.intro')}
      </Text>

      {/* Lock and screen protection of this phone (DECISIONS 95): phones only. */}
      {Platform.OS !== 'web' ? (
        <Card size="small" gap={0}>
          <CardTitle icon="lock" title={t('phonePrivacy.lock')} />
          <ToggleRows
            items={[
              {
                name: t('privacy.appLock'),
                detail: t('privacy.appLockDetail'),
                value: privacy.appLock,
                onChange: (v) => void toggleAppLock(v),
              },
            ]}
          />
          {privacy.appLock ? (
            <View style={{ gap: 8, paddingVertical: 10 }}>
              <Text variant="bodyS">{t('privacy.lockAfter')}</Text>
              <Segmented
                options={LOCK_AFTER_OPTIONS.map((m) => ({
                  value: String(m),
                  label: t('privacy.lockAfterMin', { count: m }),
                }))}
                value={String(privacy.lockAfterMin)}
                onChange={(v) => privacy.set('lockAfterMin', Number(v) as LockAfter)}
                accessibilityLabel={t('privacy.lockAfter')}
              />
            </View>
          ) : null}
          <View style={{ borderTopWidth: 1, borderColor: colors.borderDecorative }}>
            <ToggleRows
              items={[
                {
                  name: t('privacy.protectPhotos'),
                  detail: t('privacy.protectPhotosDetail'),
                  value: privacy.protectPhotos,
                  onChange: (v) => privacy.set('protectPhotos', v),
                },
                {
                  name: t('privacy.hideContent'),
                  detail: t('privacy.hideContentDetail'),
                  value: privacy.hideContent,
                  onChange: (v) => privacy.set('hideContent', v),
                },
              ]}
            />
          </View>
        </Card>
      ) : null}

      <Card size="small" gap={0}>
        <CardTitle icon="camera" title={t('privacy.photos')} />
        <ToggleRows
          items={[
            {
              name: t('privacy.blur'),
              detail: t('privacy.blurDetail'),
              value: privacy.blurPhotos,
              onChange: (v) => privacy.set('blurPhotos', v),
            },
            {
              name: t('privacy.lock'),
              detail: t('privacy.lockDetail'),
              value: privacy.lockPhotos,
              onChange: toggleLock,
            },
          ]}
        />
      </Card>

      {/* What the phone's own lock does for the data kept here (DECISIONS 95). */}
      <Card size="small" gap={4}>
        <Text variant="bodyS">{t('phonePrivacy.onPhone')}</Text>
        <Text variant="bodyS" muted>
          {t('privacy.localNote')}
        </Text>
      </Card>

      <Card size="small" gap={0}>
        <ListRow
          title={t('phonePrivacy.yourData')}
          info={t('phonePrivacy.yourDataDetail')}
          divider={false}
          right={<Icon name="chevronRight" size={18} color={colors.textMuted} />}
          onPress={() => openSibling('data', '/profile/data')}
        />
      </Card>
    </Screen>
  );
}
