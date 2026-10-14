import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { FormHeader } from '@/components/ui/FormHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import type { LabelValues } from '@/domain/label';
import { parseDecimal } from '@/domain/numbers';
import type { Portion } from '@/domain/diet';
import { useFood, useSaveFood, type Food } from './foods';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import { usePlanStore } from '@/lib/plan';
import { aiReady, effectiveAiSettings } from '@/features/ai/included';
import { useAiSettings } from '@/features/ai/settings-store';
import { photographLabel, readLabel } from './label-photo';

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

/** Create your own food ("Mine"), or edit one when opened with `editId`. */
export function CreateFoodScreen() {
  const { t } = useTranslation();
  const { editId, photoUri, photoWidth } = useLocalSearchParams<{
    editId?: string;
    /** A photo of the label taken in the scanner: read first, then the form opens filled. */
    photoUri?: string;
    photoWidth?: string;
  }>();
  const food = useFood(editId);
  const plan = usePlanStore((s) => s.plan);
  const label = useQuery({
    queryKey: ['label-photo', photoUri],
    enabled: !!photoUri && !editId,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const settings = await loadedAiSettings();
      return readLabel(
        { uri: photoUri!, width: photoWidth ? Number(photoWidth) : undefined },
        effectiveAiSettings(settings, plan),
      );
    },
  });
  if (editId && !food.data) return <Screen>{null}</Screen>;
  if (photoUri && !editId && label.isPending)
    return (
      <Screen gap={12}>
        <ActivityIndicator />
        <Text muted style={{ textAlign: 'center' }}>
          {t('createFood.labelReading')}
        </Text>
      </Screen>
    );
  return (
    <FoodForm
      key={editId ?? 'new'}
      initial={editId ? food.data : undefined}
      prefill={label.data ?? null}
      prefillError={
        label.isError
          ? 'createFood.labelFailed'
          : label.isSuccess && !label.data
            ? 'createFood.labelUnreadable'
            : null
      }
    />
  );
}

/** The AI settings as saved (loaded from the device the first time). */
async function loadedAiSettings() {
  if (!useAiSettings.getState().loaded) await useAiSettings.getState().load();
  return useAiSettings.getState();
}

/** Whether the AI can read a label now; if not, says so (with a way to the AI settings). */
export function useLabelReader() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const plan = usePlanStore((s) => s.plan);
  return async (bottomOffset = 0) => {
    const settings = await loadedAiSettings();
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
function FoodForm({
  initial,
  prefill,
  prefillError,
}: {
  initial?: Food;
  prefill?: LabelValues | null;
  prefillError?: 'createFood.labelFailed' | 'createFood.labelUnreadable' | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const params = useLocalSearchParams<{
    meal?: string;
    day?: string;
    barcode?: string;
  }>();
  const save = useSaveFood();
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? prefill?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? prefill?.brand ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? params.barcode ?? '');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: text(initial?.per100.kcal ?? prefill?.per100.kcal),
    protein: text(initial?.per100.protein ?? prefill?.per100.protein),
    carbs: text(initial?.per100.carbs ?? prefill?.per100.carbs),
    sugars: text(initial?.per100.sugars ?? prefill?.per100.sugars),
    fat: text(initial?.per100.fat ?? prefill?.per100.fat),
    saturates: text(initial?.per100.saturates ?? prefill?.per100.saturates),
    fiber: text(initial?.per100.fiber ?? prefill?.per100.fiber),
    salt: text(initial?.per100.salt ?? prefill?.per100.salt),
  });
  const [portions, setPortions] = useState<{ label: string; grams: string }[]>(
    initial
      ? initial.servings.map((p) => ({ label: p.label, grams: String(p.grams) }))
      : prefill?.portion
        ? [{ label: prefill.portion.label, grams: String(prefill.portion.grams) }]
        : [],
  );
  const [error, setError] = useState<string | null>(() => (prefillError ? t(prefillError) : null));
  const [reading, setReading] = useState(false);
  const showToast = useToastStore((s) => s.show);
  const labelReader = useLabelReader();

  /** Photo of the nutrition table → the AI reads it → the form is filled (checked before Save). */
  const fillFromLabel = async () => {
    setError(null);
    const settings = await labelReader(barHeight);
    if (!settings) return;
    const photo = await photographLabel();
    if (!photo) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
          onPress={() => void fillFromLabel()}
        />
        <Input
          label={t('createFood.name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="sentences"
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('createFood.brand')}
              value={brand}
              onChangeText={setBrand}
              placeholder="—"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t('createFood.barcode')}
              value={barcode}
              onChangeText={(v) => setBarcode(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
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
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
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
    </>
  );
}
