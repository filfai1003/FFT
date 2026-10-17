import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Screen } from '@/components/ui/Screen';
import { useStartWorkout } from '@/features/session/start';
import { useActivePlan, useRotation } from '@/features/train/plans';

/**
 * fft://start-workout?day=<plan day id>, the Workout widget's Start: starts that day of the active
 * plan (a workout already in progress is resumed instead, as everywhere) and opens it. A day that
 * is not in the active plan just shows Train.
 */
export default function StartWorkout() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day?: string }>();
  const { plan, isSuccess, isError } = useActivePlan();
  const rotation = useRotation(plan);
  const { startDay } = useStartWorkout();
  const target = plan?.days.find((d) => d.id === day) ?? null;
  // Wait for the rotation (it numbers the cycle) when there is a plan.
  const ready = isError || (isSuccess && (!plan || rotation != null));

  useEffect(() => {
    if (!ready) return;
    router.replace('/train');
    if (plan && target) void startDay(plan, target, rotation);
    // Once, when the plan is known (`ready` turns true a single time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return <Screen>{null}</Screen>;
}
