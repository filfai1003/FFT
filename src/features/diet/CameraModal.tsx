import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { confirm } from '@/lib/haptics';

export type CapturedPhoto = { uri: string; width?: number };

/**
 * The app's own camera, full screen, over the page that opened it (no system camera app):
 * `photo` = a shutter (and the photo library) for a label; `barcode` = reads a barcode and closes.
 * Same look as the barcode scanner and the check-in camera.
 */
export function CameraModal({
  mode,
  onClose,
  onPhoto,
  onCode,
}: {
  mode: 'photo' | 'barcode' | null;
  onClose: () => void;
  onPhoto?: (photo: CapturedPhoto) => void;
  onCode?: (code: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  const shoot = async () => {
    if (busy || !camera.current) return;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) onPhoto?.({ uri: picture.uri, width: picture.width });
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) onPhoto?.({ uri: asset.uri, width: asset.width });
  };

  return (
    <Modal
      visible={mode != null}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => (done.current = false)}
      statusBarTranslucent
    >
      <Screen gap={16}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={onClose} />
          <Text variant="label" muted>
            {mode === 'barcode' ? t('scanner.title') : t('createFood.labelCameraTitle')}
          </Text>
          <IconButton
            icon="info"
            accessibilityLabel={torch ? t('scanner.torchOff') : t('scanner.torchOn')}
            onPress={() => setTorch((v) => !v)}
          />
        </View>

        <View
          accessibilityLabel={t('scanner.cameraView')}
          style={{
            flex: 1,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: colors.borderDecorative,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceAlt,
          }}
        >
          {permission?.granted ? (
            <CameraView
              ref={camera}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              facing="back"
              enableTorch={torch}
              {...(mode === 'barcode'
                ? {
                    barcodeScannerSettings: { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] },
                    onBarcodeScanned: ({ data }: { data: string }) => {
                      if (done.current) return;
                      done.current = true;
                      confirm();
                      onCode?.(data);
                    },
                  }
                : {})}
            />
          ) : (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Text muted style={{ textAlign: 'center' }}>
                {mode === 'barcode' ? t('scanner.needCamera') : t('createFood.labelNeedCamera')}
              </Text>
              <Button
                label={t('scanner.allowCamera')}
                block={false}
                onPress={() => void requestPermission()}
              />
            </View>
          )}
        </View>

        {mode === 'photo' ? (
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
              onPress={() => void fromLibrary()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('photos.shutter')}
              disabled={!permission?.granted || busy}
              onPress={() => void shoot()}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                borderWidth: 3,
                borderColor: colors.text,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: permission?.granted && !busy ? 1 : 0.4,
              }}
            >
              <View
                style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.text }}
              />
            </Pressable>
            <View style={{ width: 110 }} />
          </View>
        ) : null}
      </Screen>
    </Modal>
  );
}
