import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { authenticate, canAuthenticate, unlockApp } from '@/lib/biometrics';
import { openLegal } from '@/lib/legal';
import { getMode } from '@/lib/mode';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import {
  activeConsent,
  deleteAccount,
  deleteAccountKeepData,
  useConsents,
  useSetConsent,
} from './account';
import { deliverFile, exportFileNames, fullExportZip, workoutsCsv } from './export';
import { LOCK_AFTER_OPTIONS, type LockAfter, usePrivacyStore } from './privacy-store';
import { ActionRow, ToggleRows } from './settings-rows';

/**
 * Privacy (DECISIONS 101): the everyday settings in plain words. App lock, screenshots, photos,
 * what the AI coach sees, consents, export, policies and delete account. The technical part
 * (server copy, encryption, other phones, import) is on Data & sync (`/profile/data`).
 */
export function PrivacyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const privacy = usePrivacyStore();
  const consents = useConsents();
  const setConsent = useSetConsent();
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState<'full' | 'workouts' | null>(null);
  const [withdraw, setWithdraw] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmed = typed.trim().toUpperCase() === t('privacy.deleteWord');
  // Keeping the data means going on without an account: phones only (the web app needs one).
  const canKeep = getMode() === 'cloud' && Platform.OS !== 'web';
  const chevron = <Icon name="chevronRight" size={18} color={colors.textMuted} />;

  const health = activeConsent(consents.data, 'health_data');
  const aiConsent = activeConsent(consents.data, 'ai_coach');
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(iso),
    );

  const runExport = async (kind: 'full' | 'workouts') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'full')
        await deliverFile(exportFileNames.full(), await fullExportZip(), 'application/zip');
      else
        await deliverFile(
          exportFileNames.workouts(),
          new TextEncoder().encode(await workoutsCsv()),
          'text/csv',
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

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
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar onBack={() => goBack(router, '/profile/settings')} backLabel={t('common.back')} />
        <Text variant="screenTitle" accessibilityRole="header" style={{ fontSize: 28 }}>
          {t('privacy.title')}
        </Text>
        <Text variant="bodyS" muted>
          {t('privacy.intro')}
        </Text>

        {/* Lock and screen protection of this phone (DECISIONS 95). */}
        {Platform.OS !== 'web' ? (
          <Card size="small" gap={0}>
            <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
              {t('privacy.device')}
            </Text>
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
          <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
            {t('privacy.photos')}
          </Text>
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

        {/* What the coach may read lives with the coach settings (DECISIONS 66). */}
        <Card size="small" gap={0}>
          <ListRow
            title={t('privacy.aiSees')}
            info={t('privacy.aiSeesDetail')}
            divider={false}
            right={chevron}
            onPress={() => router.push('/profile/ai')}
          />
        </Card>

        <Card size="small" gap={0}>
          <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
            {t('privacy.consents')}
          </Text>
          <ActionRow
            name={t('privacy.consent')}
            detail={
              health
                ? t('privacy.givenOn', { date: dateOf(health.grantedAt) })
                : t('privacy.notGiven')
            }
            label={t('privacy.withdraw')}
            disabled={!health}
            onPress={() => setWithdraw(true)}
          />
          {/* AI coach consent (DECISIONS 66): withdrawn, the coach asks again on next use. */}
          <ActionRow
            divider
            name={t('privacy.aiConsent')}
            detail={
              aiConsent
                ? t('privacy.givenOn', { date: dateOf(aiConsent.grantedAt) })
                : t('privacy.notGiven')
            }
            label={t('privacy.withdraw')}
            disabled={!aiConsent || setConsent.isPending}
            onPress={async () => {
              await setConsent.mutateAsync({ type: 'ai_coach', granted: false });
              showToast({
                message: t('privacy.aiWithdrawn'),
                actionLabel: t('common.undo'),
                onAction: () => setConsent.mutate({ type: 'ai_coach', granted: true }),
              });
            }}
          />
        </Card>

        <Card size="small" gap={0}>
          <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
            {t('privacy.yourData')}
          </Text>
          <ActionRow
            name={t('privacy.downloadAll')}
            detail={t('privacy.downloadAllDetail')}
            label={t('privacy.export')}
            disabled={busy != null}
            onPress={() => void runExport('full')}
          />
          <ActionRow
            divider
            name={t('privacy.workoutsOnly')}
            detail={t('privacy.workoutsOnlyDetail')}
            label={t('privacy.export')}
            disabled={busy != null}
            onPress={() => void runExport('workouts')}
          />
          {busy ? (
            <Text variant="bodyS" muted>
              {t('privacy.preparing')}
            </Text>
          ) : null}
          {error ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </Card>

        <Card size="small" gap={0}>
          <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
            {t('legal.title')}
          </Text>
          {(['privacy', 'terms', 'deleteAccount'] as const).map((page, i) => (
            <ListRow
              key={page}
              title={t(`legal.${page}`)}
              divider={i > 0}
              right={chevron}
              onPress={() => openLegal(page)}
            />
          ))}
        </Card>

        {/* The technical part: copy on the server, encryption, other phones (DECISIONS 101). */}
        <Card size="small" gap={0}>
          <ListRow
            title={t('privacy.technical')}
            info={t('privacy.technicalDetail')}
            divider={false}
            right={chevron}
            onPress={() => router.push('/profile/data')}
          />
        </Card>

        <View style={{ gap: 8, paddingTop: 8 }}>
          <Button label={t('privacy.delete')} variant="danger" onPress={() => setRemoving(true)} />
          <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
            {canKeep ? t('privacy.deleteNoteKeep') : t('privacy.deleteNote')}
          </Text>
        </View>
      </Screen>

      <Sheet
        visible={withdraw}
        onClose={() => setWithdraw(false)}
        title={t('privacy.withdrawTitle')}
        closeLabel={t('common.close')}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              size="large"
              variant="danger"
              label={t('privacy.withdrawConfirm')}
              onPress={async () => {
                await setConsent.mutateAsync({ type: 'health_data', granted: false });
                setWithdraw(false);
              }}
            />
            <Button
              variant="secondary"
              label={t('privacy.keepConsent')}
              onPress={() => setWithdraw(false)}
            />
          </View>
        }
      >
        <Text muted>{t('privacy.withdrawBody')}</Text>
      </Sheet>

      <Sheet
        visible={removing}
        onClose={() => {
          setRemoving(false);
          setTyped('');
        }}
        title={t('privacy.deleteTitle')}
        closeLabel={t('common.close')}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              size="large"
              variant="danger"
              label={t('privacy.deleteConfirm')}
              disabled={!confirmed || deleting}
              onPress={async () => {
                setDeleting(true);
                const message = await deleteAccount(queryClient);
                setDeleting(false);
                if (message) setError(message);
                else showToast({ message: t('privacy.deleted') });
                setRemoving(false);
              }}
            />
            {canKeep ? (
              <Button
                size="large"
                variant="secondary"
                label={t('privacy.deleteKeep')}
                disabled={!confirmed || deleting}
                onPress={async () => {
                  setDeleting(true);
                  const r = await deleteAccountKeepData(queryClient);
                  setDeleting(false);
                  setRemoving(false);
                  if (r.ok) {
                    router.replace('/');
                    showToast({
                      message:
                        r.missingFiles > 0
                          ? t('privacy.deletedKeptMissing', { count: r.missingFiles })
                          : t('privacy.deletedKept'),
                    });
                  } else
                    setError(
                      r.reason === 'not-empty'
                        ? t('privacy.keepNotEmpty')
                        : (r.message ?? t('privacy.keepFailed')),
                    );
                }}
              />
            ) : null}
          </View>
        }
      >
        <Text muted>{canKeep ? t('privacy.deleteChoiceBody') : t('privacy.deleteBody')}</Text>
        {canKeep ? (
          <View style={{ gap: 6 }}>
            <Text variant="bodyS">{t('privacy.deleteAllTitle')}</Text>
            <Text variant="bodyS" muted>
              {t('privacy.deleteAllDetail')}
            </Text>
            <Text variant="bodyS" style={{ paddingTop: 6 }}>
              {t('privacy.deleteKeep')}
            </Text>
            <Text variant="bodyS" muted>
              {t('privacy.deleteKeepDetail')}
            </Text>
          </View>
        ) : null}
        {deleting ? (
          <Text variant="bodyS" muted accessibilityRole="alert">
            {t('privacy.deleting')}
          </Text>
        ) : null}
        <Input
          label={t('privacy.typeToConfirm', { word: t('privacy.deleteWord') })}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
        />
      </Sheet>
    </>
  );
}
