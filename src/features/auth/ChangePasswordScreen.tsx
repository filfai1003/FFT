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
import { changePassword, MIN_PASSWORD_LENGTH } from './api';

/** Profile -> Password: also how a temporary password from the admin gets replaced. */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const showToast = useToastStore((s) => s.show);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length < MIN_PASSWORD_LENGTH;
  const mismatch = repeat !== next;
  const same = next.length > 0 && next === current;

  const submit = async () => {
    setTried(true);
    setError(null);
    if (busy || current.length === 0 || tooShort || mismatch || same) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof changePassword>>;
    try {
      result = await changePassword(current, next);
    } catch {
      result = 'failed';
    }
    setBusy(false);
    if (result === null) {
      showToast({ message: t('password.done') });
      goBack(router, '/profile');
    } else if (result === 'wrongCurrent') setError(t('password.wrongCurrent'));
    else setError(t('password.failed'));
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <TopBar onBack={() => goBack(router, '/profile')} backLabel={t('common.back')} />
        <Text variant="screenTitle">{t('password.title')}</Text>
        <Card gap={12}>
          <Input
            label={t('password.current')}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <Input
            label={t('password.next')}
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={
              tried && tooShort
                ? t('auth.errorPassword')
                : tried && same
                  ? t('password.same')
                  : undefined
            }
          />
          <Input
            label={t('password.repeat')}
            value={repeat}
            onChangeText={setRepeat}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={tried && mismatch ? t('password.mismatch') : undefined}
            onSubmitEditing={() => void submit()}
          />
        </Card>
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={busy ? t('password.saving') : t('password.save')}
          disabled={busy}
          onPress={() => void submit()}
        />
      </BottomActionBar>
    </>
  );
}
