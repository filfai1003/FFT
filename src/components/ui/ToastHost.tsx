import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { TOAST_DURATION_MS, useBottomBars, useToastStore } from '@/lib/toast-store';
import { useTabBarHeight } from './TabBar';
import { Text } from './Text';

/**
 * Renders the current toast: surfaceRaised pill pinned above the bottom bar, text + action
 * (UNDO), gone after 5 s. Mount once, at the root, after the navigator. It sits just above the
 * page's bottom bar, the same everywhere (DECISIONS 123): a BottomActionBar on screen, else the
 * tab bar when a tab page is shown (`overTabs`), else the safe area.
 */
export function ToastHost({ overTabs = false }: { overTabs?: boolean }) {
  const toast = useToastStore((s) => s.toast);
  const runAction = useToastStore((s) => s.runAction);
  const dismiss = useToastStore((s) => s.dismiss);
  const { colors, reduceMotion } = useTheme();
  const { bottom, top } = useSafeAreaInsets();
  const tabBar = useTabBarHeight();
  const bars = useBottomBars((s) => s.heights);
  const barOffset = bars.length > 0 ? bars[bars.length - 1]! : overTabs ? tabBar : 0;
  const [opacity] = useState(() => new Animated.Value(0));
  // The time left to undo, drained by a thin line along the bottom of the toast.
  const [left] = useState(() => new Animated.Value(1));

  const id = toast?.id;
  const duration = toast?.durationMs ?? TOAST_DURATION_MS;

  useEffect(() => {
    if (id == null) return;
    if (reduceMotion) opacity.setValue(1);
    else Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    left.setValue(1);
    const drain = Animated.timing(left, {
      toValue: 0,
      duration,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    if (!reduceMotion) drain.start();
    const timer = setTimeout(() => dismiss(id), duration);
    return () => {
      clearTimeout(timer);
      drain.stop();
      opacity.setValue(0);
    };
  }, [id, duration, dismiss, opacity, left, reduceMotion]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space.screenX,
        right: space.screenX,
        ...(toast.placement === 'top'
          ? { top: top + space.gapM }
          : { bottom: (toast.bottomOffset ?? barOffset) || bottom }),
        marginBottom: toast.placement === 'top' ? 0 : space.gapM,
        opacity,
      }}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: touch.listRowMin,
          paddingLeft: 18,
          paddingRight: 6,
          borderRadius: 16,
          backgroundColor: colors.text,
          overflow: 'hidden',
        }}
      >
        {/* An undo toast shows how long is left (not with reduce motion: a still line says nothing). */}
        {toast.actionLabel && !reduceMotion ? (
          <Animated.View
            testID="toast-time-left"
            aria-hidden
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: 3,
              backgroundColor: colors.bg,
              opacity: 0.45,
              width: left.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        ) : null}
        <Text variant="bodyS" style={{ flex: 1, color: colors.bg }}>
          {toast.message}
        </Text>
        {toast.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            onPress={() => runAction(toast.id)}
            style={({ pressed }) => ({
              minWidth: touch.minTarget,
              minHeight: touch.minTarget,
              paddingHorizontal: 12,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="body" style={{ color: colors.bg, fontWeight: '700' }}>
              {toast.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
