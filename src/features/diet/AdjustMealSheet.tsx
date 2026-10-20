import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { formatInt, parseDecimal } from '@/domain/numbers';
import { checkAsPlanned, mealForPosition } from '@/domain/diet';
import { useTheme } from '@/design/use-theme';
import { touch } from '@/design/tokens';
import { useSetCheck, type FixedMeal, type StoredCheck } from './fixed';
import { MacroValues } from './MacroValues';

type Choice = 'planned' | 'different' | 'foods' | 'skipped';

type Props = { meal: FixedMeal | null; day: string; check?: StoredCheck; onClose: () => void };

/** "Adjust a meal": ate it as planned / a different amount / log the foods / skipped. Today only. */
export function AdjustMealSheet({ meal, day, check, onClose }: Props) {
  // Remount per meal so the form always starts from that meal's values.
  return meal ? (
    <Body key={`${meal.id}-${day}`} meal={meal} day={day} check={check} onClose={onClose} />
  ) : null;
}

function Body({ meal, day, check, onClose }: Props & { meal: FixedMeal }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const setCheck = useSetCheck();
  const initial = check?.status === 'adjusted' ? check : meal;
  const [choice, setChoice] = useState<Choice>(
    check?.status === 'adjusted'
      ? 'different'
      : check?.status === 'skipped'
        ? 'skipped'
        : 'planned',
  );
  const [values, setValues] = useState({
    kcal: String(Math.round('kcal' in initial ? initial.kcal : 0)),
    protein: String(Math.round(initial.proteinG)),
    carbs: String(Math.round(initial.carbsG)),
    fat: String(Math.round(initial.fatG)),
  });

  const num = (s: string) => Math.max(0, parseDecimal(s) ?? 0);

  const save = async () => {
    if (choice === 'planned') {
      await setCheck.mutateAsync({ day, mealId: meal.id, check: checkAsPlanned(meal) });
    } else if (choice === 'different') {
      await setCheck.mutateAsync({
        day,
        mealId: meal.id,
        check: {
          status: 'adjusted',
          kcal: Math.round(num(values.kcal)),
          proteinG: num(values.protein),
          carbsG: num(values.carbs),
          fatG: num(values.fat),
        },
      });
    } else if (choice === 'skipped') {
      await setCheck.mutateAsync({
        day,
        mealId: meal.id,
        check: { status: 'skipped', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      });
    } else {
      // The foods you log replace the planned meal for today: it is marked handled with 0 kcal.
      await setCheck.mutateAsync({
        day,
        mealId: meal.id,
        check: { status: 'skipped', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      });
      onClose();
      router.push({
        pathname: '/food-search',
        params: { meal: mealForPosition(meal.position), day },
      });
      return;
    }
    onClose();
  };

  const option = (value: Choice, label: string, body?: ReactNode) => {
    const selected = choice === value;
    return (
      <View
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        style={{
          borderRadius: 16,
          // Selection = 2px border in the text colour (as everywhere).
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.borderSelected : colors.borderDecorative,
          backgroundColor: selected ? colors.surfaceSelected : colors.surfaceAlt,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => setChoice(value)}
          style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: selected ? 5 : 1,
              borderColor: selected ? colors.borderSelected : colors.borderControl,
            }}
          />
          <Text variant="body">{label}</Text>
        </Pressable>
        {selected && body ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>{body}</View>
        ) : null}
      </View>
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={meal.name}
      closeLabel={t('common.close')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            size="large"
            label={t('diet.saveForToday')}
            disabled={setCheck.isPending}
            onPress={save}
          />
          <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
            {t('diet.onlyToday')}
          </Text>
        </View>
      }
    >
      {/* What was planned, at a glance: the kcal big and the macros in their colours. */}
      <View style={{ gap: 6 }}>
        <Text variant="bodyS" muted>
          {t('diet.planned')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="displayS" numeric>
            {formatInt(meal.kcal)}
          </Text>
          <Text variant="bodyS" muted>
            {t('common.kcal')}
          </Text>
        </View>
        <MacroValues macros={{ protein: meal.proteinG, carbs: meal.carbsG, fat: meal.fatG }} />
      </View>
      <View
        style={{ gap: 8 }}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('diet.whatDidYouEat')}
      >
        {option('planned', t('diet.atePlanned'))}
        {option(
          'different',
          t('diet.ateDifferent'),
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <View key={k} style={{ flex: 1 }}>
                <Input
                  variant="compact"
                  label={t(`diet.field.${k}`)}
                  value={values[k]}
                  onChangeText={(v) => setValues((s) => ({ ...s, [k]: v }))}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>
            ))}
          </View>,
        )}
        {option('foods', t('diet.logFoodsInstead'))}
        {option('skipped', t('diet.skippedMeal'))}
      </View>
      <View style={{ minHeight: touch.minTarget }} />
    </Sheet>
  );
}
