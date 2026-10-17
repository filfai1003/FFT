import '@/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { KeyboardProvider } from '@/components/ui/keyboard';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToastHost } from '@/components/ui/ToastHost';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { startAuthListener, useSessionStore } from '@/features/auth/session-store';
import { isOnboarded, useProfile } from '@/features/profile/api';
import { ConsentGate } from '@/features/profile/ConsentGate';
import { SyncChoiceScreen, WebSyncOffScreen } from '@/features/premium/ServerCopy';
import { usePlanGate } from '@/features/premium/use-plan-gate';
import { useSync } from '@/features/premium/use-sync';
import { getMode } from '@/lib/mode';
import { usePlanStore } from '@/lib/plan';
import { activeConsent, useConsents } from '@/features/profile/account';
import { usePendingSync } from '@/features/session/use-pending-sync';
import { useNotificationGuard } from '@/features/settings/use-notification-guard';
import { useSettingsSync } from '@/features/settings/use-settings-sync';
import { useAppFonts } from '@/design/fonts';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/design/use-theme';
import { updateOnLaunch } from '@/lib/app-update';
import { createQueryClient } from '@/lib/query-client';
import { WidgetBridge } from '@/features/widgets/WidgetBridge';
import { Platform } from 'react-native';
import { installErrorReporting, reportError } from '@/lib/error-report';
import type { ErrorBoundaryProps } from 'expo-router';

void SplashScreen.preventAutoHideAsync();
installErrorReporting();

/** A screen that crashed while drawing: reported, and the user can try again. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const [reported] = useState(() => {
    reportError(error, 'render');
    return true;
  });
  return (
    <Screen gap={16}>
      <Text variant="screenTitle">{t('app.crashTitle')}</Text>
      <Text muted>{reported ? t('app.crashBody') : null}</Text>
      <Button label={t('common.retry')} onPress={() => void retry()} />
    </Screen>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [queryClient] = useState(createQueryClient);
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    startAuthListener();
    // A newer version of the app (over the air) is picked up as soon as the app starts.
    void updateOnLaunch();
  }, []);

  if (!ready) return null;

  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <AppNavigator />
        <ToastHost />
      </QueryClientProvider>
    </KeyboardProvider>
  );
}

/**
 * First whether the account keeps a copy on the server (DECISIONS 62: a new account chooses; the
 * web app needs the copy), then the routes.
 */
function AppNavigator() {
  const { phase, retry } = usePlanGate();
  if (phase.kind === 'checking') return <Screen>{null}</Screen>;
  if (phase.kind === 'choose') return <SyncChoiceScreen onDone={retry} />;
  if (phase.kind === 'webOff') return <WebSyncOffScreen onRetry={retry} />;
  return <AppRoutes />;
}

/** Chooses what the user can reach: sign in, onboarding, or the app. */
function AppRoutes() {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const status = useSessionStore((s) => s.status);
  const profile = useProfile();
  useSettingsSync();
  useNotificationGuard(status === 'signedIn');
  const consents = useConsents();
  usePendingSync(status === 'signedIn');
  const signedIn = status === 'signedIn';
  const onboarded = isOnboarded(profile.data);
  // Health data consent withdrawn: the app cannot run, but the user can still export or delete.
  const consentWithdrawn =
    signedIn && onboarded && consents.isSuccess && !activeConsent(consents.data, 'health_data');
  // A copy on the server (DECISIONS 62): the device's changes go to the server in the background,
  // other devices' come back. Paused while the consent is withdrawn: nothing is sent then.
  const userId = useSessionStore((st) => st.userId);
  const syncing = usePlanStore(
    (p) => p.home === 'online' && p.sync === 'on' && p.userId === userId,
  );
  useSync(userId, signedIn && getMode() === 'cloud' && syncing, { paused: consentWithdrawn });

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

  if (consentWithdrawn) return <ConsentGate />;

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      {/* Android home screen widgets follow the data (DECISIONS 51). */}
      {Platform.OS === 'android' && signedIn && onboarded ? <WidgetBridge /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
          animationDuration: 160,
        }}
      >
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
          <Stack.Screen
            name="(modals)"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              animationDuration: 220,
            }}
          />
          <Stack.Screen name="session" options={{ gestureEnabled: false }} />
          <Stack.Screen name="profile" />
          <Stack.Screen name="ai-chat" />
          <Stack.Screen name="ai-chats" />
          <Stack.Screen name="add-water" options={{ animation: 'none' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
