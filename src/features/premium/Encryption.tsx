import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { signOut } from '@/features/auth/api';
import { useSessionStore } from '@/features/auth/session-store';
import { useCopyEncrypted, useSyncChoice } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';
import { MIN_PASSPHRASE, WrongSecretError } from '@/lib/vault-crypto';
import {
  changePassphrase,
  setUpEncryption,
  turnEncryptionOff,
  turnEncryptionOn,
  unlockEncryption,
} from './vault';
import { useVaultKeys } from './vault-key';

/**
 * End-to-end encryption of the copy on the server (DECISIONS 64): the switch in Your data,
 * turning it on (passphrase, then the recovery key shown once), off, a new passphrase, and the
 * passphrase asked on a device that does not have the key yet.
 */

/** Two passphrase fields with the rules: long enough, the same twice. */
function usePassphrasePair() {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [tried, setTried] = useState(false);
  const tooShort = first.length < MIN_PASSPHRASE;
  const differ = first !== second;
  return {
    first,
    second,
    setFirst,
    setSecond,
    tried,
    setTried,
    ok: !tooShort && !differ,
    tooShort,
    differ,
    reset: () => {
      setFirst('');
      setSecond('');
      setTried(false);
    },
  };
}

function PassphraseFields({
  pair,
  firstLabel,
}: {
  pair: ReturnType<typeof usePassphrasePair>;
  firstLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 12 }}>
      <Input
        label={firstLabel}
        value={pair.first}
        onChangeText={pair.setFirst}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        error={
          pair.tried && pair.tooShort ? t('vault.tooShort', { count: MIN_PASSPHRASE }) : undefined
        }
      />
      <Text variant="bodyS" muted>
        {t('vault.passphraseHint', { count: MIN_PASSPHRASE })}
      </Text>
      <Input
        label={t('vault.passphraseAgain')}
        value={pair.second}
        onChangeText={pair.setSecond}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        error={pair.tried && !pair.tooShort && pair.differ ? t('vault.notSame') : undefined}
      />
    </View>
  );
}

