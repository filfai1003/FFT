import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { credentialProblems, signIn, signUp } from './api';
import { ForgotPasswordSheet } from './ForgotPasswordSheet';
import { OfflineChoice } from './OfflineChoice';

type Mode = 'signIn' | 'signUp';

export function AuthScreen() {
  const { t } = useTranslation();
  const barHeight = useActionBarHeight();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [forgot, setForgot] = useState(false);

  const problems = credentialProblems({ email, password });
  const showEmailError = submitted && problems.includes('email');
  const showPasswordError = submitted && problems.includes('password');

  const submit = async () => {
    setSubmitted(true);
    setMessage(null);
    if (problems.length > 0) return;
    setBusy(true);
    try {
      if (mode === 'signIn') {
        const error = await signIn({ email, password });
        if (error) setMessage({ text: error, isError: true });
      } else {
        const result = await signUp({ email, password });
        if (result.error) setMessage({ text: result.error, isError: true });
        else if (result.needsConfirmation) {
          setMessage({ text: t('auth.confirmEmail'), isError: false });
          setMode('signIn');
        }
      }
    } catch (e) {
      // No server configured or no connection: say so instead of spinning forever.
      setMessage({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={20}>
        <View style={{ gap: 6, paddingTop: 24 }}>
          <Text variant="label" muted>
            {t('auth.kicker')}
          </Text>
          <Text variant="screenTitle">{t('auth.title')}</Text>
          <Text muted>{t('auth.tagline')}</Text>
        </View>

        <Segmented
          accessibilityLabel={t('auth.modeLabel')}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setMessage(null);
          }}
          options={[
            { value: 'signIn', label: t('auth.modeSignIn') },
            { value: 'signUp', label: t('auth.modeSignUp') },
          ]}
        />

        <Input
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={showEmailError ? t('auth.errorEmail') : undefined}
        />
        <Input
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          error={showPasswordError ? t('auth.errorPassword') : undefined}
          onSubmitEditing={submit}
        />

        {message ? (
          <Text
            variant="bodyS"
            accessibilityRole={message.isError ? 'alert' : 'text'}
            danger={message.isError}
          >
            {message.text}
          </Text>
        ) : null}

        {mode === 'signIn' ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Button label={t('auth.forgot.link')} variant="ghost" onPress={() => setForgot(true)} />
          </View>
        ) : null}

        {mode === 'signUp' ? (
          <Text variant="bodyS" muted>
            {t('auth.legal')}
          </Text>
        ) : null}

        <OfflineChoice />
      </Screen>

      <BottomActionBar>
        <Button
          label={mode === 'signIn' ? t('auth.continueSignIn') : t('auth.continueSignUp')}
          size="large"
          disabled={busy}
          onPress={submit}
        />
      </BottomActionBar>
      {forgot ? (
        <ForgotPasswordSheet initialEmail={email} onClose={() => setForgot(false)} />
      ) : null}
    </>
  );
}
