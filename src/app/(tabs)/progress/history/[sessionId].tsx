import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '@/features/train/SessionDetailScreen';

export default function SessionDetailFromProgress() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <SessionDetailScreen sessionId={sessionId} exerciseRoute="/progress/exercise/[exerciseId]" />
  );
}
