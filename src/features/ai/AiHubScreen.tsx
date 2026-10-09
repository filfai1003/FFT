import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { hasAiKey, useAiSettings, type AiProvider, type AiSettings } from './settings-store';

/** AI plans: the chat with your own AI key, the manual copy-and-paste mode, and the key settings. */
export function AiHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = useBack('/profile');
  const barHeight = useTabBarHeight();
  const stored = useAiSettings();
  const showToast = useToastStore((s) => s.show);
  const [draft, setDraft] = useState<AiSettings | null>(null);

  useEffect(() => {
    if (!stored.loaded) void stored.load();
  }, [stored]);

  const value: AiSettings = draft ?? {
    provider: stored.provider,
    apiKey: stored.apiKey,
    model: stored.model,
    baseUrl: stored.baseUrl,
  };
  const patch = (p: Partial<AiSettings>) => setDraft({ ...value, ...p });
  const canSave =
    hasAiKey(value) &&
    value.model.trim() !== '' &&
    (value.provider === 'anthropic' || /^https?:\/\//.test(value.baseUrl.trim()));

  const switchProvider = (provider: AiProvider) => patch({ provider, model: '' });

  return (
    <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
      <TopBar onBack={goBack} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('ai.title')}</Text>
      <Text muted>{t('ai.intro')}</Text>

      <Card gap={10}>
        <Text variant="label" muted>
          {t('ai.manualCardTitle')}
        </Text>
        <Text variant="bodyS" muted>
          {t('ai.manualCardBody')}
        </Text>
        <Button
          label={t('ai.openManual')}
          variant="secondary"
          onPress={() => router.push('/profile/ai-manual')}
        />
      </Card>

      <Card gap={12}>
        <Text variant="label" muted>
          {t('ai.keyTitle')}
        </Text>
        <Segmented
          accessibilityLabel={t('ai.provider')}
          value={value.provider}
          onChange={switchProvider}
          options={[
            { value: 'anthropic', label: t('ai.providerAnthropic') },
            { value: 'openai', label: t('ai.providerOpenai') },
          ]}
        />
        <Input
          label={t('ai.apiKey')}
          value={value.apiKey}
          onChangeText={(apiKey) => patch({ apiKey })}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('ai.apiKeyPlaceholder')}
        />
        <Input
          label={t('ai.model')}
          value={value.model}
          onChangeText={(model) => patch({ model })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('ai.modelPlaceholder')}
        />
        {value.provider === 'openai' ? (
          <Input
            label={t('ai.baseUrl')}
            value={value.baseUrl}
            onChangeText={(baseUrl) => patch({ baseUrl })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        ) : null}
        <Text variant="bodyS" muted>
          {t('ai.privacyNote')}
        </Text>
        <Button
          label={t('common.save')}
          disabled={!canSave || draft == null}
          onPress={async () => {
            await stored.save(draft ?? value);
            setDraft(null);
            showToast({ message: t('ai.saved'), bottomOffset: barHeight });
          }}
        />
        {hasAiKey(stored) ? (
          <Button
            label={t('ai.removeKey')}
            variant="danger"
            onPress={async () => {
              await stored.clear();
              setDraft(null);
              showToast({ message: t('ai.removed'), bottomOffset: barHeight });
            }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}
