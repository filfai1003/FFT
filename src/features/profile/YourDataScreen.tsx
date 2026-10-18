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
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { useSessionStore } from '@/features/auth/session-store';
import { RelayCard } from '@/features/premium/RelayCard';
import { ServerCopyCard } from '@/features/premium/ServerCopy';
import { SyncCard } from '@/features/premium/SyncCard';
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
import { ActionRow, useOpenSibling } from './settings-rows';

/**
 * Your data (DECISIONS 102): everything that changes how your data is processed, where it goes
 * and who handles it. Consents, what the AI coach sees, the copy on the server (categories,
 * end-to-end encryption), syncing with another phone, the sync check, export and import,
 * policies and delete account last. What only changes this phone is on Phone privacy.
 */
export function YourDataScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const openSibling = useOpenSibling();
  const queryClient = useQueryClient();
  const consents = useConsents();
  const setConsent = useSetConsent();
  const showToast = useToastStore((s) => s.show);
  const userId = useSessionStore((st) => st.userId);
  const cloud = userId != null && getMode() === 'cloud';
  const [busy, setBusy] = useState<'full' | 'workouts' | 'import' | null>(null);
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

        {/* Keep a copy on the server (DECISIONS 62-64): accounts only. */}
        {cloud ? <ServerCopyCard /> : null}
        {/* Sync with another phone without a copy on the server (DECISIONS 65). */}
        {cloud ? <RelayCard /> : null}
        {userId ? <SyncCard userId={userId} /> : null}

        <Card size="small" gap={0}>
          <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
            {t('privacy.exportImport')}
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
          <ActionRow
            divider
            name={t('privacy.importTitle')}
            detail={t('privacy.importDetail')}
            label={t('privacy.import')}
            disabled={busy != null}
            onPress={() => void runImport()}
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

        {/* What only changes this phone: lock, screenshots, photos (DECISIONS 102). */}
        <Card size="small" gap={0}>
          <ListRow
            title={t('privacy.phonePrivacy')}
            info={t('privacy.phonePrivacyDetail')}
            divider={false}
            right={chevron}
            onPress={() => openSibling('phone-privacy', '/profile/phone-privacy')}
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
