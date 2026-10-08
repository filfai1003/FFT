import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import {
  mealForHour,
  meals,
  portionOptions,
  scaleNutrition,
  shareOfGoal,
  type Meal,
  type Per100,
} from '@/domain/diet';
import { useToday } from '@/features/profile/use-today';
import { useToastStore } from '@/lib/toast-store';
import { newId } from '@/lib/uuid';
import { useDayTarget } from './day-hooks';
import { useFood, type Food } from './foods';
import { useDayLog, useLogFood, useSetLogDeleted } from './log';
import { MealSheet } from './MealSheet';
import { addIngredient, useRecipeDraftStore } from './recipe-draft';
import { useRecipe } from './recipes';
import { goBack } from '@/lib/navigation';

/** One food or recipe: amount, nutrition, and add / save / remove. */
export function FoodDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const p = useLocalSearchParams<{
    foodId: string;
    kind?: string;
    logId?: string;
    meal?: string;
    day?: string;
    mode?: string;
  }>();
  const isRecipe = p.kind === 'recipe';
  const mode = p.mode === 'ingredient' ? 'ingredient' : 'log';
  const day = p.day ?? today;
  const editing = !!p.logId;

  const food = useFood(isRecipe ? undefined : p.foodId);
  const recipe = useRecipe(isRecipe ? p.foodId : undefined);
  const dayLog = useDayLog(day);
  const entry = editing ? dayLog.data?.find((e) => e.id === p.logId) : undefined;
  const target = useDayTarget(day);
  const logFood = useLogFood();
  const setDeleted = useSetLogDeleted();
  const patchRecipe = useRecipeDraftStore((s) => s.patch);
  const showToast = useToastStore((s) => s.show);

  const [meal, setMeal] = useState<Meal>(
    meals.includes((entry?.meal ?? p.meal) as Meal)
      ? ((entry?.meal ?? p.meal) as Meal)
      : mealForHour(new Date().getHours()),
  );
  const [mealSheet, setMealSheet] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);

  const per100: Per100 | null = food.data?.per100 ?? null;
  const recipeServing = recipe.data?.perServing;
  const loaded = isRecipe ? !!recipe.data : !!food.data;

  if (!loaded) return <Screen>{null}</Screen>;

  // Default amount: the saved entry, else the first named portion, else 100 g (1 serving of a recipe).
  const defaultAmount = isRecipe
    ? (entry?.servings ?? 1)
    : (entry?.grams ?? food.data!.servings[0]?.grams ?? 100);
  const value = amount ?? defaultAmount;

  const values = isRecipe
    ? {
        kcal: Math.round(recipeServing!.kcal * value),
        protein: Math.round(recipeServing!.protein * value),
        carbs: Math.round(recipeServing!.carbs * value),
        fat: Math.round(recipeServing!.fat * value),
      }
    : scaleNutrition(per100!, value);

  const name = isRecipe ? recipe.data!.name : food.data!.name;
  const mealName = t(`diet.meal.${meal}`).toLowerCase();
  const portions = isRecipe ? [] : portionOptions(food.data!.servings);
  const selectedPortion = portions.find((x) => x.grams === value);

  const save = async () => {
    if (mode === 'ingredient' && !isRecipe) {
      patchRecipe((d) => addIngredient(d, food.data as Food, value));
      const d = useRecipeDraftStore.getState().draft;
      router.dismissTo({
        pathname: '/recipe/[recipeId]',
        params: { recipeId: d && !d.isNew ? d.id : 'new' },
      });
      return;
    }
    const id = entry?.id ?? newId();
    await logFood.mutateAsync({
      id,
      day,
      meal,
      foodId: isRecipe ? null : food.data!.id,
      recipeId: isRecipe ? recipe.data!.id : null,
      name,
      quantityLabel: isRecipe ? t('diet.servingsLabel', { count: value }) : `${value} g`,
      grams: isRecipe ? null : value,
      servings: isRecipe ? value : null,
      macros: values,
    });
    if (editing) {
      goBack(router);
      return;
    }
    router.dismissTo('/diet');
    showToast({
      message: t('diet.addedTo', { name, meal: mealName }),
      actionLabel: t('common.undo'),
      onAction: () => setDeleted.mutate({ id, deleted: true }),
    });
  };

  const remove = () => {
    if (!entry) return;
    setDeleted.mutate({ id: entry.id, deleted: true });
    goBack(router);
    showToast({
      message: t('diet.removedFrom', { name, meal: mealName }),
      actionLabel: t('common.undo'),
      onAction: () => setDeleted.mutate({ id: entry.id, deleted: false }),
    });
  };

  const shares = [
    ['protein', values.protein, target?.protein ?? 0],
    ['carbs', values.carbs, target?.carbs ?? 0],
    ['fat', values.fat, target?.fat ?? 0],
  ] as const;

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <IconButton
            icon="chevronLeft"
            accessibilityLabel={t('common.back')}
            onPress={() => goBack(router)}
          />
          {mode === 'log' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('diet.toMeal', { meal: t(`diet.meal.${meal}`) })}. ${t('diet.changeMeal')}`}
              onPress={() => setMealSheet(true)}
              style={({ pressed }) => ({
                height: 44,
                paddingHorizontal: 14,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.borderControl,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="label">{t('diet.toMeal', { meal: t(`diet.meal.${meal}`) })}</Text>
              <Icon name="chevronDown" size={14} color={colors.text} />
            </Pressable>
          ) : (
            <View />
          )}
          <View style={{ width: 44 }} />
        </View>

        <View style={{ gap: 4 }}>
          <Text variant="titleM" accessibilityRole="header">
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!isRecipe && food.data!.verified ? (
              <View
                style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text }}
              />
            ) : null}
            <Text variant="label" muted>
              {isRecipe
                ? t('diet.yourRecipe')
                : food.data!.source === 'custom'
                  ? t('diet.yourFood')
                  : food.data!.verified
                    ? t('diet.verifiedOff')
                    : t('diet.fromOff')}
              {!isRecipe && food.data!.brand ? ` · ${food.data!.brand}` : ''}
            </Text>
          </View>
        </View>

        <Card gap={14}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text variant="displayL" numeric>
                {Math.round(values.kcal)}
              </Text>
              <Text variant="label" muted>
                {t('common.kcal')}
              </Text>
            </View>
            <Text variant="label" muted>
              {isRecipe
                ? t('diet.forServings', { count: value })
                : t('diet.forGrams', { g: value })}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              borderTopWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.borderDecorative,
              paddingTop: 12,
            }}
          >
            {shares.map(([key, grams, goal]) => (
              <View key={key} style={{ flex: 1, gap: 4 }}>
                <Text variant="label" muted>
                  {t(`diet.field.${key}`)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Text variant="displayS" numeric>
                    {Math.round(grams * 10) / 10}
                  </Text>
                  <Text variant="label" muted>
                    {'g'}
                  </Text>
                </View>
                {goal > 0 ? (
                  <Text variant="label" muted>
                    {t('diet.ofGoal', { pct: shareOfGoal(grams, goal) })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <Text variant="label" muted>
            {t('diet.amount')}
          </Text>
          {portions.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {portions.map((o) => (
                <Chip
                  key={o.label}
                  role="radio"
                  label={o.label}
                  selected={selectedPortion?.grams === o.grams}
                  onPress={() => setAmount(o.grams)}
                />
              ))}
              <Chip
                label={t('diet.custom')}
                role="radio"
                selected={!selectedPortion}
                onPress={() => undefined}
              />
            </View>
          ) : null}
          <Stepper
            variant="amount"
            value={value}
            onChange={setAmount}
            min={isRecipe ? 0.5 : 1}
            max={isRecipe ? 50 : 5000}
            step={isRecipe ? 0.5 : 10}
            unit={isRecipe ? t('diet.servingsUnit') : 'g'}
            valueLabel={t('diet.amountGrams')}
            decreaseLabel={t('diet.decreaseAmount')}
            increaseLabel={t('diet.increaseAmount')}
          />
        </View>

        {!isRecipe ? <NutritionTable per100={per100!} grams={value} /> : null}

        {editing && entry ? (
          <Button label={t('diet.removeEntry')} variant="danger" onPress={remove} />
        ) : null}
      </Screen>

      <BottomActionBar>
        <Button
          size="large"
          label={
            mode === 'ingredient'
              ? t('diet.addToRecipe')
              : editing
                ? t('diet.saveChanges')
                : t('diet.addToMeal', { meal: mealName })
          }
          disabled={logFood.isPending}
          onPress={save}
        />
      </BottomActionBar>
      <MealSheet
        visible={mealSheet}
        value={meal}
        onClose={() => setMealSheet(false)}
        onChange={setMeal}
      />
    </>
  );
}

function NutritionTable({ per100, grams }: { per100: Per100; grams: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  type NutrientKey =
    'energy' | 'protein' | 'carbs' | 'sugars' | 'fat' | 'saturates' | 'fiber' | 'salt';
  const row = (key: NutrientKey, v: number | null | undefined, unit: string, sub = false) => ({
    key,
    sub,
    a: v == null ? '—' : `${round(v)} ${unit}`,
    b: v == null ? '—' : `${round((v * grams) / 100)} ${unit}`,
  });
  const rows = [
    row('energy', per100.kcal, 'kcal'),
    row('protein', per100.protein, 'g'),
    row('carbs', per100.carbs, 'g'),
    row('sugars', per100.sugars, 'g', true),
    row('fat', per100.fat, 'g'),
    row('saturates', per100.saturates, 'g', true),
    row('fiber', per100.fiber, 'g'),
    row('salt', per100.salt, 'g'),
  ];
  return (
    <View accessibilityRole="summary">
      <View style={{ flexDirection: 'row', paddingBottom: 6 }}>
        <Text variant="label" muted style={{ flex: 1.4 }}>
          {t('diet.nutrition')}
        </Text>
        <Text variant="label" muted style={{ flex: 1, textAlign: 'right' }}>
          {t('diet.perGrams', { g: 100 })}
        </Text>
        <Text variant="label" muted style={{ flex: 1, textAlign: 'right' }}>
          {t('diet.perGrams', { g: round(grams) })}
        </Text>
      </View>
      {rows.map((r) => (
        <View
          key={r.key}
          style={{
            flexDirection: 'row',
            minHeight: 32,
            alignItems: 'center',
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.borderDecorative,
          }}
        >
          <Text
            variant="bodyS"
            style={{
              flex: 1.4,
              paddingLeft: r.sub ? 14 : 0,
              color: r.sub ? colors.textMuted : colors.text,
            }}
          >
            {t(`diet.nutrient.${r.key}`)}
          </Text>
          <Text variant="label" style={{ flex: 1, textAlign: 'right', letterSpacing: 0 }}>
            {r.a}
          </Text>
          <Text variant="label" style={{ flex: 1, textAlign: 'right', letterSpacing: 0 }}>
            {r.b}
          </Text>
        </View>
      ))}
    </View>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
