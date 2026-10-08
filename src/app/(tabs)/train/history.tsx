import { HistoryScreen } from '@/features/train/HistoryScreen';

export default function History() {
  return <HistoryScreen sessionRoute="/train/history/[sessionId]" />;
}
