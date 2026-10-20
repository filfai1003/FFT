import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { MealPlanEditor, type MealDraft } from './MealPlanEditor';

const meal = (id: string, name: string, kcal: number, isMain = false): MealDraft => ({
  id,
  name,
  kcal,
  proteinG: kcal / 16,
  carbsG: kcal / 8,
  fatG: kcal / 36,
  description: '',
  isMain,
});
const meals = [
  meal('a', 'Breakfast', 600),
  meal('b', 'Lunch', 900, true),
  meal('c', 'Dinner', 900),
];
const goal = { kcal: 2400, proteinG: 150, carbsG: 300, fatG: 67 };

describe('Meal plan editor (DECISIONS 112)', () => {
  it('shows the day total big, a green "matches" chip and the macros in words', async () => {
    await renderUI(
      <MealPlanEditor
        meals={meals}
        onMealsChange={jest.fn()}
        goal={goal}
        workoutAfter="a"
        onWorkoutAfterChange={jest.fn()}
      />,
    );
    expect(screen.getByText('2,400')).toBeTruthy();
    expect(screen.getByText('Matches your daily target')).toBeTruthy();
    expect(screen.getByLabelText('Protein 150 g, carbs 300 g, fat 67 g')).toBeTruthy();
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.getByText('Pre-workout · more carbs')).toBeTruthy();
    expect(screen.getByLabelText('Workout between Breakfast and Lunch')).toBeTruthy();
  });

  it('says by how much the meals differ from the target', async () => {
    await renderUI(
      <MealPlanEditor
        meals={meals.slice(0, 2)}
        onMealsChange={jest.fn()}
        goal={goal}
        workoutAfter={null}
        onWorkoutAfterChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Differs from your daily target by −900 kcal')).toBeTruthy();
  });
});
