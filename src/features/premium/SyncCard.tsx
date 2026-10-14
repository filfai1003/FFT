import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { usePlanStore } from '@/lib/plan';
import { checkSync, resendAll, useSyncStatus, type SyncCheck } from './sync';

/** Whole minutes since a time. */
const sinceLabel = (iso: string, now: number) => Math.round((now - Date.parse(iso)) / 60000);

/**
 * Supporter and Premium: when this phone last synced, and a check that syncs now and compares
 * the items here and online, table by table, with a way to send everything again.
 */
export function SyncCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const online = usePlanStore((s) => s.premium === true && s.home === 'online');
  const lastAt = useSyncStatus((s) => s.lastAt);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The time the "minutes ago" is counted from: when the page opened, then after each check.
  const [now, setNow] = useState(() => Date.now());
  if (!online) return null;

  const run = async (how: (u: string) => Promise<SyncCheck>) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await how(userId));
      setNow(Date.now());
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const minutes = lastAt ? Math.max(0, sinceLabel(lastAt, now)) : null;
  const ok = result && result.differences.length === 0 && result.pending === 0;

  return (
    <Card size="small" gap={10}>
      <Text variant="label" muted>
        {t('sync.title')}
      </Text>
      <Text variant="bodyS">
        {minutes == null
          ? t('sync.never')
          : minutes < 1
            ? t('sync.justNow')
            : t('sync.minutesAgo', { count: minutes })}
      </Text>

      {result ? (
        ok ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={18} color={colors.successText} />
            <Text variant="bodyS" style={{ color: colors.successText }}>
              {t('sync.allGood')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            {result.differences.map((d) => (
              <Text key={d.table} variant="bodyS" numeric>
                {t('sync.difference', {
                  what: t(`sync.table.${d.table}` as 'sync.table.profiles'),
                  device: d.device,
                  server: d.server,
                })}
              </Text>
            ))}
            {result.pending > 0 ? (
              <Text variant="bodyS">{t('sync.pending', { count: result.pending })}</Text>
            ) : null}
            {result.refused > 0 ? (
              <Text variant="bodyS" danger>
                {t('sync.refused', { count: result.refused })}
              </Text>
            ) : null}
            <Button
              variant="secondary"
              label={t('sync.resend')}
              disabled={busy}
              onPress={() => void run(resendAll)}
            />
          </View>
        )
      ) : null}

      {error ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('sync.failed')}
        </Text>
      ) : null}

      <Button
        variant="secondary"
        icon="swap"
        label={busy ? t('sync.checking') : t('sync.check')}
        disabled={busy}
        onPress={() => void run(checkSync)}
      />
    </Card>
  );
}
