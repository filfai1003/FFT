import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { useSessionStore } from '@/features/auth/session-store';
import { activeConsent, useConsents, useSetConsent } from '@/features/profile/account';
import { usePlanStore } from '@/lib/plan';
import {
  AI_CATEGORIES,
  NO_ACCESS,
  useAiAccess,
  useAiAccessStore,
  type AiAccess,
  type AiCategory,
} from './access';
import { effectiveAiSettings } from './included';
import { useAiSettings } from './settings-store';

/**
 * The AI coach consent (DECISIONS 66): `consent` is the one in force, or null. `loaded` is false
 * while the consents are being read (then nothing may be sent either).
 */
export function useAiConsent() {
  const consents = useConsents();
  return {
    loaded: consents.isSuccess,
    consent: activeConsent(consents.data, 'ai_coach'),
  };
}

/** The four "what the coach can see" switches. */
function AccessRows({
  value,
  onChange,
}: {
  value: AiAccess;
  onChange: (category: AiCategory, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View>
      {AI_CATEGORIES.map((c, i) => (
        <View
          key={c}
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTopWidth: i === 0 ? 0 : 1,
            borderColor: colors.borderDecorative,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyS">{t(`ai.access.${c}`)}</Text>
            <Text variant="bodyS" muted>
              {t(`ai.access.${c}Detail`)}
            </Text>
          </View>
          <Toggle
            value={value[c]}
            onValueChange={(on) => onChange(c, on)}
            accessibilityLabel={t(`ai.access.${c}`)}
          />
        </View>
      ))}
    </View>
  );
}

/** "What the coach can see", saved at once (AI coach settings). */
export function AiAccessCard() {
  const { t } = useTranslation();
  const userId = useSessionStore((s) => s.userId);
  const access = useAiAccess();
  const set = useAiAccessStore((s) => s.set);
  if (!userId) return null;
  return (
    <Card size="small" gap={4}>
      <Text variant="bodyS" muted>
        {t('ai.access.title')}
      </Text>
      <Text variant="bodyS" muted>
        {t('ai.access.detail')}
      </Text>
      <AccessRows value={access} onChange={(c, on) => set(userId, c, on)} />
    </Card>
  );
}

/** Where the coach's requests go, in plain words, for the provider in use. */
function useWhere(): string {
  const { t } = useTranslation();
  const settings = useAiSettings();
  const plan = usePlanStore((s) => s.plan);
  const s = effectiveAiSettings(settings, plan);
  if (s.provider === 'included') return t('ai.consent.whereIncluded');
  let provider = t('ai.providerAnthropic');
  if (s.provider !== 'anthropic')
    try {
      provider = new URL(s.baseUrl.trim()).host;
    } catch {
      provider = t('ai.providerOpenai');
    }
  return t('ai.consent.whereOwn', { provider });
}

/**
 * The consent screen shown before the coach is used for the first time: what is sent, where, and
 * what the coach may see (all off). Two choices, neither preselected; nothing is sent before
 * "I agree". The consent is recorded like the health data consent (consents table, timestamp).
 */
export function AiConsentCard({ onDecline }: { onDecline: () => void }) {
  const { t } = useTranslation();
  const userId = useSessionStore((s) => s.userId);
  const setConsent = useSetConsent();
  const setAll = useAiAccessStore((s) => s.setAll);
  const current = useAiAccess();
  const [draft, setDraft] = useState<AiAccess>(() => ({ ...NO_ACCESS, ...current }));
  const [error, setError] = useState<string | null>(null);
  const where = useWhere();

  const agree = async () => {
    if (!userId) return;
    setError(null);
    try {
      setAll(userId, draft);
      await setConsent.mutateAsync({ type: 'ai_coach', granted: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card gap={12}>
      <Text variant="titleM">{t('ai.consent.title')}</Text>
      <Text>{t('ai.consent.intro')}</Text>
      <Text>{where}</Text>
      <Text>{t('ai.consent.what')}</Text>
      <Text>{t('ai.consent.health')}</Text>
      <Text>{t('ai.consent.anonymous')}</Text>
      <Text>{t('ai.consent.noTraining')}</Text>
      <View style={{ gap: 4 }}>
        <Text variant="bodyS" muted>
          {t('ai.access.title')}
        </Text>
        <AccessRows value={draft} onChange={(c, on) => setDraft((d) => ({ ...d, [c]: on }))} />
      </View>
      <Text variant="bodyS" muted>
        {t('ai.consent.later')}
      </Text>
      {error ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        variant="secondary"
        label={t('ai.consent.agree')}
        disabled={setConsent.isPending || !userId}
        onPress={() => void agree()}
      />
      <Button variant="secondary" label={t('ai.consent.decline')} onPress={onDecline} />
    </Card>
  );
}

/**
 * AI coach settings: the consent screen until the user has agreed, then what the coach can see
 * and when the consent was given.
 */
export function AiPrivacySection({ onDecline }: { onDecline: () => void }) {
  const { t } = useTranslation();
  const { loaded, consent } = useAiConsent();
  if (!loaded) return null;
  if (!consent) return <AiConsentCard onDecline={onDecline} />;
  const date = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(consent.grantedAt));
  return (
    <View style={{ gap: 8 }}>
      <AiAccessCard />
      <Text variant="bodyS" muted>
        {t('ai.consent.given', { date })}
      </Text>
    </View>
  );
}
