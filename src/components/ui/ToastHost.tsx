import { useEffect, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { TOAST_DURATION_MS, useToastStore } from '@/lib/toast-store';
import { Text } from './Text';

/**
 * Renders the current toast: surfaceRaised pill pinned above the bottom bar, text + action
 * (UNDO), gone after 5 s. Mount once, at the root, after the navigator.
 */
export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const runAction = useToastStore((s) => s.runAction);
  const dismiss = useToastStore((s) => s.dismiss);
  const { colors, reduceMotion } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  const id = toast?.id;
  const duration = toast?.durationMs ?? TOAST_DURATION_MS;

  useEffect(() => {
    if (id == null) return;
    if (reduceMotion) opacity.setValue(1);
    else Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => dismiss(id), duration);
    return () => {
      clearTimeout(timer);
      opacity.setValue(0);
    };
  }, [id, duration, dismiss, opacity, reduceMotion]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space.screenX,
        right: space.screenX,
        bottom: bottom + (toast.bottomOffset ?? 0) + space.gapM,
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
        }}
      >
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
