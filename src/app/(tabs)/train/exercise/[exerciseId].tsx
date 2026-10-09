import { useLocalSearchParams } from 'expo-router';
import { ExerciseDetailScreen } from '@/features/train/ExerciseDetailScreen';

export default function ExerciseDetail() {
  const { exerciseId, fromSession } = useLocalSearchParams<{
    exerciseId: string;
    fromSession?: string;
  }>();
  return (
    <ExerciseDetailScreen
      exerciseId={exerciseId}
      sessionRoute="/train/history/[sessionId]"
      fromSession={fromSession}
    />
  );
}
