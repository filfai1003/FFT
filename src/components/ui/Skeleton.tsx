import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';

const native = Platform.OS !== 'web';

/**
 * A grey placeholder block standing where content will appear (DECISIONS 109). Static on its own:
 * put the blocks of one loading area in a `SkeletonGroup`, which pulses them together.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  round = false,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  /** A circle (avatars, icon tiles) or a pill instead of a rounded block. */
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID="skeleton"
      aria-hidden
      style={[
        {
          width,
          height,
          borderRadius: round ? height / 2 : Math.min(8, height / 2),
          // The empty-track grey: darker than the card in light, lighter than it in dark.
          backgroundColor: colors.dotOff,
        },
        style,
      ]}
    />
  );
}

/**
 * Wraps the placeholders of one loading area: one soft pulse for all of them (still with reduce
 * motion) and one name for screen readers ("Loading"), so they do not read empty boxes.
 */
export function SkeletonGroup({
  accessibilityLabel,
  children,
  gap = 14,
  style,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion } = useTheme();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const half = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: 700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: native,
      });
    const loop = Animated.loop(Animated.sequence([half(0.55), half(1)]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      aria-busy
      style={[{ gap, opacity: pulse }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** A card-shaped placeholder: an optional tile and title line, then `lines` text lines. */
export function SkeletonCard({
  lines = 2,
  tile = true,
  height,
}: {
  lines?: number;
  tile?: boolean;
  /** A fixed height for a big block (chart, photos) under the title. */
  height?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderDecorative,
        borderRadius: radius.card,
        padding: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {tile ? <Skeleton width={40} height={40} style={{ borderRadius: 13 }} /> : null}
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="35%" height={12} />
        </View>
      </View>
      {height ? <Skeleton height={height} style={{ borderRadius: 12 }} /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={12} />
      ))}
    </View>
  );
}

/** List-row placeholders (60 high, like ListRow): a square on the left and two lines. */
export function SkeletonRows({ count = 3, leading = true }: { count?: number; leading?: boolean }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          {leading ? <Skeleton width={40} height={40} style={{ borderRadius: 10 }} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={`${70 - (i % 3) * 12}%`} height={14} />
            <Skeleton width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}
