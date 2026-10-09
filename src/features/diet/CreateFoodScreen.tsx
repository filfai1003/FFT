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
import { useSaveFood } from './foods';
import { goBack } from '@/lib/navigation';

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

/** Create your own food ("Mine"): per 100 g from the label, optional portions and barcode. */
export function CreateFoodScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const params = useLocalSearchParams<{
    meal?: string;
    day?: string;
    barcode?: string;
  }>();
  const save = useSaveFood();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: '',
    protein: '',
    carbs: '',
    sugars: '',
    fat: '',
    saturates: '',
    fiber: '',
    salt: '',
  });
  const [portions, setPortions] = useState<{ label: string; grams: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const num = (k: FieldKey) => parseDecimal(values[k]);
  const valid =
    name.trim().length > 0 && fields.filter((f) => f.required).every((f) => num(f.key) != null);

  const submit = async () => {
    if (!valid) return;
    setError(null);
    try {
      const id = await save.mutateAsync({
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
          title={t('createFood.title')}
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
          label={t('createFood.save')}
          disabled={!valid || save.isPending}
          onPress={submit}
        />
      </BottomActionBar>
    </>
  );
}
