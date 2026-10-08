import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { usePrivacyStore } from '@/features/profile/privacy-store';
import { authenticate } from '@/lib/biometrics';
import { usePhotoUrl, type Photo, type Pose } from './data';

type Props = {
  photo?: Photo;
  pose: Pose;
  height: number;
  /** Tapping reveals a blurred photo (asking for the device lock when enabled). */
  interactive?: boolean;
  /** Always show it sharp (the compare screen, after you chose to look). */
  revealed?: boolean;
  label?: string;
};

/**
 * One progress photo: private, blurred until tapped (if "Blur photos" is on) and behind
 * Face ID / device code (if "Lock photos" is on). Without a photo: a dashed placeholder.
 */
export function PhotoTile({
  photo,
  pose,
  height,
  interactive = true,
  revealed = false,
  label,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const blur = usePrivacyStore((s) => s.blurPhotos);
  const lock = usePrivacyStore((s) => s.lockPhotos);
  const url = usePhotoUrl(photo?.path);
  const [shown, setShown] = useState(false);
  const isShown = revealed || shown || !blur;

  const reveal = async () => {
    if (!photo || isShown || !interactive) return;
    if (lock && !(await authenticate(t('photos.unlock')))) return;
    setShown(true);
  };

  const name = t(`photos.pose.${pose}`);
  // A non-interactive tile sits inside another button (Progress overview): no nested buttons.
  const Container = interactive ? Pressable : View;
  const pressProps = interactive
    ? { accessibilityRole: 'button' as const, disabled: !photo || isShown, onPress: reveal }
    : {};
  return (
    <Container
      {...pressProps}
      accessibilityLabel={
        photo
          ? `${name} ${t('photos.photo')}${label ? `, ${label}` : ''}${isShown ? '' : `, ${t('photos.hidden')}`}`
          : `${name}, ${t('photos.noPhoto')}`
      }
      style={{
        height,
        borderRadius: radius.tile + 2,
        borderWidth: 1,
        borderStyle: photo ? 'solid' : 'dashed',
        borderColor: photo ? colors.borderDecorative : colors.borderControl,
        backgroundColor: colors.surfaceSelected,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {photo && url.data ? (
        <Image
          source={{ uri: url.data }}
          contentFit="cover"
          blurRadius={isShown ? 0 : 40}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          accessible={false}
        />
      ) : null}
      {photo && !isShown ? <Icon name="lock" size={18} color={colors.text} /> : null}
      <View
        style={{
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 6,
          backgroundColor: photo ? colors.overlay : 'transparent',
        }}
      >
        <Text variant="label" style={{ color: photo ? colors.text : colors.textMuted }}>
          {name}
        </Text>
      </View>
    </Container>
  );
}
