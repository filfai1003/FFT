import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { confirm } from '@/lib/haptics';
import type { Food } from './foods';
import { useLabelReader } from './CreateFoodScreen';
import { lookupBarcode } from './off';
import { goBack } from '@/lib/navigation';

type State =
  | { kind: 'scanning' }
  | { kind: 'looking'; code: string }
  | { kind: 'found'; code: string; food: Food }
  | { kind: 'missing'; code: string };

/** Point the camera at a barcode (or type it): our database first, then Open Food Facts. */
export function ScannerScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [state, setState] = useState<State>({ kind: 'scanning' });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const busy = useRef(false);
  const labelReader = useLabelReader();

  /** Not found: New food opens on the app's camera; the label photo fills the form (barcode kept). */
  const photoLabel = async (code: string) => {
    if (!(await labelReader())) return;
    setState({ kind: 'scanning' });
    router.replace({ pathname: '/food/new', params: { ...next, barcode: code, capture: '1' } });
  };

  const handle = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    confirm();
    setState({ kind: 'looking', code });
    const food = await lookupBarcode(code);
    setState(food ? { kind: 'found', code, food } : { kind: 'missing', code });
    busy.current = false;
  };

  const next = { meal: params.meal, day: params.day };

  return (
    <>
      <Screen gap={20} style={{ backgroundColor: '#050505' }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton
            icon="close"
            accessibilityLabel={t('scanner.close')}
            onPress={() => goBack(router)}
          />
          <Text variant="label" style={{ color: colors.textMuted }}>
            {t('scanner.title')}
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
            height: 330,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: colors.borderDecorative,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
          }}
        >
          {permission?.granted ? (
            <CameraView
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={
                state.kind === 'scanning' ? ({ data }) => void handle(data) : undefined
              }
            />
          ) : (
            <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
              <Text muted style={{ textAlign: 'center' }}>
                {t('scanner.needCamera')}
              </Text>
              <Button
                label={t('scanner.allowCamera')}
                block={false}
                onPress={() => void requestPermission()}
              />
            </View>
          )}
          {permission?.granted ? <Frame /> : null}
        </View>

        <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
          {t('scanner.hint')}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('scanner.typeCode')}
              variant="secondary"
              onPress={() => setTyping(true)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('scanner.createInstead')}
              variant="secondary"
              onPress={() => router.replace({ pathname: '/food/new', params: next })}
            />
          </View>
        </View>
      </Screen>

      <Sheet
        visible={state.kind !== 'scanning'}
        onClose={() => setState({ kind: 'scanning' })}
        title={
          state.kind === 'found'
            ? state.food.name
            : state.kind === 'missing'
              ? t('scanner.notFound')
              : t('scanner.looking')
        }
        closeLabel={t('common.close')}
        footer={
          state.kind === 'found' ? (
            <Button
              size="large"
              label={t('scanner.chooseAmount')}
              onPress={() => {
                const food = state.food;
                setState({ kind: 'scanning' });
                router.replace({
                  pathname: '/food/[foodId]',
                  params: { foodId: food.id, ...next },
                });
              }}
            />
          ) : state.kind === 'missing' ? (
            <View style={{ gap: 8 }}>
              <Button
                size="large"
                icon="camera"
                label={t('scanner.photoLabel')}
                onPress={() => void photoLabel(state.code)}
              />
              <Button
                variant="secondary"
                label={t('scanner.createFood')}
                onPress={() =>
                  router.replace({
                    pathname: '/food/new',
                    params: { ...next, barcode: state.code },
                  })
                }
              />
            </View>
          ) : undefined
        }
      >
        {state.kind !== 'scanning' ? (
          <Text variant="bodyS" muted>
            {t('scanner.found', { code: state.code })}
          </Text>
        ) : null}
        {state.kind === 'found' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyS" muted>
              {t('diet.per100', {
                p: state.food.per100.protein,
                c: state.food.per100.carbs,
                f: state.food.per100.fat,
              })}
            </Text>
            <Text variant="displayM" numeric>
              {Math.round(state.food.per100.kcal)}
            </Text>
          </View>
        ) : null}
        {state.kind === 'missing' ? <Text muted>{t('scanner.notFoundBody')}</Text> : null}
      </Sheet>

      <Sheet
        visible={typing}
        onClose={() => setTyping(false)}
        title={t('scanner.typeCode')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            label={t('scanner.search')}
            disabled={typed.length < 6}
            onPress={() => {
              setTyping(false);
              void handle(typed);
            }}
          />
        }
      >
        <Input
          label={t('createFood.barcode')}
          value={typed}
          onChangeText={(v) => setTyped(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          autoFocus
        />
      </Sheet>
    </>
  );
}

function Frame() {
  const corner = { position: 'absolute' as const, width: 28, height: 28, borderColor: '#FFFFFF' };
  return (
    <View style={{ width: 270, height: 160 }} pointerEvents="none">
      <View style={{ ...corner, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }} />
      <View style={{ ...corner, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }} />
      <View style={{ ...corner, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }} />
      <View style={{ ...corner, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }} />
    </View>
  );
}
