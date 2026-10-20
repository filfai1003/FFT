import type { IconName } from '@/components/ui/Icon';
import type { Meal } from '@/domain/diet';

/** The icon of a meal's tile (canvas "Diet"): the sun in the morning, a bowl for the rest. */
export const mealIcon = (meal: Meal): IconName => (meal === 'breakfast' ? 'sun' : 'bowl');
