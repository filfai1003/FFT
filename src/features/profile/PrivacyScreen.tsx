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
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { authenticate } from '@/lib/biometrics';
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
import { importExport, pickExportFile } from './import';
import { useSessionStore } from '@/features/auth/session-store';
import { RelayCard } from '@/features/premium/RelayCard';
import { ServerCopyCard } from '@/features/premium/ServerCopy';
import { SyncCard } from '@/features/premium/SyncCard';
import { usePrivacyStore } from './privacy-store';

/** Privacy & data: export, photo privacy, sharing, consent, delete account. */
export function PrivacyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const privacy = usePrivacyStore();
  const consents = useConsents();
  const setConsent = useSetConsent();
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState<'full' | 'workouts' | 'import' | null>(null);
  const userId = useSessionStore((st) => st.userId);
  const [withdraw, setWithdraw] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmed = typed.trim().toUpperCase() === t('privacy.deleteWord');
  // Keeping the data means going on without an account: phones only (the web app needs one).
  const canKeep = getMode() === 'cloud' && Platform.OS !== 'web';

  const health = activeConsent(consents.data, 'health_data');
  const grantedOn = health
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(health.grantedAt),
      )
    : '';

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

  /** An earlier export comes back: added to what is here, nothing is deleted. */
  const runImport = async () => {
    setError(null);
    const zip = await pickExportFile().catch(() => null);
    if (!zip || !userId) return;
    setBusy('import');
    try {
      const r = await importExport(zip, userId);
      await queryClient.invalidateQueries();
      showToast({ message: t('privacy.imported', { count: r.rows, photos: r.photos }) });
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'not an FFT export'
          ? t('privacy.notAnExport')
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(null);
    }
  };

  const toggleLock = async (value: boolean) => {
    if (value && !(await authenticate(t('photos.unlockToEnable')))) return;
    privacy.set('lockPhotos', value);
  };

  const rows = (
    items: {
      name: string;
      detail: string;
      value: boolean;
      onChange: (v: boolean) => void;
      disabled?: boolean;
    }[],
  ) =>
    items.map((r, i) => (
      <View
        key={r.name}
        style={{
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderTopWidth: i === 0 ? 0 : 1,
          borderColor: colors.borderDecorative,
          opacity: r.disabled ? 0.5 : 1,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyS">{r.name}</Text>
          <Text variant="label" muted>
            {r.detail}
          </Text>
        </View>
        <Toggle value={r.value} onValueChange={r.onChange} accessibilityLabel={r.name} />
      </View>
    ));

  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={14}>
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
        <Text variant="screenTitle" style={{ fontSize: 28 }}>
          {t('privacy.title')}
        </Text>

        <Card size="small" gap={0}>
          <Text variant="label" muted style={{ paddingBottom: 4 }}>
            {t('privacy.yourData')}
          </Text>
          <View
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyS">{t('privacy.downloadAll')}</Text>
              <Text variant="label" muted>
                {t('privacy.downloadAllDetail')}
              </Text>
            </View>
            <Button
              label={t('privacy.export')}
              block={false}
              variant="secondary"
              disabled={busy != null}
              onPress={() => runExport('full')}
            />
          </View>
          <View
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderTopWidth: 1,
              borderColor: colors.borderDecorative,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyS">{t('privacy.workoutsOnly')}</Text>
              <Text variant="label" muted>
                {t('privacy.workoutsOnlyDetail')}
              </Text>
            </View>
            <Button
              label={t('privacy.export')}
              block={false}
              variant="secondary"
              disabled={busy != null}
              onPress={() => runExport('workouts')}
            />
          </View>
          <View
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderTopWidth: 1,
              borderColor: colors.borderDecorative,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyS">{t('privacy.importTitle')}</Text>
              <Text variant="label" muted>
                {t('privacy.importDetail')}
              </Text>
            </View>
            <Button
              label={t('privacy.import')}
              block={false}
              variant="secondary"
              disabled={busy != null}
              onPress={() => void runImport()}
            />
          </View>
          {busy ? (
            <Text variant="label" muted>
              {t('privacy.preparing')}
            </Text>
          ) : null}
          {error ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </Card>

        {/* Keep a copy on the server (DECISIONS 62): accounts only. */}
        {userId && getMode() === 'cloud' ? <ServerCopyCard /> : null}
        {/* Sync with another phone without a copy on the server (DECISIONS 65). */}
        {userId && getMode() === 'cloud' ? <RelayCard /> : null}
        {userId ? <SyncCard userId={userId} /> : null}

        <Card size="small" gap={0}>
          <Text variant="label" muted style={{ paddingBottom: 4 }}>
            {t('privacy.photos')}
          </Text>
          {rows([
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
          ])}
        </Card>

        <Card size="small" gap={0}>
          <View
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyS">{t('privacy.consent')}</Text>
              <Text variant="label" muted>
                {health ? t('privacy.givenOn', { date: grantedOn }) : t('privacy.notGiven')}
              </Text>
            </View>
            <Button
              label={t('privacy.withdraw')}
              block={false}
              variant="secondary"
              disabled={!health}
              onPress={() => setWithdraw(true)}
            />
          </View>
        </Card>

        <Card size="small" gap={0}>
          <Text variant="label" muted style={{ paddingBottom: 4 }}>
            {t('legal.title')}
          </Text>
          {(['privacy', 'terms', 'deleteAccount'] as const).map((page, i) => (
            <ListRow
              key={page}
              title={t(`legal.${page}`)}
              divider={i > 0}
              right={<Icon name="chevronRight" size={18} color={colors.textMuted} />}
              onPress={() => openLegal(page)}
            />
          ))}
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
            <Text variant="label" muted>
              {t('privacy.deleteAllDetail')}
            </Text>
            <Text variant="bodyS" style={{ paddingTop: 6 }}>
              {t('privacy.deleteKeep')}
            </Text>
            <Text variant="label" muted>
              {t('privacy.deleteKeepDetail')}
            </Text>
          </View>
        ) : null}
        {deleting ? (
          <Text variant="label" muted accessibilityRole="alert">
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
