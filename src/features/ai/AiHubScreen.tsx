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
import { creditPercent, effectiveAiSettings, fetchAiCredit, useAiCredit } from './included';
import { hasAiKey, useAiSettings, type AiProvider, type AiSettings } from './settings-store';
import { usePlanStore } from '@/lib/plan';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/design/use-theme';
import { View } from 'react-native';
import { AiPrivacySection } from './AiConsent';

/**
 * AI coach settings. Premium comes first (the coach with no key, the point of the page); your own
 * key and the manual copy-and-paste mode stay available below.
 */
export function AiHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = useBack('/profile/settings');
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
  // Your own key is a second choice: folded away unless one is saved (or the user opens it).
  const [ownKeyOpen, setOwnKeyOpen] = useState(false);
  const ownKey = ownKeyOpen || hasAiKey(stored);

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={goBack} backLabel={t('common.back')} />
      <Text variant="screenTitle">{t('ai.title')}</Text>

      <IncludedCard />

      <AiPrivacySection
        onDecline={() => showToast({ message: t('ai.consent.declined'), bottomOffset: barHeight })}
      />

      {!ownKey ? (
        <Button
          label={t('ai.ownKeyToggle')}
          variant="secondary"
          icon="sliders"
          onPress={() => setOwnKeyOpen(true)}
        />
      ) : (
        <Card gap={12}>
          <Text variant="label" muted>
            {t('ai.keyTitle')}
          </Text>
          <Segmented
            accessibilityLabel={t('ai.provider')}
            value={value.provider === 'included' ? 'anthropic' : value.provider}
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
          <Button
            label={t('common.save')}
            variant="secondary"
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
      )}

      <Button
        label={t('ai.openManual')}
        variant="ghost"
        icon="copy"
        onPress={() => router.push('/profile/ai-manual')}
      />
    </Screen>
  );
}

/** Premium: the AI included in the plan and the credit left. Other plans: where to get it. */
function IncludedCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const plan = usePlanStore((s) => s.plan);
  const settings = useAiSettings();
  const credit = useAiCredit((s) => s.credit);

  useEffect(() => {
    if (plan === 'premium') void fetchAiCredit();
  }, [plan]);

  if (plan !== 'premium')
    return (
      <Card gap={14} style={{ borderWidth: 2, borderColor: colors.borderSelected }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <Text variant="label" muted>
            {t('premium.plan.premium')}
          </Text>
          <Text variant="label" numeric>
            {t('premium.comingSoon')}
          </Text>
        </View>
        <Text variant="displayS">{t('ai.premiumTitle')}</Text>
        <View style={{ gap: 8 }}>
          {(['perkNoKey', 'perkCredit', 'perkData'] as const).map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="check" size={18} color={colors.text} />
              <Text style={{ flex: 1 }}>{t(`ai.${k}`)}</Text>
            </View>
          ))}
        </View>
        <Button
          size="large"
          label={t('ai.getPremium')}
          onPress={() => router.push('/profile/premium')}
        />
      </Card>
    );

  const inUse = effectiveAiSettings(settings, plan).provider === 'included';
  return (
    <Card gap={10}>
      <Text variant="label" muted>
        {t('ai.includedTitle')}
      </Text>
      <Text variant="titleM" numeric>
        {credit
          ? t('ai.creditLeft', {
              percent: creditPercent(credit.balanceMicros, credit.monthlyMicros),
            })
          : '—'}
      </Text>
      {credit ? (
        <Text variant="bodyS" muted>
          {t('ai.creditRule', {
            cap: creditPercent(credit.capMicros, credit.monthlyMicros),
            date: credit.nextGrant ?? '',
          })}
        </Text>
      ) : null}
      {inUse ? null : (
        <Button
          label={t('ai.useIncluded')}
          variant="secondary"
          onPress={() =>
            void settings.save({
              provider: 'included',
              apiKey: settings.apiKey,
              model: settings.model,
              baseUrl: settings.baseUrl,
            })
          }
        />
      )}
    </Card>
  );
}
