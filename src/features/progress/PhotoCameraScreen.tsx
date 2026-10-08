import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { goBack } from '@/lib/navigation';
import { poses, usePhotos, usePhotoUrl, type Pose } from './data';
import { usePhotoDraft } from './photo-draft';

/** Camera for a check-in photo, with a faint outline of the last photo of the same pose. */
export function PhotoCameraScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { pose: poseParam } = useLocalSearchParams<{ pose: string }>();
  const pose: Pose = (poses as string[]).includes(poseParam) ? (poseParam as Pose) : 'front';
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const setPhoto = usePhotoDraft((s) => s.set);
  const photos = usePhotos();
  const previous = photos.data?.find((p) => p.pose === pose);
  const previousUrl = usePhotoUrl(previous?.path);

  const keep = async (uri: string) => {
    const small = await ImageManipulator.ImageManipulator.manipulate(uri)
      .resize({ width: 1080 })
      .renderAsync();
    const saved = await small.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.85,
    });
    setPhoto(pose, saved.uri);
    goBack(router, '/check-in');
  };

  const shoot = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) await keep(picture.uri);
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) await keep(result.assets[0].uri);
  };

  return (
    <Screen gap={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          icon="close"
          accessibilityLabel={t('common.close')}
          onPress={() => goBack(router, '/check-in')}
        />
        <Text variant="label" muted>
          {t('photos.cameraTitle', { pose: t(`photos.pose.${pose}`) })}
        </Text>
        <IconButton
          icon="swap"
          accessibilityLabel={t('photos.flip')}
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        />
      </View>

      <View
        style={{
          flex: 1,
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.borderDecorative,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {permission?.granted ? (
          <>
            <CameraView
              ref={camera}
              facing={facing}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {previousUrl.data ? (
              <Image
                source={{ uri: previousUrl.data }}
                contentFit="cover"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.22,
                }}
                accessible={false}
                pointerEvents="none"
              />
            ) : null}
          </>
        ) : (
          <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
            <Text muted style={{ textAlign: 'center' }}>
              {t('photos.needCamera')}
            </Text>
            <Button
              label={t('scanner.allowCamera')}
              block={false}
              onPress={() => void requestPermission()}
            />
          </View>
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
        }}
      >
        <Button
          label={t('photos.library')}
          variant="secondary"
          block={false}
          onPress={fromLibrary}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('photos.shutter')}
          disabled={!permission?.granted || busy}
          onPress={shoot}
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            borderWidth: 3,
            borderColor: colors.text,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: permission?.granted ? 1 : 0.4,
          }}
        >
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.text }} />
        </Pressable>
        <View style={{ width: 110 }} />
      </View>
    </Screen>
  );
}
