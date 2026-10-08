import '@/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToastHost } from '@/components/ui/ToastHost';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { startAuthListener, useSessionStore } from '@/features/auth/session-store';
import { isOnboarded, useProfile } from '@/features/profile/api';
import { useSettingsSync } from '@/features/settings/use-settings-sync';
import { useAppFonts } from '@/design/fonts';
import { color } from '@/design/tokens';
import { createQueryClient } from '@/lib/query-client';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [queryClient] = useState(createQueryClient);
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    startAuthListener();
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AppNavigator />
      <ToastHost />
    </QueryClientProvider>
  );
}

/** Chooses what the user can reach: sign in, onboarding, or the app. */
function AppNavigator() {
  const { t } = useTranslation();
  const status = useSessionStore((s) => s.status);
  const profile = useProfile();
  useSettingsSync();

  const signedIn = status === 'signedIn';
  const onboarded = isOnboarded(profile.data);

  if (status === 'loading' || (signedIn && profile.isPending)) return <Screen>{null}</Screen>;

  if (signedIn && profile.isError) {
    return (
      <Screen gap={16}>
        <Text variant="screenTitle">{t('app.loadErrorTitle')}</Text>
        <Text muted>{t('app.loadErrorBody')}</Text>
        <Button label={t('common.retry')} onPress={() => void profile.refetch()} />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Protected guard={status === 'unconfigured'}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
