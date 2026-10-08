import { useLocalSearchParams } from 'expo-router';
import { ExerciseDetailScreen } from '@/features/train/ExerciseDetailScreen';

export default function ExerciseDetailFromProgress() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  return (
    <ExerciseDetailScreen exerciseId={exerciseId} sessionRoute="/progress/history/[sessionId]" />
  );
}
