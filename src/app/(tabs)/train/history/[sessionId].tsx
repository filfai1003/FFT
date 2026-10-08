import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '@/features/train/SessionDetailScreen';

export default function SessionDetail() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <SessionDetailScreen sessionId={sessionId} exerciseRoute="/train/exercise/[exerciseId]" />;
}
