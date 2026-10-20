import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DotBar } from '@/components/ui/DotBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { radius } from '@/design/tokens';
import { VerifiedTick } from './VerifiedTick';
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
import { useSessionStore } from '@/features/auth/session-store';
import { useToday } from '@/features/profile/use-today';
import { useToastStore } from '@/lib/toast-store';
import { newId } from '@/lib/uuid';
import { useDayTarget } from './day-hooks';
import { useFood, useSetFoodDeleted } from './foods';
import { useDayLog, useLogFood, useSetLogDeleted } from './log';
import { MealSheet } from './MealSheet';
import { goBack } from '@/lib/navigation';

/** One food: amount, nutrition, and add / save / remove. */
export function FoodDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const p = useLocalSearchParams<{
    foodId: string;
    logId?: string;
    meal?: string;
    day?: string;
  }>();
  const day = p.day ?? today;
  const editing = !!p.logId;

  const food = useFood(p.foodId);
  const dayLog = useDayLog(day);
  const entry = editing ? dayLog.data?.find((e) => e.id === p.logId) : undefined;
  const target = useDayTarget(day);
  const logFood = useLogFood();
  const setDeleted = useSetLogDeleted();
  const showToast = useToastStore((s) => s.show);
  const setFoodDeleted = useSetFoodDeleted();
  const userId = useSessionStore((s) => s.userId);

  const [meal, setMeal] = useState<Meal>(
    meals.includes((entry?.meal ?? p.meal) as Meal)
      ? ((entry?.meal ?? p.meal) as Meal)
      : mealForHour(new Date().getHours()),
  );
  const [mealSheet, setMealSheet] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);

  if (!food.data)
    return (
      <Screen gap={14}>
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('common.back')}
          onPress={() => goBack(router)}
        />
        {food.isError ? (
          <EmptyState icon="search" area="nutrition" title={t('diet.foodMissing')} />
        ) : (
          <SkeletonGroup accessibilityLabel={t('common.loading')}>
            <Skeleton width="70%" height={24} />
            <Skeleton height={170} style={{ borderRadius: radius.card }} />
            <Skeleton height={48} style={{ borderRadius: radius.pill }} />
          </SkeletonGroup>
        )}
      </Screen>
    );
  const per100: Per100 = food.data.per100;

  // Default amount: the saved entry, else the first named portion, else 100 g.
  const value = amount ?? entry?.grams ?? food.data.servings[0]?.grams ?? 100;
  const values = scaleNutrition(per100, value);
  const name = food.data.name;
  const mealName = t(`diet.meal.${meal}`).toLowerCase();
  const portions = portionOptions(food.data.servings);
  const selectedPortion = portions.find((x) => x.grams === value);

  const save = async () => {
    const id = entry?.id ?? newId();
    await logFood.mutateAsync({
      id,
      day,
      meal,
      foodId: food.data.id,
      name,
      quantityLabel: `${value} g`,
      grams: value,
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

  const isMine = food.data.source === 'custom' && food.data.ownerId === userId;
  const deleteFood = () => {
    const id = food.data.id;
    setFoodDeleted.mutate({ id, deleted: true });
    goBack(router);
    showToast({
      message: t('diet.foodDeleted', { name }),
      actionLabel: t('common.undo'),
      onAction: () => setFoodDeleted.mutate({ id, deleted: false }),
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
          <View style={{ width: 44 }} />
        </View>

        <View style={{ gap: 4 }}>
          <Text variant="titleM" accessibilityRole="header">
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {food.data.verified ? <VerifiedTick /> : null}
            <Text variant="bodyS" muted>
              {food.data.source === 'custom'
                ? t('diet.yourFood')
                : food.data.source === 'ciqual'
                  ? t('diet.fromCiqual')
                  : food.data.verified
                    ? t('diet.verifiedOff')
                    : t('diet.fromOff')}
              {food.data.brand ? ` · ${food.data.brand}` : ''}
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
              <Text variant="bodyS" muted>
                {t('common.kcal')}
              </Text>
            </View>
            <Text variant="bodyS" muted>
              {t('diet.forGrams', { g: value })}
            </Text>
          </View>
          {/* One tinted tile per macro in its colour (canvas "Food detail"); with a target, a bar
              fills with this portion's share of the day's goal. */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {shares.map(([key, grams, goal]) => (
              <View
                key={key}
                style={{
                  flex: 1,
                  gap: 6,
                  borderRadius: radius.row,
                  backgroundColor: colors.macroSoft[key],
                  padding: 10,
                }}
              >
                <Text variant="bodyS" semibold style={{ color: colors.macroInk[key] }}>
                  {t(`diet.macro.${key}`)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Text variant="displayS" numeric>
                    {Math.round(grams * 10) / 10}
                  </Text>
                  <Text variant="bodyS" muted>
                    {'g'}
                  </Text>
                </View>
                {goal > 0 ? (
                  <>
                    <DotBar
                      total={goal}
                      on={grams}
                      size={6}
                      color={colors.macroSplit[key]}
                      track={colors.surface}
                      accessibilityLabel={`${t(`diet.macro.${key}`)}, ${t('diet.ofGoal', {
                        pct: shareOfGoal(grams, goal),
                      })}`}
                    />
                    <Text variant="label" semibold numeric style={{ color: colors.macroInk[key] }}>
                      {t('diet.ofGoal', { pct: shareOfGoal(grams, goal) })}
                    </Text>
                  </>
                ) : null}
              </View>
            ))}
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <Text variant="bodyS" muted>
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
            min={1}
            max={5000}
            step={10}
            unit="g"
            valueLabel={t('diet.amountGrams')}
            decreaseLabel={t('diet.decreaseAmount')}
            increaseLabel={t('diet.increaseAmount')}
          />
        </View>

        <NutritionTable per100={per100} grams={value} />

        {editing && entry ? (
          <Button label={t('diet.removeEntry')} variant="danger" onPress={remove} />
        ) : null}
        {isMine ? (
          <View style={{ gap: 10 }}>
            <Button
              label={t('diet.editFood')}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/food/new', params: { editId: food.data.id } })
              }
            />
            <Button label={t('diet.deleteFood')} variant="danger" onPress={deleteFood} />
          </View>
        ) : null}
      </Screen>

      <BottomActionBar>
        <Button
          size="large"
          label={editing ? t('diet.saveChanges') : t('diet.addToMeal', { meal: mealName })}
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
        <Text variant="bodyS" muted style={{ flex: 1.4 }}>
          {t('diet.nutrition')}
        </Text>
        <Text variant="bodyS" muted style={{ flex: 1, textAlign: 'right' }}>
          {t('diet.perGrams', { g: 100 })}
        </Text>
        <Text variant="bodyS" muted style={{ flex: 1, textAlign: 'right' }}>
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
          <Text variant="label" style={{ flex: 1, textAlign: 'right' }}>
            {r.a}
          </Text>
          <Text variant="label" style={{ flex: 1, textAlign: 'right' }}>
            {r.b}
          </Text>
        </View>
      ))}
    </View>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
