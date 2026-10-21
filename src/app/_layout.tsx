import '@/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname } from 'expo-router';
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
import { AppLockGate } from '@/features/profile/AppLock';
import { useAppScreenPrivacy } from '@/features/profile/screen-privacy';
import { SyncChoiceScreen, WebSyncOffScreen } from '@/features/premium/ServerCopy';
import { VaultUnlockScreen } from '@/features/premium/Encryption';
import { RelayJoinScreen } from '@/features/premium/RelayCard';
import { askPairLater, askUnlockLater, usePlanGate } from '@/features/premium/use-plan-gate';
import { useRelay } from '@/features/premium/use-relay';
import { useConnectionNotice } from '@/features/premium/use-connection-notice';
import { useSync } from '@/features/premium/use-sync';
import { getMode } from '@/lib/mode';
import { usePlanStore } from '@/lib/plan';
import { activeConsent, consentOutdated, useConsents } from '@/features/profile/account';
import { useHealthConsentOnServer } from '@/features/profile/consent-server';
import { removeExportFiles } from '@/features/profile/export';
import { usePendingSync } from '@/features/session/use-pending-sync';
import { useNotificationGuard } from '@/features/settings/use-notification-guard';
import { useSettingsSync } from '@/features/settings/use-settings-sync';
import { useAppFonts } from '@/design/fonts';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/design/use-theme';
import { useStackOptions, useTransition } from '@/design/transitions';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { updateOnLaunch } from '@/lib/app-update';
import { createQueryClient } from '@/lib/query-client';
import { WidgetBridge } from '@/features/widgets/WidgetBridge';
import { ReminderBridge } from '@/features/reminders/ReminderBridge';
import { Platform } from 'react-native';
import { installErrorReporting, reportError, setErrorScreen } from '@/lib/error-report';
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
  // Error reports say on which screen they happened (route only, ids removed: DECISIONS 96).
  const pathname = usePathname();
  useEffect(() => setErrorScreen(pathname), [pathname]);
  // "Hide the whole app from screenshots" (DECISIONS 95).
  useAppScreenPrivacy();

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
    // Swipes between tabs and between exercises use react-native-gesture-handler (DECISIONS 70).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          {/* Optional app lock (DECISIONS 95): covers everything, the screens stay mounted. */}
          <AppLockGate>
            <AppNavigator />
            <ToastHost />
          </AppLockGate>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * First whether the account keeps a copy on the server (DECISIONS 62: a new account chooses; the
 * web app needs the copy), then the routes.
 */
function AppNavigator() {
  const { phase, retry } = usePlanGate();
  const userId = useSessionStore((s) => s.userId);
  if (phase.kind === 'checking') return <Screen>{null}</Screen>;
  if (phase.kind === 'choose') return <SyncChoiceScreen onDone={retry} />;
  if (phase.kind === 'webOff') return <WebSyncOffScreen onRetry={retry} />;
  if (phase.kind === 'pair' && userId) {
    const later = () => {
      askPairLater(userId);
      retry();
    };
    return <RelayJoinScreen onDone={later} onLater={later} />;
  }
  if (phase.kind === 'unlock')
    return (
      <VaultUnlockScreen
        onDone={retry}
        onLater={
          Platform.OS === 'web' || !userId
            ? undefined
            : () => {
                askUnlockLater(userId);
                retry();
              }
        }
      />
    );
  return <AppRoutes />;
}

/** Chooses what the user can reach: sign in, onboarding, or the app. */
function AppRoutes() {
  const { t } = useTranslation();
  const { mode } = useTheme();
  const rootOptions = useStackOptions('fade');
  const push = useTransition('push');
  const modal = useTransition('modal');
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
  // Given for an older consent text: asked once to confirm (DECISIONS 99). Continuing always works.
  const [reconfirmDone, setReconfirmDone] = useState(false);
  const reconfirm =
    signedIn && onboarded && consents.isSuccess && consentOutdated(consents.data) && !reconfirmDone;
  // A copy on the server (DECISIONS 62): the device's changes go to the server in the background,
  // other devices' come back. Paused while the consent is withdrawn: nothing is sent then.
  const userId = useSessionStore((st) => st.userId);
  // Export files left in the cache (they hold health data) go an hour after they were made.
  useEffect(() => {
    removeExportFiles({ olderThanMs: 60 * 60 * 1000 });
  }, []);
  // The server learns the consent directly (the sync is paused while it is withdrawn): the API,
  // MCP and AI apps stop too (DECISIONS 81).
  useHealthConsentOnServer(
    userId,
    signedIn && getMode() === 'cloud' && onboarded && consents.isSuccess,
    consentWithdrawn,
  );
  const syncing = usePlanStore(
    (p) => p.home === 'online' && p.sync === 'on' && p.userId === userId,
  );
  useSync(userId, signedIn && getMode() === 'cloud' && syncing, { paused: consentWithdrawn });
  // No copy on the server: paired phones exchange changes through the encrypted relay
  // (DECISIONS 65). Paused like the sync while the consent is withdrawn.
  // AI apps connected since the last start are pointed out once (DECISIONS 99).
  useConnectionNotice(userId, signedIn && getMode() === 'cloud' && onboarded && !consentWithdrawn);
  const copyOff = usePlanStore((p) => p.sync === 'off' && p.userId === userId);
  useRelay(
    userId,
    signedIn && getMode() === 'cloud' && copyOff && Platform.OS !== 'web' && !consentWithdrawn,
  );

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
  if (reconfirm) return <ConsentGate reconfirm onContinue={() => setReconfirmDone(true)} />;

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      {/* Android home screen widgets follow the data (DECISIONS 51). */}
      {Platform.OS === 'android' && signedIn && onboarded ? <WidgetBridge /> : null}
      {/* Smart reminders and the weekly summary follow the data (DECISIONS 122). */}
      {Platform.OS !== 'web' && signedIn && onboarded ? <ReminderBridge /> : null}
      {/* Switching between sign in, onboarding and the app fades; pages opened on top slide in
          from the right, forms and the workout rise from the bottom (DECISIONS 69). */}
      <Stack screenOptions={rootOptions}>
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
          <Stack.Screen name="(modals)" options={{ presentation: 'modal', ...modal }} />
          <Stack.Screen name="session" options={{ gestureEnabled: false, ...modal }} />
          <Stack.Screen name="profile" options={push} />
          <Stack.Screen name="ai-chat" options={push} />
          <Stack.Screen name="ai-chats" options={push} />
          <Stack.Screen name="add-water" options={{ animation: 'none' }} />
          {/* Home screen widget links (DECISIONS 68): they pass straight on to the right page. */}
          <Stack.Screen name="start-workout" options={{ animation: 'none' }} />
          <Stack.Screen name="ask" options={{ animation: 'none' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
