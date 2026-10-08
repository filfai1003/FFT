import { useLocalSearchParams } from 'expo-router';
import { PlanDetailScreen } from '@/features/train/PlanDetailScreen';

export default function PlanDetail() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return <PlanDetailScreen planId={planId} />;
}
