import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardTitle } from '@/components/ui/CardTitle';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { FormHeader } from '@/components/ui/FormHeader';
import { Icon } from '@/components/ui/Icon';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { signOut } from '@/features/auth/api';
import { useSessionStore } from '@/features/auth/session-store';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { DATA_CATEGORIES, type DataCategory } from '@/domain/data-categories';
import { useSharedCategories, useSyncChoice } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';
import { setSharedCategories, turnSyncOff, turnSyncOn } from './sync';
import { EncryptionSection } from './Encryption';
import { endRelayHere, useRelayStore } from './relay';
import { SyncCategoryList, toggled } from './SyncCategories';

/**
 * Keep a copy on the server (DECISIONS 62): what it gives and what it means, the choice a new
 * account makes, the switch in Your data, and the notes where a feature needs it.
 */

/** What the copy on the server gives, and that it lives on our server in the EU. */
export function ServerCopyFacts() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="bodyS">{t('serverCopy.givesTitle')}</Text>
      {(['devices', 'ai', 'recover'] as const).map((k) => (
        <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="check" size={18} color={colors.text} />
          <Text variant="bodyS" style={{ flex: 1 }}>
            {t(`serverCopy.gives.${k}`)}
          </Text>
        </View>
      ))}
      <Text variant="bodyS" style={{ paddingTop: 4 }}>
        {t('serverCopy.meansTitle')}
      </Text>
      <Text variant="bodyS" muted>
        {t('serverCopy.means')}
      </Text>
    </View>
  );
}

/**
 * A new account chooses before anything is stored on the server: two options, none preselected.
 * Shown once, right after sign-up (and on any device until the choice is made).
 */
