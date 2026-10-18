import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { useCopyEncrypted, usePlanStore, useSyncChoice } from '@/lib/plan';
import { EncryptedApiCard } from './Encryption';
import { useBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { ConnectAiButtons } from './ConnectAiButtons';
import { SyncNeededCard } from './ServerCopy';
import { isThisComputer, newConnections, splitTokens } from './connections';
import {
  type ApiToken,
  type ApiTokenScope,
  claudeCodeCommand,
  MCP_URL,
  REST_URL,
  useApiTokens,
  useCreateApiToken,
  useSetApiTokenRevoked,
} from './api-tokens';

const date = (iso: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  );

/** API & MCP: the addresses, the user's tokens, making and revoking them (every account). */
export function ApiScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useBack('/profile/settings');
  const barHeight = useActionBarHeight();
  const showToast = useToastStore((s) => s.show);
  // Every account (DECISIONS 47); the account-less mode has no server account to connect.
  const allowed = usePlanStore((s) => s.userId != null);
  // Tokens and AI apps read and write the copy on the server: none without it (DECISIONS 62).
  // Existing tokens stay listed so they can be revoked.
  // An end-to-end encrypted copy cannot be read by the server either (DECISIONS 64).
  const encrypted = useCopyEncrypted();
  const synced = useSyncChoice() === 'on' && !encrypted;
  const tokens = useApiTokens(allowed);
  const create = useCreateApiToken();
  const setRevoked = useSetApiTokenRevoked();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('write');
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Copies the MCP address and opens the app's connectors page: paste, then sign in with FFT. */
  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    showToast({ message: t('api.copied') });
  };

  const submit = async () => {
    setError(null);
    try {
      const token = await create.mutateAsync({ name: name.trim(), scope });
      setNaming(false);
      setName('');
      setScope('write');
      setMade(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Personal tokens and connected AI apps (OAuth) are listed apart; a new connection is pointed out
  // at the top, so a sign-in the user did not make is noticed (DECISIONS 74).
  const { tokens: own, apps } = splitTokens(tokens.data ?? []);
  const fresh = newConnections(apps);
  const hostLabel = (host: string | null) =>
    isThisComputer(host) ? t('api.thisComputer') : (host ?? t('api.unknownHost'));

  const revoke = (id: string, tokenName: string, app: boolean) =>
    setRevoked.mutate(
      { id, revoked: true },
      {
        onSuccess: () =>
          showToast({
            message: t(app ? 'api.disconnected' : 'api.revoked', { name: tokenName }),
            actionLabel: t('common.undo'),
            onAction: () => setRevoked.mutate({ id, revoked: false }),
            bottomOffset: barHeight,
          }),
      },
    );

  const address = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyS" muted>
          {label}
        </Text>
        <Text variant="bodyS" selectable>
          {value}
        </Text>
      </View>
      <IconButton
        icon="copy"
        accessibilityLabel={t('api.copyLabel', { what: label })}
        onPress={() => void copy(value)}
      />
    </View>
  );

  const row = (tok: ApiToken, i: number) => (
    <View
      key={tok.id}
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: i === 0 ? 0 : 1,
        borderColor: colors.borderDecorative,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyS">{tok.name}</Text>
        <Text variant="label" muted>
          {[
            tok.app ? hostLabel(tok.redirectHost) : `${tok.prefix}…`,
            t(tok.scope === 'read' ? 'api.scopeRead' : 'api.scopeWrite'),
            ...(tok.app ? [t('api.connectedOn', { date: date(tok.createdAt) })] : []),
            tok.lastUsedAt ? t('api.lastUsed', { date: date(tok.lastUsedAt) }) : t('api.neverUsed'),
          ].join(' · ')}
        </Text>
      </View>
      <Button
        label={t(tok.app ? 'api.disconnect' : 'api.revoke')}
        accessibilityLabel={t(tok.app ? 'api.disconnectLabel' : 'api.revokeLabel', {
          name: tok.name,
        })}
        block={false}
        variant="secondary"
        onPress={() => revoke(tok.id, tok.name, tok.app)}
      />
    </View>
  );

  return (
    <>
      <Screen scroll bottomBarHeight={allowed && synced ? barHeight + 24 : 24} gap={14}>
        <TopBar onBack={goBack} backLabel={t('common.back')} />
        <Text variant="screenTitle">{t('api.title')}</Text>

        {fresh.map((app) => (
          <Card key={`new-${app.id}`} gap={6} tone="alt">
            <Text variant="bodyS" medium>
              {t('api.newConnectionTitle')}
            </Text>
            <Text variant="bodyS">
              {t('api.newConnection', {
                name: app.name,
                host: hostLabel(app.redirectHost),
                date: date(app.createdAt),
              })}
            </Text>
          </Card>
        ))}

        {!allowed ? (
          <Card gap={10}>
            <Text variant="bodyS">{t('api.paidOnly')}</Text>
            <Button
              label={t('api.seePlans')}
              variant="secondary"
              onPress={() => router.push('/profile/premium')}
            />
          </Card>
        ) : (
          <>
            {/* The API and AI apps read the copy on the server (DECISIONS 62). */}
            <SyncNeededCard />
            <EncryptedApiCard />
            {synced ? (
              <>
                <Card gap={10}>
                  <Text variant="bodyS" muted>
                    {t('api.connectTitle')}
                  </Text>
                  <ConnectAiButtons />
                </Card>

                <Card size="small" gap={0}>
                  {address(t('api.mcpAddress'), MCP_URL)}
                  <View style={{ borderTopWidth: 1, borderColor: colors.borderDecorative }} />
                  {address(t('api.restAddress'), REST_URL)}
                </Card>
              </>
            ) : null}

            {apps.length ? (
              <Card size="small" gap={0}>
                <Text variant="label" muted style={{ paddingBottom: 4 }}>
                  {t('api.connectedApps')}
                </Text>
                {apps.map(row)}
              </Card>
            ) : null}

            {own.length ? (
              <Card size="small" gap={0}>
                <Text variant="bodyS" muted style={{ paddingBottom: 4 }}>
                  {t('api.tokens')}
                </Text>
                {own.map(row)}
              </Card>
            ) : null}
          </>
        )}
      </Screen>

      {allowed && synced ? (
        <BottomActionBar>
          <Button size="large" label={t('api.create')} onPress={() => setNaming(true)} />
        </BottomActionBar>
      ) : null}

      <Sheet
        visible={naming}
        onClose={() => setNaming(false)}
        title={t('api.createTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            label={t('api.create')}
            disabled={name.trim() === '' || create.isPending}
            onPress={() => void submit()}
          />
        }
      >
        <Input
          label={t('api.tokenName')}
          placeholder={t('api.tokenNameHint')}
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
        <View style={{ gap: 8 }}>
          <Text variant="bodyS" muted>
            {t('api.scopeTitle')}
          </Text>
          <Segmented
            accessibilityLabel={t('api.scopeTitle')}
            options={[
              { value: 'write', label: t('api.scopeWrite') },
              { value: 'read', label: t('api.scopeRead') },
            ]}
            value={scope}
            onChange={setScope}
          />
          <Text variant="bodyS" muted>
            {t(scope === 'read' ? 'api.scopeReadHint' : 'api.scopeWriteHint')}
          </Text>
        </View>
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Sheet>

      <Sheet
        visible={made != null}
        onClose={() => setMade(null)}
        title={t('api.madeTitle')}
        closeLabel={t('common.close')}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              size="large"
              icon="copy"
              label={t('api.copyToken')}
              onPress={() => made && void copy(made)}
            />
            <Button
              variant="secondary"
              label={t('api.copyClaudeCode')}
              onPress={() => made && void copy(claudeCodeCommand(made))}
            />
          </View>
        }
      >
        <Text muted>{t('api.madeBody')}</Text>
        <Text variant="bodyS" selectable numeric>
          {made}
        </Text>
      </Sheet>
    </>
  );
}
