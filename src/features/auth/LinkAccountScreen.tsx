import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { credentialProblems } from './api';
import { linkAccount } from './link-account';

/** Account-less mode -> an account: email and password, and every piece of data comes along. */
export function LinkAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const barHeight = useActionBarHeight();
  const showToast = useToastStore((s) => s.show);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = credentialProblems({ email, password });
  const shown = tried ? problems : [];

  const submit = async () => {
    setTried(true);
    setError(null);
    if (problems.length > 0 || busy) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof linkAccount>>;
    try {
      result = await linkAccount({ email, password }, queryClient);
    } catch {
      result = { ok: false, error: 'failed' };
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error === 'taken' ? t('link.taken') : (result.message ?? t('link.failed')));
      return;
    }
    showToast({ message: result.needsConfirmation ? t('link.confirm') : t('link.done') });
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
        <Text variant="screenTitle">{t('link.title')}</Text>
        <Text muted>{t('link.intro')}</Text>
        <Card gap={12}>
          <Input
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={shown.includes('email') ? t('auth.errorEmail') : undefined}
          />
          <Input
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={shown.includes('password') ? t('auth.errorPassword') : undefined}
            onSubmitEditing={() => void submit()}
          />
        </Card>
        <Text variant="bodyS" muted>
          {t('link.dataNote')}
        </Text>
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={busy ? t('link.working') : t('link.submit')}
          disabled={busy}
          onPress={() => void submit()}
        />
      </BottomActionBar>
    </>
  );
}
