import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { useSessionStore } from '@/features/auth/session-store';
import { RelayCard } from '@/features/premium/RelayCard';
import { ServerCopyCard } from '@/features/premium/ServerCopy';
import { SyncCard } from '@/features/premium/SyncCard';
import { getMode } from '@/lib/mode';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { importExport, pickExportFile } from './import';
import { ActionRow } from './settings-rows';

/**
 * Data & sync (DECISIONS 101): the technical side of your data. The copy on the server with its
 * categories and end-to-end encryption, syncing with another phone, the sync check, importing an
 * export, and how data on this phone is kept. The everyday settings are on Privacy.
 */
export function DataSyncScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const userId = useSessionStore((st) => st.userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cloud = userId != null && getMode() === 'cloud';

  /** An earlier export comes back: added to what is here, nothing is deleted. */
  const runImport = async () => {
    setError(null);
    const zip = await pickExportFile().catch(() => null);
    if (!zip || !userId) return;
    setBusy(true);
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
      setBusy(false);
    }
  };

  /** Back to Privacy when we came from there, so the two pages do not pile up. */
  const openPrivacy = () => {
    const routes = navigation.getState()?.routes ?? [];
    if (routes.length > 1 && routes[routes.length - 2].name === 'privacy') router.back();
    else router.push('/profile/privacy');
  };

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/profile/settings')} backLabel={t('common.back')} />
      <Text variant="screenTitle" accessibilityRole="header" style={{ fontSize: 28 }}>
        {t('dataSync.title')}
      </Text>
      <Text variant="bodyS" muted>
        {t('dataSync.intro')}
      </Text>

      {/* Keep a copy on the server (DECISIONS 62-64): accounts only. */}
      {cloud ? <ServerCopyCard /> : null}
      {/* Sync with another phone without a copy on the server (DECISIONS 65). */}
      {cloud ? <RelayCard /> : null}
      {userId ? <SyncCard userId={userId} /> : null}

      <Card size="small" gap={0}>
        <ActionRow
          name={t('privacy.importTitle')}
          detail={t('privacy.importDetail')}
          label={t('privacy.import')}
          disabled={busy}
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

      <Card size="small" gap={4}>
        <Text variant="bodyS">{t('dataSync.onPhone')}</Text>
        <Text variant="bodyS" muted>
          {t('privacy.localNote')}
        </Text>
      </Card>

      <Card size="small" gap={0}>
        <ListRow
          title={t('dataSync.privacy')}
          info={t('dataSync.privacyDetail')}
          divider={false}
          right={<Icon name="chevronRight" size={18} color={colors.textMuted} />}
          onPress={openPrivacy}
        />
      </Card>
    </Screen>
  );
}
