import { useLocalSearchParams } from 'expo-router';
import { ExerciseForm } from '@/features/train/ExerciseForm';

export default function EditExercise() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return <ExerciseForm exerciseId={exerciseId} />;
}
