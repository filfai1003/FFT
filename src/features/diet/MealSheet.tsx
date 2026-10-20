import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { OptionCard } from '@/components/ui/OptionCard';
import { useTheme } from '@/design/use-theme';
import { meals, type Meal } from '@/domain/diet';
import { mealIcon } from './meal-icon';

/** Choose which meal a food goes to: each with the tile it has on the Diet tab. */
export function MealSheet({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: Meal;
  onClose: () => void;
  onChange: (meal: Meal) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('diet.changeMeal')}
      closeLabel={t('common.close')}
    >
      {meals.map((m) => (
        <OptionCard
          key={m}
          title={t(`diet.meal.${m}`)}
          icon={{ name: mealIcon(m), tint: colors.nutritionSoft, ink: colors.nutritionInk }}
          selected={value === m}
          onPress={() => {
            onChange(m);
            onClose();
          }}
        />
      ))}
    </Sheet>
  );
}
