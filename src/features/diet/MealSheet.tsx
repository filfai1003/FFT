import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { OptionCard } from '@/components/ui/OptionCard';
import { meals, type Meal } from '@/domain/diet';

/** Choose which meal a food goes to. */
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
