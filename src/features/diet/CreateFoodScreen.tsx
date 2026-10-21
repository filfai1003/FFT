import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { parseDecimal } from '@/domain/numbers';
import type { Portion } from '@/domain/diet';
import { useFood, useSaveFood, type Food } from './foods';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { usePlanStore } from '@/lib/plan';
import { aiReady, effectiveAiSettings } from '@/features/ai/included';
import { useAiSettings } from '@/features/ai/settings-store';
import { useAiConsent } from '@/features/ai/AiConsent';
import { Card } from '@/components/ui/Card';
import { CameraModal, type CapturedPhoto } from './CameraModal';
import { MacroValues } from './MacroValues';
import { readLabel } from './label-photo';

type FieldKey = 'kcal' | 'protein' | 'carbs' | 'sugars' | 'fat' | 'saturates' | 'fiber' | 'salt';
const fields: { key: FieldKey; unit: string; sub?: boolean; required?: boolean }[] = [
  { key: 'kcal', unit: 'kcal', required: true },
  { key: 'protein', unit: 'g', required: true },
  { key: 'carbs', unit: 'g', required: true },
  { key: 'sugars', unit: 'g', sub: true },
  { key: 'fat', unit: 'g', required: true },
  { key: 'saturates', unit: 'g', sub: true },
  { key: 'fiber', unit: 'g' },
  { key: 'salt', unit: 'g' },
];

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * The typed values at a glance (DECISIONS 112): the macros in their colours and, when the
 * calories they bring (4 / 4 / 9 kcal per gram) are far from the energy typed, a quiet hint to
 * check the label: a typo shows before the food is saved. Never blocks saving.
 */
export function LabelCheck({
  kcal,
  protein,
  carbs,
  fat,
}: {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}) {
  const { t } = useTranslation();
  if (protein == null && carbs == null && fat == null) return null;
  const macros = { protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  const fromMacros = Math.round(macros.protein * 4 + macros.carbs * 4 + macros.fat * 9);
  const off = kcal != null && kcal > 0 && Math.abs(fromMacros - kcal) > Math.max(20, kcal * 0.2);
  return (
    <Card size="small" gap={8}>
      <MacroValues macros={macros} />
      {off ? (
        <Text variant="bodyS" muted accessibilityRole="alert">
          {t('createFood.macrosMismatch', { macros: fromMacros, kcal: Math.round(kcal) })}
        </Text>
      ) : null}
    </Card>
  );
}

/** Create your own food ("Mine"), or edit one when opened with `editId`. */
export function CreateFoodScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const food = useFood(editId);
  if (editId && !food.data) return <Screen>{null}</Screen>;
  return <FoodForm key={editId ?? 'new'} initial={editId ? food.data : undefined} />;
}

/** The AI settings as saved (loaded from the device the first time). */
async function loadedAiSettings() {
  if (!useAiSettings.getState().loaded) await useAiSettings.getState().load();
  return useAiSettings.getState();
}

/**
 * Whether the AI can read a label now: the settings to use, or null (and a message with a way to
 * the AI coach settings).
 */
export function useLabelReader() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const plan = usePlanStore((s) => s.plan);
  const { consent } = useAiConsent();
  return async (bottomOffset = 0) => {
    const settings = await loadedAiSettings();
    // The photo goes to the AI coach's model: only after the user agreed to it (DECISIONS 66).
    if (aiReady(settings, plan) && !consent) {
      showToast({
        message: t('createFood.labelNeedsConsent'),
        actionLabel: t('createFood.labelAiSettings'),
        onAction: () => router.push('/profile/ai'),
        bottomOffset,
      });
      return null;
    }
    if (aiReady(settings, plan)) return effectiveAiSettings(settings, plan);
    showToast({
      message: t('createFood.labelNeedsAi'),
      actionLabel: t('createFood.labelAiSettings'),
      onAction: () => router.push('/profile/ai'),
      bottomOffset,
    });
    return null;
  };
}

