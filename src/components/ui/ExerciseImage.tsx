import { Image } from 'expo-image';
import { View } from 'react-native';
import { useTheme } from '@/design/use-theme';
import { Icon } from './Icon';

export type ExerciseImageProps = {
  /**
   * Square image (512×512 PNG): a URL, or an image bundled with the app (the number `require()`
   * returns: on Android release builds a bundled image has no URL). Without it the dashed
   * placeholder tile is shown.
   */
  uri?: string | number | null;
  size?: number;
};

/**
 * Square exercise tile, radius 28% of the size. Decorative: the exercise name next to it is
 * what screen readers announce.
 */
export function ExerciseImage({ uri, size = 52 }: ExerciseImageProps) {
  const { colors } = useTheme();
  const hasImage = !!uri;
  return (
    <View
      testID="exercise-image"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        // The pictures have a transparent background (tools/exercise-images/transparent.mjs): they
        // sit on the neutral tile of the theme, never on a black square.
        backgroundColor: hasImage ? colors.surfaceAlt : colors.surfaceSelected,
        borderWidth: 1,
        borderStyle: hasImage ? 'solid' : 'dashed',
        borderColor: hasImage ? colors.exerciseBorder : colors.exerciseBorderEmpty,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {hasImage ? (
        <Image
          // A bundled image is a number on devices and an object on the web: pass it as it is.
          source={typeof uri === 'string' ? { uri } : uri}
          contentFit="cover"
          style={{ width: '100%', height: '100%' }}
          accessible={false}
        />
      ) : (
        <Icon name="image" size={Math.round(size * 0.4)} color={colors.textPlaceholderIcon} />
      )}
    </View>
  );
}
