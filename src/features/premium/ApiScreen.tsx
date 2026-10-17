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
import { usePlanStore } from '@/lib/plan';
import { useBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { ConnectAiButtons } from './ConnectAiButtons';
import {
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
  const goBack = useBack('/profile');
  const barHeight = useActionBarHeight();
  const showToast = useToastStore((s) => s.show);
  // Every account (DECISIONS 47); the account-less mode has no server account to connect.
  const allowed = usePlanStore((s) => s.userId != null);
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

  const revoke = (id: string, tokenName: string) =>
    setRevoked.mutate(
      { id, revoked: true },
      {
        onSuccess: () =>
          showToast({
            message: t('api.revoked', { name: tokenName }),
            actionLabel: t('common.undo'),
            onAction: () => setRevoked.mutate({ id, revoked: false }),
            bottomOffset: barHeight,
          }),
      },
    );

  const address = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" muted>
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

  return (
    <>
      <Screen scroll bottomBarHeight={allowed ? barHeight + 24 : 24} gap={14}>
        <TopBar onBack={goBack} backLabel={t('common.back')} />
        <Text variant="screenTitle">{t('api.title')}</Text>

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
            <Card gap={10}>
              <Text variant="label" muted>
                {t('api.connectTitle')}
              </Text>
              <ConnectAiButtons />
            </Card>

            <Card size="small" gap={0}>
              {address(t('api.mcpAddress'), MCP_URL)}
              <View style={{ borderTopWidth: 1, borderColor: colors.borderDecorative }} />
              {address(t('api.restAddress'), REST_URL)}
            </Card>

            {tokens.data?.length ? (
              <Card size="small" gap={0}>
                <Text variant="label" muted style={{ paddingBottom: 4 }}>
                  {t('api.tokens')}
                </Text>
                {tokens.data.map((tok, i) => (
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
                        {`${tok.prefix}… · ${t(
                          tok.scope === 'read' ? 'api.scopeRead' : 'api.scopeWrite',
                        )} · ${
                          tok.lastUsedAt
                            ? t('api.lastUsed', { date: date(tok.lastUsedAt) })
                            : t('api.neverUsed')
                        }`}
                      </Text>
                    </View>
                    <Button
                      label={t('api.revoke')}
                      block={false}
                      variant="secondary"
                      onPress={() => revoke(tok.id, tok.name)}
                    />
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </Screen>

      {allowed ? (
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
          <Text variant="label" muted>
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
