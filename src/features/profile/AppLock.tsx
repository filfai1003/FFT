import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { unlockApp } from '@/lib/biometrics';
import { usePrivacyStore } from './privacy-store';

/** The app was away long enough for the lock to ask again (exported for tests). */
export function lockDue(backgroundAt: number | null, now: number, afterMin: number): boolean {
  return backgroundAt != null && now - backgroundAt >= afterMin * 60_000;
}

/**
 * Optional app lock (Settings › Phone privacy, DECISIONS 95): asks for fingerprint, face or the
 * device code when the app starts and when it comes back after `lockAfterMin` minutes in the
 * background. The screens underneath stay mounted (a workout in progress keeps running) but are
 * covered and hidden from screen readers. Never a lock-out: a device without any lock left lets the
 * user in (`unlockApp`), and a cancelled prompt leaves an Unlock button to try again. Phones only.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') return <>{children}</>;
  return <NativeAppLock>{children}</NativeAppLock>;
}

function NativeAppLock({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const enabled = usePrivacyStore((s) => s.appLock);
  // Until the settings are read from storage it is not known whether to lock: cover, then decide.
  const [locked, setLocked] = useState<boolean | null>(() =>
    usePrivacyStore.persist.hasHydrated() ? usePrivacyStore.getState().appLock : null,
  );
  const [failed, setFailed] = useState(false);
  const backgroundAt = useRef<number | null>(null);
  const asking = useRef(false);

  useEffect(
    () =>
      usePrivacyStore.persist.onFinishHydration((s) =>
        setLocked((now) => (now === null ? s.appLock : now)),
      ),
    [],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // The fingerprint / device code screen itself sends the app to the background.
      if (asking.current) return;
      if (state === 'background') {
        backgroundAt.current = Date.now();
      } else if (state === 'active') {
        const s = usePrivacyStore.getState();
        if (s.appLock && lockDue(backgroundAt.current, Date.now(), s.lockAfterMin)) {
          setFailed(false);
          setLocked(true);
        }
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const showLock = locked === true && enabled;
  const cover = locked === null;

  const unlock = async () => {
    if (asking.current) return;
    asking.current = true;
    const result = await unlockApp(t('appLock.reason'));
    asking.current = false;
    backgroundAt.current = null;
    if (result === 'passed') setLocked(false);
    else setFailed(true);
  };

  // Ask as soon as the lock shows; after a cancel, only the button asks again.
  useEffect(() => {
    if (!showLock || failed) return;
    const id = setTimeout(() => void unlock(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLock]);

  return (
    <>
      <View style={{ flex: 1 }} aria-hidden={showLock || cover}>
        {children}
      </View>
      {cover ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} /> : null}
      {showLock ? (
        <View
          accessibilityViewIsModal
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.bg,
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
              paddingHorizontal: 24,
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
            },
          ]}
        >
          <Icon name="lock" size={40} color={colors.text} />
          <Text variant="screenTitle" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {t('appLock.title')}
          </Text>
          <Text muted style={{ textAlign: 'center' }}>
            {t('appLock.body')}
          </Text>
          <View style={{ alignSelf: 'stretch', paddingTop: 8 }}>
            <Button size="large" label={t('appLock.unlock')} onPress={() => void unlock()} />
          </View>
        </View>
      ) : null}
    </>
  );
}
