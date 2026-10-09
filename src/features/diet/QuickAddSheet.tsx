import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { scaleNutrition, type Meal } from '@/domain/diet';
import { useToastStore } from '@/lib/toast-store';
import { newId } from '@/lib/uuid';
import type { Food } from './foods';
import { useLogFood, useSetLogDeleted } from './log';

type Props = {
  food: Food | null;
  meal: Meal;
  day: string;
  onClose: () => void;
};

/** The "+" of a search result: pick the grams and add, without leaving the search. */
export function QuickAddSheet({ food, meal, day, onClose }: Props) {
  return food ? <Body key={food.id} food={food} meal={meal} day={day} onClose={onClose} /> : null;
}

function Body({ food, meal, day, onClose }: Props & { food: Food }) {
  const { t } = useTranslation();
  const [grams, setGrams] = useState(food.servings[0]?.grams ?? 100);
  const log = useLogFood();
  const setDeleted = useSetLogDeleted();
  const showToast = useToastStore((s) => s.show);
  const values = scaleNutrition(food.per100, grams);

  const add = async () => {
    const id = newId();
    await log.mutateAsync({
      id,
      day,
      meal,
      foodId: food.id,
      name: food.name,
      quantityLabel: `${grams} g`,
      grams,
      macros: values,
    });
    onClose();
    showToast({
      message: t('diet.addedTo', { name: food.name, meal: t(`diet.meal.${meal}`).toLowerCase() }),
      actionLabel: t('common.undo'),
      onAction: () => setDeleted.mutate({ id, deleted: true }),
    });
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={food.name}
      closeLabel={t('common.close')}
      footer={
        <Button
          size="large"
          label={t('diet.addToMeal', { meal: t(`diet.meal.${meal}`).toLowerCase() })}
          disabled={log.isPending}
          onPress={add}
        />
      }
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Text variant="label" muted>
          {t('diet.macroLine', {
            p: Math.round(values.protein),
            c: Math.round(values.carbs),
            f: Math.round(values.fat),
          })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text variant="displayM" numeric>
            {Math.round(values.kcal)}
          </Text>
          <Text variant="label" muted>
            {t('common.kcal')}
          </Text>
        </View>
      </View>
      <Stepper
        variant="amount"
        value={grams}
        onChange={setGrams}
        min={1}
        max={5000}
        step={10}
        unit="g"
        valueLabel={t('diet.amountGrams')}
        decreaseLabel={t('diet.decreasePortion')}
        increaseLabel={t('diet.increasePortion')}
      />
    </Sheet>
  );
}