export function SyncChoiceScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const barHeight = useActionBarHeight();
  const userId = useSessionStore((s) => s.userId);
  const [choice, setChoice] = useState<'on' | 'off' | null>(null);
  // Every category is kept unless the user turns some off (DECISIONS 63).
  const [categories, setCategories] = useState<DataCategory[]>(() => [...DATA_CATEGORIES]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    if (!userId || choice == null) return;
    setBusy(true);
    setFailed(false);
    try {
      if (choice === 'on') await turnSyncOn(userId, categories);
      else await turnSyncOff(userId);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={20}>
        <FormHeader left={{ label: t('onboarding.signOut'), onPress: () => void signOut() }} />
        <View style={{ gap: 8 }}>
          <Text variant="displayM" accessibilityRole="header">
            {t('serverCopy.chooseTitle')}
          </Text>
          <Text muted>{t('serverCopy.chooseIntro')}</Text>
        </View>
        <Card gap={10}>
          <ServerCopyFacts />
          <LegalLinks pages={['privacy']} />
        </Card>
        <View style={{ gap: 12 }} accessibilityRole="radiogroup">
          <OptionCard
            title={t('serverCopy.optionOn')}
            description={t('serverCopy.optionOnDetail')}
            selected={choice === 'on'}
            onPress={() => setChoice('on')}
          />
          <OptionCard
            title={t('serverCopy.optionOff')}
            description={t('serverCopy.optionOffDetail')}
            selected={choice === 'off'}
            onPress={() => setChoice('off')}
          />
        </View>
        {choice === 'on' ? (
          <Card gap={6}>
            <Text variant="bodyS">{t('serverCopy.categoriesTitle')}</Text>
            <SyncCategoryList
              value={categories}
              onToggle={(c, on) => setCategories((list) => toggled(list, c, on))}
            />
          </Card>
        ) : null}
        {failed ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {t('serverCopy.saveFailed')}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={busy ? t('serverCopy.working') : t('common.continue')}
          disabled={busy || choice == null}
          onPress={() => void save()}
        />
      </BottomActionBar>
    </>
  );
}

/**
 * Turning the copy on: explained first (the data goes to our server in the EU), on only after
 * the button. `onDone` runs once it is on.
 */
export function TurnSyncOnSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [categories, setCategories] = useState<DataCategory[]>(() => [...DATA_CATEGORIES]);
  // The relay between phones and the copy exclude each other (DECISIONS 65).
  const relayed = useRelayStore((s) => (userId ? s.paired[userId] === true : false));

  const confirm = async () => {
    if (!userId) return;
    setBusy(true);
    setFailed(false);
    try {
      await turnSyncOn(userId, categories);
      // The server ended the relay with it (set_sync); this phone forgets it.
      if (relayed) await endRelayHere(userId);
      await queryClient.invalidateQueries();
      onClose();
      showToast({ message: t('serverCopy.turnedOn') });
      onDone?.();
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
      title={t('serverCopy.turnOnTitle')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            label={busy ? t('serverCopy.working') : t('serverCopy.turnOnConfirm')}
            disabled={busy}
            onPress={() => void confirm()}
          />
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
        </View>
      }
    >
      <Text muted>{t('serverCopy.turnOnBody')}</Text>
      {relayed ? <Text variant="bodyS">{t('relay.endsRelay')}</Text> : null}
      <ServerCopyFacts />
      <Text variant="bodyS" style={{ paddingTop: 4 }}>
        {t('serverCopy.categoriesTitle')}
      </Text>
      <SyncCategoryList
        value={categories}
        onToggle={(c, on) => setCategories((list) => toggled(list, c, on))}
      />
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('serverCopy.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

/**
 * Turning the copy off deletes it on the server: it cannot be undone, so it is confirmed here
 * instead of offering UNDO (like Delete account).
 */
function TurnSyncOffSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
      await turnSyncOff(userId);
      await queryClient.invalidateQueries();
      onClose();
      showToast({ message: t('serverCopy.turnedOff') });
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
      title={t('serverCopy.turnOffTitle')}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            variant="danger"
            label={busy ? t('serverCopy.working') : t('serverCopy.turnOffConfirm')}
            disabled={busy}
            onPress={() => void confirm()}
          />
          <Button variant="secondary" label={t('serverCopy.keepOn')} onPress={onClose} />
        </View>
      }
    >
      <Text muted>{t('serverCopy.turnOffBody')}</Text>
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('serverCopy.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

/**
 * Turning a category off deletes it on the server: confirmed first (it cannot be undone), like
 * turning the whole copy off.
 */
function CategoryOffSheet({
  category,
  onClose,
}: {
  category: DataCategory | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const shared = useSharedCategories();
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = category ? t(`serverCopy.category.${category}`) : '';

  const confirm = async () => {
    if (!userId || !category) return;
    setBusy(true);
    setFailed(false);
    try {
      await setSharedCategories(userId, toggled(shared, category, false));
      await queryClient.invalidateQueries();
      onClose();
      showToast({ message: t('serverCopy.categoryRemoved', { name }) });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={category != null}
      onClose={onClose}
      title={t('serverCopy.categoryOffTitle', { name })}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            variant="danger"
            label={busy ? t('serverCopy.working') : t('serverCopy.categoryOffConfirm')}
            disabled={busy}
            onPress={() => void confirm()}
          />
          <Button variant="secondary" label={t('serverCopy.keepOn')} onPress={onClose} />
        </View>
      }
    >
      <Text muted>{t('serverCopy.categoryOffBody', { name })}</Text>
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('serverCopy.failed')}
        </Text>
      ) : null}
    </Sheet>
  );
}

/** The categories kept on the server, with a switch each (on: sent at once; off: asks first). */
function CategoriesOnServer({ web }: { web: boolean }) {
  const { t } = useTranslation();
  const userId = useSessionStore((s) => s.userId);
  const shared = useSharedCategories();
  const showToast = useToastStore((s) => s.show);
  const [asking, setAsking] = useState<DataCategory | null>(null);
  const [failed, setFailed] = useState(false);

  const toggle = async (category: DataCategory, on: boolean) => {
    if (!on) return setAsking(category);
    if (!userId) return;
    setFailed(false);
    try {
      await setSharedCategories(userId, toggled(shared, category, true));
      showToast({
        message: t('serverCopy.categoryAdded', { name: t(`serverCopy.category.${category}`) }),
      });
    } catch {
      setFailed(true);
    }
  };

  return (
    <View style={{ gap: 6, paddingTop: 4 }}>
      <CardTitle icon="shield" title={t('serverCopy.categoriesTitle')} />
      <SyncCategoryList value={shared} readOnly={web} onToggle={(c, on) => void toggle(c, on)} />
      {failed ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('serverCopy.failed')}
        </Text>
      ) : null}
      <CategoryOffSheet category={asking} onClose={() => setAsking(null)} />
    </View>
  );
}