/** What turning it on means, in one list (the single confirmation of DECISIONS 64). */
function WhatItMeans() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text muted>{t('vault.onBody')}</Text>
      {(['api', 'admin', 'lost', 'devices'] as const).map((k) => (
        <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="info" size={18} color={colors.text} />
          <Text variant="bodyS" style={{ flex: 1 }}>
            {t(`vault.onPoints.${k}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Turning it on: what it means and a passphrase, then the recovery key (copy it, say it is
 * saved), then the copy is encrypted.
 */
export function TurnEncryptionOnSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const pair = usePassphrasePair();
  const [recovery, setRecovery] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'key' | 'encrypting' | null>(null);
  const [failed, setFailed] = useState(false);

  const close = () => {
    pair.reset();
    setRecovery(null);
    setSaved(false);
    setFailed(false);
    onClose();
  };

  const makeKey = async () => {
    pair.setTried(true);
    if (!userId || !pair.ok) return;
    setBusy('key');
    setFailed(false);
    try {
      setRecovery(await setUpEncryption(userId, pair.first));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const turnOn = async () => {
    if (!userId || !saved) return;
    setBusy('encrypting');
    setFailed(false);
    try {
      await turnEncryptionOn(userId);
      await queryClient.invalidateQueries();
      close();
      showToast({ message: t('vault.turnedOn') });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!recovery) return;
    await Clipboard.setStringAsync(recovery);
    showToast({ message: t('vault.copied') });
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={recovery ? t('vault.recoveryTitle') : t('vault.onTitle')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          {recovery ? (
            <Button
              size="large"
              label={busy === 'encrypting' ? t('vault.encrypting') : t('vault.turnOn')}
              disabled={busy != null || !saved}
              onPress={() => void turnOn()}
            />
          ) : (
            <Button
              size="large"
              label={busy === 'key' ? t('vault.making') : t('vault.makeKey')}
              disabled={busy != null}
              onPress={() => void makeKey()}
            />
          )}
          <Button variant="secondary" label={t('common.cancel')} onPress={close} />
        </View>
      }
    >
      {recovery ? (
        <View style={{ gap: 12 }}>
          <Text muted>{t('vault.recoveryBody')}</Text>
          <Card size="small">
            <Text
              variant="titleM"
              numeric
              selectable
              accessibilityLabel={recovery.split('').join(' ')}
            >
              {recovery}
            </Text>
          </Card>
          <Button
            variant="secondary"
            icon="copy"
            label={t('vault.copy')}
            onPress={() => void copy()}
          />
          <OptionCard
            role="checkbox"
            title={t('vault.saved')}
            selected={saved}
            onPress={() => setSaved((v) => !v)}
          />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <WhatItMeans />
          <PassphraseFields pair={pair} firstLabel={t('vault.passphrase')} />
        </View>
      )}
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('vault.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

function TurnEncryptionOffSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    if (!userId) return;
    setBusy(true);
    setFailed(false);
    try {
      await turnEncryptionOff(userId);
      await queryClient.invalidateQueries();
      onClose();
      showToast({ message: t('vault.turnedOff') });
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
      title={t('vault.offTitle')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            label={busy ? t('serverCopy.working') : t('vault.offConfirm')}
            disabled={busy}
            onPress={() => void confirm()}
          />
          <Button variant="secondary" label={t('vault.keepOn')} onPress={onClose} />
        </View>
      }
    >
      <Text muted>{t('vault.offBody')}</Text>
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('vault.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

function ChangePassphraseSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const userId = useSessionStore((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const pair = usePassphrasePair();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = () => {
    pair.reset();
    setFailed(false);
    onClose();
  };

  const save = async () => {
    pair.setTried(true);
    if (!userId || !pair.ok) return;
    setBusy(true);
    setFailed(false);
    try {
      await changePassphrase(userId, pair.first);
      close();
      showToast({ message: t('vault.changed') });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('vault.newPassphraseTitle')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            label={busy ? t('vault.making') : t('vault.save')}
            disabled={busy}
            onPress={() => void save()}
          />
          <Button variant="secondary" label={t('common.cancel')} onPress={close} />
        </View>
      }
    >
      <Text muted>{t('vault.newPassphraseBody')}</Text>
      <PassphraseFields pair={pair} firstLabel={t('vault.newPassphrase')} />
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('vault.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** The passphrase (or the recovery key) that opens the key on this device. */
function UnlockForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const [how, setHow] = useState<'passphrase' | 'recovery'>('passphrase');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'wrong' | 'failed' | null>(null);

  const open = async () => {
    if (!userId || !secret.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await unlockEncryption(userId, secret, how);
      await queryClient.invalidateQueries();
      onDone();
    } catch (e) {
      setError(e instanceof WrongSecretError ? 'wrong' : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Input
        label={how === 'passphrase' ? t('vault.passphrase') : t('vault.recoveryKey')}
        value={secret}
        onChangeText={setSecret}
        secureTextEntry={how === 'passphrase'}
        autoCapitalize={how === 'passphrase' ? 'none' : 'characters'}
        autoComplete="off"
        error={
          error === 'wrong'
            ? how === 'passphrase'
              ? t('vault.wrong')
              : t('vault.wrongRecovery')
            : undefined
        }
      />
      {error === 'failed' ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('vault.failed')}
        </Text>
      ) : null}
      <Button
        size="large"
        label={busy ? t('vault.opening') : t('vault.open')}
        disabled={busy || !secret.trim()}
        onPress={() => void open()}
      />
      <Button
        variant="ghost"
        label={how === 'passphrase' ? t('vault.useRecovery') : t('vault.usePassphrase')}
        onPress={() => {
          setHow(how === 'passphrase' ? 'recovery' : 'passphrase');
          setSecret('');
          setError(null);
        }}
      />
    </View>
  );
}

function UnlockSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('vault.unlockTitle')}
      closeLabel={t('common.close')}
    >
      <Text muted>{t('vault.unlockBody')}</Text>
      <UnlockForm onDone={onClose} />
    </Sheet>
  );
}

/**
 * Before the app shows data on a device without the key (the web app, a new phone). On a phone it
 * can wait ("Not now": the app works on the phone's data, the sync waits).
 */
export function VaultUnlockScreen({
  onDone,
  onLater,
}: {
  onDone: () => void;
  onLater?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Screen scroll bottomBarHeight={24} gap={16}>
      <View style={{ gap: 8, paddingTop: 24 }}>
        <Text variant="screenTitle" accessibilityRole="header">
          {t('vault.unlockTitle')}
        </Text>
        <Text muted>{t('vault.unlockBody')}</Text>
      </View>
      <Card gap={12}>
        <UnlockForm onDone={onDone} />
      </Card>
      {onLater ? <Button variant="secondary" label={t('vault.later')} onPress={onLater} /> : null}
      <Button variant="ghost" label={t('profile.logOut')} onPress={() => void signOut()} />
    </Screen>
  );
}

/** Your data, inside the copy-on-the-server card: the encryption switch and its actions. */
export function EncryptionSection({ web }: { web: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const encrypted = useCopyEncrypted();
  const userId = useSessionStore((s) => s.userId);
  const unlocked = useVaultKeys((s) => (userId ? s.unlocked[userId] === true : false));
  const [sheet, setSheet] = useState<'on' | 'off' | 'passphrase' | 'unlock' | null>(null);

  return (
    <View
      style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.borderDecorative }}
    >
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
          <Text variant="bodyS">{t('vault.title')}</Text>
          <Text variant="bodyS" muted>
            {encrypted ? t('vault.onDetail') : t('vault.offDetail')}
          </Text>
        </View>
        {web ? null : (
          <Toggle
            value={encrypted}
            onValueChange={(v) => setSheet(v ? 'on' : 'off')}
            accessibilityLabel={t('vault.title')}
          />
        )}
      </View>
      {web ? (
        <Text variant="bodyS" muted>
          {t('vault.webNote')}
        </Text>
      ) : null}
      {encrypted && !unlocked ? (
        <>
          <Text variant="bodyS" muted>
            {t('vault.lockedDetail')}
          </Text>
          <Button
            variant="secondary"
            icon="lock"
            label={t('vault.unlock')}
            onPress={() => setSheet('unlock')}
          />
        </>
      ) : null}
      {encrypted && unlocked ? (
        <Button
          variant="secondary"
          icon="lock"
          label={t('vault.changePassphrase')}
          onPress={() => setSheet('passphrase')}
        />
      ) : null}
      <TurnEncryptionOnSheet visible={sheet === 'on'} onClose={() => setSheet(null)} />
      <TurnEncryptionOffSheet visible={sheet === 'off'} onClose={() => setSheet(null)} />
      <ChangePassphraseSheet visible={sheet === 'passphrase'} onClose={() => setSheet(null)} />
      <UnlockSheet visible={sheet === 'unlock'} onClose={() => setSheet(null)} />
    </View>
  );
}

/** Where the API and AI apps are offered: they do not work while the copy is encrypted. */
export function EncryptedApiCard() {
  const { t } = useTranslation();
  const choice = useSyncChoice();
  const encrypted = useCopyEncrypted();
  if (choice !== 'on' || !encrypted) return null;
  return (
    <Card gap={10}>
      <Text variant="bodyS">{t('vault.apiOffTitle')}</Text>
      <Text variant="bodyS" muted>
        {t('vault.apiOffBody')}
      </Text>
    </Card>
  );
}
