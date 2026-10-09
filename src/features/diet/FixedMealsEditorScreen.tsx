import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { FormHeader } from '@/components/ui/FormHeader';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useToday } from '@/features/profile/use-today';
import { goBack } from '@/lib/navigation';
import { useFixedPlan, useSaveFixedPlan } from './fixed';
import { useGoalForDay } from './log';
import { MealPlanEditor, type MealDraft } from './MealPlanEditor';

/** Fixed meals editor: plan name and the meals (see MealPlanEditor). */
export function FixedMealsEditorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const goal = useGoalForDay(today);
  const plan = useFixedPlan();
  const save = useSaveFixedPlan();
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState<MealDraft[] | null>(null);
  const [workoutDraft, setWorkoutDraft] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  if (!plan.data || !goal) return <Screen>{null}</Screen>;
  // Edits live in `draft`; until the first edit the meals come straight from the saved plan.
  const original = plan.data.meals.map(({ position: _p, ...m }) => m);
  const meals = draft ?? original;
  const planName = name ?? plan.data.name;
  const requested = workoutDraft === undefined ? plan.data.workoutAfterMealId : workoutDraft;
  // A deleted meal cannot hold the workout any more.
  const workoutAfter = meals.some((m) => m.id === requested) ? requested : null;

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        planId: plan.data!.id,
        name: planName,
        meals,
        workoutAfterMealId: workoutAfter,
        removedIds: original.map((m) => m.id).filter((id) => !meals.some((m) => m.id === id)),
      });
      goBack(router);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={14}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router) }}
          title={t('fixed.title')}
        />
        <Input label={t('fixed.planName')} value={planName} onChangeText={setName} display />
        <MealPlanEditor
          meals={meals}
          onMealsChange={setDraft}
          goal={{ kcal: goal.kcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG }}
          workoutAfter={workoutAfter}
          onWorkoutAfterChange={setWorkoutDraft}
        />
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={t('fixed.save')}
          disabled={
            planName.trim() === '' || meals.some((m) => m.name.trim() === '') || save.isPending
          }
          onPress={submit}
        />
      </BottomActionBar>
    </>
  );
}
