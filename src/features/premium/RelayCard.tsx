import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { QrCode } from '@/components/ui/QrCode';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { useSessionStore } from '@/features/auth/session-store';
import { getLocalDb, hasOwnData } from '@/lib/local-db';
import { useSharedCategories, useSyncChoice } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';
import {
  InvalidCodeError,
  joinRelay,
  leaveRelay,
  loadRelay,
  relayDevices,
  relayOnce,
  removeRelayDevice,
  startRelay,
  useRelayStore,
  type RelayDevice,
} from './relay';
import { setSharedCategories } from './sync';
import { SyncCategoryList, toggled } from './SyncCategories';

/**
 * Encrypted relay between phones (DECISIONS 65): pairing (a QR code, or the code typed), the
 * paired phones with remove, what they exchange, and the offer to pair on a new phone.
 */

/** Scans a pairing code with the camera, or takes it typed. */
function CodeEntry({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const [scanned, setScanned] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          height: 240,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.borderDecorative,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
        }}
      >
        {permission?.granted ? (
          <CameraView
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              scanned || busy
                ? undefined
                : ({ data }) => {
                    setScanned(true);
                    onCode(data);
                  }
            }
          />
        ) : (
          <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
            <Text muted style={{ textAlign: 'center' }}>
              {t('relay.needCamera')}
            </Text>
            <Button
              label={t('relay.allowCamera')}
              block={false}
              variant="secondary"
              onPress={() => void requestPermission()}
            />
          </View>
        )}
      </View>
      <Input
        label={t('relay.typed')}
        value={typed}
        onChangeText={(v) => {
          setTyped(v);
          setScanned(false);
        }}
        autoCapitalize="characters"
        autoComplete="off"
      />
      <Button
        label={busy ? t('relay.pairing') : t('relay.pair')}
        disabled={busy || typed.trim().length < 20}
        onPress={() => onCode(typed)}
      />
    </View>
  );
}

/** Pairs this phone with a scanned or typed code; says clearly when it is not one. */
function usePairing(onPaired: () => void) {
  const userId = useSessionStore((s) => s.userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'invalid' | 'failed' | null>(null);
  const pairWith = async (code: string) => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await joinRelay(userId, code);
      onPaired();
    } catch (e) {
      setError(e instanceof InvalidCodeError ? 'invalid' : 'failed');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, pairWith };
}

function PairError({ error }: { error: 'invalid' | 'failed' | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <Text variant="bodyS" danger accessibilityRole="alert">
      {error === 'invalid' ? t('relay.invalid') : t('relay.failed')}
    </Text>
  );
}

function ScanSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const { busy, error, pairWith } = usePairing(() => {
    onClose();
    showToast({ message: t('relay.paired') });
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('relay.scanTitle')}
      closeLabel={t('common.close')}
    >
      <Text muted>{t('relay.scanBody')}</Text>
      {visible ? <CodeEntry onCode={(c) => void pairWith(c)} busy={busy} /> : null}
      <PairError error={error} />
    </Sheet>
  );
}

function CodeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const userId = useSessionStore((s) => s.userId);
  const [code, setCode] = useState<{ text: string; qr: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!visible || !userId) return;
    let live = true;
    startRelay(userId)
      .then((c) => live && setCode(c))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [visible, userId]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('relay.codeTitle')}
      closeLabel={t('common.close')}
    >
      <Text muted>{t('relay.codeBody')}</Text>
      {code ? (
        <View style={{ gap: 12 }}>
          <QrCode value={code.qr} label={t('relay.codeLabel', { code: code.text })} />
          <Text variant="titleM" numeric selectable style={{ textAlign: 'center' }}>
            {code.text}
          </Text>
          <Text variant="bodyS" muted>
            {t('relay.codeWarning')}
          </Text>
        </View>
      ) : null}
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('relay.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** A yes / no question before unpairing. */
function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const go = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            variant="danger"
            label={busy ? t('serverCopy.working') : confirmLabel}
            disabled={busy}
            onPress={() => void go()}
          />
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
        </View>
      }
    >
      <Text muted>{body}</Text>
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('relay.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

function DeviceRow({
  device,
  mine,
  divider,
  onRemove,
}: {
  device: RelayDevice;
  mine: boolean;
  divider: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: divider ? 1 : 0,
        borderColor: colors.borderDecorative,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyS">
          {mine ? `${device.name} · ${t('relay.thisPhone')}` : device.name}
        </Text>
        <Text variant="bodyS" muted>
          {device.last_seen_at
            ? t('relay.lastSeen', { date: new Date(device.last_seen_at).toLocaleDateString() })
            : t('relay.never')}
        </Text>
      </View>
      <IconButton
        icon="trash"
        accessibilityLabel={t('relay.remove', { name: device.name })}
        onPress={onRemove}
      />
    </View>
  );
}

/** Your data: sync with another phone without a copy on the server. */
export function RelayCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const choice = useSyncChoice();
  const shared = useSharedCategories();
  const showToast = useToastStore((s) => s.show);
  const paired = useRelayStore((s) => (userId ? s.paired[userId] === true : false));
  const [sheet, setSheet] = useState<'code' | 'scan' | 'leave' | null>(null);
  const [removing, setRemoving] = useState<RelayDevice | null>(null);
  const [myDevice, setMyDevice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const web = Platform.OS === 'web';

  useEffect(() => {
    if (!userId) return;
    void loadRelay(userId).then((s) => setMyDevice(s?.deviceId ?? null));
  }, [userId, paired]);

  const devices = useQuery({
    queryKey: ['relay-devices', userId, paired],
    queryFn: relayDevices,
    enabled: userId != null && paired && choice === 'off',
  });

  if (!userId) return null;

  const toggle = async (category: Parameters<typeof toggled>[1], on: boolean) => {
    setFailed(false);
    try {
      await setSharedCategories(userId, toggled(shared, category, on));
    } catch {
      setFailed(true);
    }
  };

  return (
    <Card size="small" gap={8}>
      <Text variant="bodyS">{t('relay.title')}</Text>
      {choice === 'on' ? (
        <Text variant="bodyS" muted>
          {t('relay.serverCopyOn')}
        </Text>
      ) : web ? (
        <Text variant="bodyS" muted>
          {t('relay.webNote')}
        </Text>
      ) : (
        <>
          <Text variant="bodyS" muted>
            {t('relay.intro')}
          </Text>
          {paired ? (
            <>
              <Text variant="bodyS" muted style={{ paddingTop: 4 }}>
                {t('relay.devicesTitle')}
              </Text>
              {(devices.data ?? []).map((d, i) => (
                <DeviceRow
                  key={d.device_id}
                  device={d}
                  mine={d.device_id === myDevice}
                  divider={i > 0}
                  onRemove={() => setRemoving(d)}
                />
              ))}
              <Button
                variant="secondary"
                label={t('relay.showCode')}
                onPress={() => setSheet('code')}
              />
              <Text variant="bodyS" muted style={{ paddingTop: 4 }}>
                {t('relay.categoriesTitle')}
              </Text>
              <SyncCategoryList
                value={shared}
                alwaysNote="relay"
                onToggle={(c, on) => void toggle(c, on)}
              />
              <Button variant="ghost" label={t('relay.leave')} onPress={() => setSheet('leave')} />
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                label={t('relay.showCode')}
                onPress={() => setSheet('code')}
              />
              <Button
                variant="secondary"
                icon="scan"
                label={t('relay.scanCode')}
                onPress={() => setSheet('scan')}
              />
            </>
          )}
          {failed ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {t('relay.failed')}
            </Text>
          ) : null}
        </>
      )}
      <CodeSheet
        visible={sheet === 'code'}
        onClose={() => {
          setSheet(null);
          void queryClient.invalidateQueries({ queryKey: ['relay-devices'] });
        }}
      />
      <ScanSheet visible={sheet === 'scan'} onClose={() => setSheet(null)} />
      <ConfirmSheet
        visible={sheet === 'leave'}
        title={t('relay.leaveTitle')}
        body={t('relay.leaveBody')}
        confirmLabel={t('relay.leaveConfirm')}
        onConfirm={async () => {
          await leaveRelay(userId);
          showToast({ message: t('relay.left') });
        }}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        visible={removing != null}
        title={t('relay.removeTitle', { name: removing?.name ?? '' })}
        body={t('relay.removeBody')}
        confirmLabel={t('relay.removeConfirm')}
        onConfirm={async () => {
          if (!removing) return;
          await removeRelayDevice(userId, removing.device_id);
          await queryClient.invalidateQueries({ queryKey: ['relay-devices'] });
          showToast({ message: t('relay.removed', { name: removing.name }) });
        }}
        onClose={() => setRemoving(null)}
      />
    </Card>
  );
}

/**
 * A new phone of an account whose phones sync through the relay: pair it before anything is made
 * here, then wait for the other phone to send everything (or go on without waiting).
 */
export function RelayJoinScreen({ onDone, onLater }: { onDone: () => void; onLater: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const [waiting, setWaiting] = useState(false);
  const { busy, error, pairWith } = usePairing(() => setWaiting(true));

  useEffect(() => {
    if (!waiting || !userId) return;
    let live = true;
    const tick = async () => {
      try {
        await relayOnce(userId);
        const db = getLocalDb(userId);
        await db.ready;
        if (live && hasOwnData(db)) {
          await queryClient.invalidateQueries();
          onDone();
        }
      } catch {
        // Offline for a moment: tried again in a few seconds.
      }
    };
    void tick();
    const every = setInterval(() => void tick(), 3000);
    return () => {
      live = false;
      clearInterval(every);
    };
  }, [waiting, userId, onDone, queryClient]);

  return (
    <Screen scroll bottomBarHeight={24} gap={16}>
      <View style={{ gap: 8, paddingTop: 24 }}>
        <Text variant="screenTitle" accessibilityRole="header">
          {t('relay.joinTitle')}
        </Text>
        <Text muted>{waiting ? t('relay.waiting') : t('relay.joinBody')}</Text>
      </View>
      {waiting ? (
        <Button variant="secondary" label={t('relay.continueNow')} onPress={onDone} />
      ) : (
        <>
          <Card gap={12}>
            <CodeEntry onCode={(c) => void pairWith(c)} busy={busy} />
            <PairError error={error} />
          </Card>
          <Button variant="ghost" label={t('relay.startFresh')} onPress={onLater} />
        </>
      )}
    </Screen>
  );
}
