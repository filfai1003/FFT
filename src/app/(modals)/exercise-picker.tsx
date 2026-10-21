import { useLocalSearchParams } from 'expo-router';
import { ThemedStatusBar } from '@/components/ui/ThemedStatusBar';
import { WorkoutThemeScope } from '@/design/use-theme';
import { ExercisePickerScreen } from '@/features/train/ExercisePickerScreen';

export default function ExercisePicker() {
  const { target } = useLocalSearchParams<{ target?: string }>();
  // Opened from the workout in progress: it keeps the workout's theme (DECISIONS 123).
  if (target === 'session')
    return (
      <WorkoutThemeScope>
        <ThemedStatusBar />
        <ExercisePickerScreen />
      </WorkoutThemeScope>
    );
  return (
    <>
      <ThemedStatusBar />
      <ExercisePickerScreen />
    </>
  );
}