/** Your data: the switch. Off asks first and deletes the copy; on explains first. */
export function ServerCopyCard() {
  const { t } = useTranslation();
  const choice = useSyncChoice();
  const [sheet, setSheet] = useState<'on' | 'off' | null>(null);
  const on = choice === 'on';
  // The web app lives on the copy: turning it off happens in the phone app.
  const web = Platform.OS === 'web';

  return (
    <>
      <Card size="small" gap={6}>
        {web ? (
          <View style={{ minHeight: 60, gap: 2, justifyContent: 'center' }}>
            <Text variant="body">{t('serverCopy.title')}</Text>
            <Text variant="bodyS" muted>
              {on ? t('serverCopy.onDetail') : t('serverCopy.offDetail')}
            </Text>
          </View>
        ) : (
          <ToggleRow
            name={t('serverCopy.title')}
            detail={on ? t('serverCopy.onDetail') : t('serverCopy.offDetail')}
            value={on}
            onValueChange={(v) => setSheet(v ? 'on' : 'off')}
          />
        )}
        {web ? (
          <Text variant="bodyS" muted>
            {t('serverCopy.webNote')}
          </Text>
        ) : null}
        {on ? <CategoriesOnServer web={web} /> : null}
        {on ? <EncryptionSection web={web} /> : null}
      </Card>
      <TurnSyncOnSheet visible={sheet === 'on'} onClose={() => setSheet(null)} />
      <TurnSyncOffSheet visible={sheet === 'off'} onClose={() => setSheet(null)} />
    </>
  );
}

/**
 * Where a feature reads the copy on the server (API, MCP, AI apps) and it is off: says so and
 * offers to turn it on. Renders nothing when the copy is on.
 */
export function SyncNeededCard() {
  const { t } = useTranslation();
  const choice = useSyncChoice();
  const [asking, setAsking] = useState(false);
  if (choice === 'on') return null;
  return (
    <>
      <Card gap={10}>
        <Text variant="bodyS">{t('serverCopy.neededTitle')}</Text>
        <Text variant="bodyS" muted>
          {t('serverCopy.neededBody')}
        </Text>
        <Button
          variant="secondary"
          label={t('serverCopy.turnOnConfirm')}
          onPress={() => setAsking(true)}
        />
      </Card>
      <TurnSyncOnSheet visible={asking} onClose={() => setAsking(false)} />
    </>
  );
}

/**
 * The web app for an account without a copy on the server: its data is on the phone only, so
 * there is nothing to show here. It can be turned on (here or in the phone app) or the user signs
 * out.
 */
export function WebSyncOffScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Screen scroll bottomBarHeight={24} gap={16}>
        <View style={{ gap: 8, paddingTop: 24 }}>
          <Text variant="screenTitle" accessibilityRole="header">
            {t('serverCopy.webTitle')}
          </Text>
          <Text muted>{t('serverCopy.webBody')}</Text>
        </View>
        <Card gap={10}>
          <ServerCopyFacts />
        </Card>
        <Button
          size="large"
          label={t('serverCopy.turnOnConfirm')}
          onPress={() => setAsking(true)}
        />
        <Button variant="secondary" label={t('common.retry')} onPress={onRetry} />
        <Button variant="ghost" label={t('profile.logOut')} onPress={() => void signOut()} />
      </Screen>
      <TurnSyncOnSheet visible={asking} onClose={() => setAsking(false)} onDone={onRetry} />
    </>
  );
}
