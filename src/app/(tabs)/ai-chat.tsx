import { useLocalSearchParams } from 'expo-router';
import { AiChatScreen } from '@/features/ai/AiChatScreen';

export default function AiChat() {
  const { id, fresh } = useLocalSearchParams<{ id?: string; fresh?: string }>();
  // A new key per conversation: opening another one from the list starts the screen over.
  return <AiChatScreen key={`${id ?? ''}-${fresh ?? ''}`} />;
}