/** Per 100 g from the label, optional portions and barcode. */
function FoodForm({ initial }: { initial?: Food }) {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const params = useLocalSearchParams<{
    meal?: string;
    day?: string;
    barcode?: string;
    /** '1' = from the scanner's "Photograph the label": the camera opens right away. */
    capture?: string;
  }>();
  const save = useSaveFood();
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? params.barcode ?? '');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: text(initial?.per100.kcal),
    protein: text(initial?.per100.protein),
    carbs: text(initial?.per100.carbs),
    sugars: text(initial?.per100.sugars),
    fat: text(initial?.per100.fat),
    saturates: text(initial?.per100.saturates),
    fiber: text(initial?.per100.fiber),
    salt: text(initial?.per100.salt),
  });
  const [portions, setPortions] = useState<{ label: string; grams: string }[]>(
    (initial?.servings ?? []).map((p) => ({ label: p.label, grams: String(p.grams) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  /** The app's camera over the form: a label photo, or a barcode. */
  const [camera, setCamera] = useState<'photo' | 'barcode' | null>(() =>
    params.capture === '1' && !initial ? 'photo' : null,
  );
  const showToast = useToastStore((s) => s.show);
  const labelReader = useLabelReader();

  const openLabelCamera = async () => {
    setError(null);
    if (await labelReader(barHeight)) setCamera('photo');
  };

  /** Photo of the nutrition table → the AI reads it → the form is filled (checked before Save). */
  const fillFromLabel = async (photo: CapturedPhoto) => {
    setCamera(null);
    const settings = await labelReader(barHeight);
    if (!settings) return;
    setReading(true);
    try {
      const v = await readLabel(photo, settings);
      if (!v) {
        setError(t('createFood.labelUnreadable'));
        return;
      }
      if (v.name) setName((n) => n.trim() || v.name!);
      if (v.brand) setBrand((b) => b.trim() || v.brand!);
      setValues((old) => {
        const next = { ...old };
        for (const k of Object.keys(v.per100) as FieldKey[])
          if (v.per100[k] != null) next[k] = text(v.per100[k]);
        return next;
      });
      if (v.portion)
        setPortions((p) =>
          p.length ? p : [{ label: v.portion!.label, grams: String(v.portion!.grams) }],
        );
      showToast({ message: t('createFood.labelFilled'), bottomOffset: barHeight });
    } catch {
      setError(t('createFood.labelFailed'));
    } finally {
      setReading(false);
    }
  };

  const num = (k: FieldKey) => parseDecimal(values[k]);
  const valid =
    name.trim().length > 0 && fields.filter((f) => f.required).every((f) => num(f.key) != null);

  const submit = async () => {
    if (!valid) return;
    setError(null);
    try {
      const id = await save.mutateAsync({
        id: initial?.id,
        name,
        brand,
        barcode,
        per100: {
          kcal: num('kcal')!,
          protein: num('protein')!,
          carbs: num('carbs')!,
          fat: num('fat')!,
          sugars: num('sugars'),
          saturates: num('saturates'),
          fiber: num('fiber'),
          salt: num('salt'),
        },
        portions: portions.flatMap<Portion>((p) => {
          const g = parseDecimal(p.grams);
          return p.label.trim() && g ? [{ label: p.label.trim(), grams: g }] : [];
        }),
      });
      if (editing) {
        goBack(router);
        return;
      }
      router.replace({
        pathname: '/food/[foodId]',
        params: { foodId: id, meal: params.meal, day: params.day },
      });
    } catch {
      // A sentence that says how to fix it, not the database's message (DECISIONS 124).
      setError(t('forms.saveFailed'));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={16}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={editing ? t('createFood.editTitle') : t('createFood.title')}
        />
        <Button
          variant="secondary"
          icon="camera"
          label={reading ? t('createFood.labelReading') : t('createFood.labelPhoto')}
          disabled={reading}
          onPress={() => void openLabelCamera()}
        />
        <Input
          label={t('createFood.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('createFood.namePlaceholder')}
          autoCapitalize="sentences"
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('createFood.brand')}
              value={brand}
              onChangeText={setBrand}
              placeholder={t('forms.optional')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label={t('createFood.barcode')}
                  value={barcode}
                  onChangeText={(v) => setBarcode(v.replace(/\D/g, ''))}
                  placeholder={t('forms.optional')}
                  keyboardType="number-pad"
                />
              </View>
              <IconButton
                icon="barcode"
                accessibilityLabel={t('createFood.scanBarcode')}
                onPress={() => setCamera('barcode')}
              />
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="bodyS" muted>
            {t('createFood.nutrition')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {fields.map((f) => (
              <View key={f.key} style={{ width: '48.5%' }}>
                <Input
                  variant="compact"
                  label={`${t(`diet.nutrient.${f.key === 'kcal' ? 'energy' : f.key}`)} (${f.unit})`}
                  value={values[f.key]}
                  onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </View>
          <LabelCheck
            kcal={num('kcal')}
            protein={num('protein')}
            carbs={num('carbs')}
            fat={num('fat')}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="bodyS" muted>
            {t('createFood.portions')}
          </Text>
          {portions.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 2 }}>
                <Input
                  accessibilityLabel={t('createFood.portionName')}
                  placeholder={t('createFood.portionPlaceholder')}
                  value={p.label}
                  onChangeText={(v) =>
                    setPortions((s) => s.map((x, j) => (j === i ? { ...x, label: v } : x)))
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  variant="compact"
                  accessibilityLabel={t('createFood.portionGrams')}
                  placeholder="g"
                  value={p.grams}
                  onChangeText={(v) =>
                    setPortions((s) => s.map((x, j) => (j === i ? { ...x, grams: v } : x)))
                  }
                  keyboardType="decimal-pad"
                />
              </View>
              <IconButton
                icon="trash"
                accessibilityLabel={t('createFood.removePortion')}
                onPress={() => setPortions((s) => s.filter((_, j) => j !== i))}
              />
            </View>
          ))}
          <Button
            variant="secondary"
            label={t('createFood.addPortion')}
            onPress={() => setPortions((s) => [...s, { label: '', grams: '' }])}
          />
        </View>

        <Text variant="bodyS" muted>
          {t('createFood.privacy')}
        </Text>
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={editing ? t('createFood.saveChanges') : t('createFood.save')}
          disabled={!valid || save.isPending}
          onPress={submit}
        />
      </BottomActionBar>
      <CameraModal
        mode={camera}
        onClose={() => setCamera(null)}
        onPhoto={(photo) => void fillFromLabel(photo)}
        onCode={(code) => {
          setBarcode(code.replace(/\D/g, ''));
          setCamera(null);
        }}
      />
    </>
  );
}
