import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useToastStore } from '@/lib/toast-store';
import { hasGoogle, linkGoogle } from './google';

/**
 * Accounts made with email and password, still signed in: signing in is with Google only now.
 * If Google's email differs from this account's, linking it here keeps the same account (and
 * data) for the next sign-in. Hidden once Google is linked (or the email already matched).
 */
export function LinkGoogleCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const linked = useQuery({ queryKey: ['auth', 'google-linked'], queryFn: hasGoogle });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (linked.data !== false) return null;

  const link = async () => {
    setBusy(true);
    setError(false);
    try {
      const r = await linkGoogle();
      if (r.ok) {
        showToast({ message: t('profile.google.done') });
        await queryClient.invalidateQueries({ queryKey: ['auth', 'google-linked'] });
      } else if (!r.cancelled) setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card gap={10}>
      <Text variant="titleM">{t('profile.google.title')}</Text>
      <Text variant="bodyS" muted>
        {t('profile.google.body')}
      </Text>
      {error ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {t('profile.google.failed')}
        </Text>
      ) : null}
      <Button label={t('profile.google.button')} disabled={busy} onPress={() => void link()} />
    </Card>
  );
}
