import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { isValidEmail, requestPasswordReset } from './api';

/**
 * Forgot password: the request goes to the admin, who emails a temporary password by hand (no
 * email service). The same answer whether the email has an account or not.
 */
export function ForgotPasswordSheet({
  initialEmail,
  onClose,
}: {
  initialEmail: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badEmail = !isValidEmail(email);

  const send = async () => {
    setTried(true);
    setError(null);
    if (badEmail || busy) return;
    setBusy(true);
    try {
      await requestPasswordReset(email, note);
      setSent(true);
    } catch {
      setError(t('auth.forgot.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('auth.forgot.title')}
      closeLabel={t('common.close')}
      footer={
        sent ? (
          <Button size="large" label={t('common.close')} onPress={onClose} />
        ) : (
          <Button
            size="large"
            label={busy ? t('auth.forgot.sending') : t('auth.forgot.send')}
            disabled={busy}
            onPress={() => void send()}
          />
        )
      }
    >
      {sent ? (
        <Text accessibilityRole="alert">{t('auth.forgot.sent')}</Text>
      ) : (
        <View style={{ gap: 14 }}>
          <Text muted>{t('auth.forgot.body')}</Text>
          <Input
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            error={tried && badEmail ? t('auth.errorEmail') : undefined}
          />
          <Input
            label={t('auth.forgot.note')}
            value={note}
            onChangeText={setNote}
            maxLength={300}
            onSubmitEditing={() => void send()}
          />
          {error ? (
            <Text variant="bodyS" danger accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
