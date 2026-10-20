import { create } from 'zustand';
import type { CommunityAudience, CommunityMetric, CommunityPeriod } from '@/domain/community';

type Choice = {
  metric: CommunityMetric;
  subject: string;
  period: CommunityPeriod;
  /** Who to compare with (DECISIONS 117); only Everyone is used without Supporter / Premium. */
  audience: CommunityAudience;
};

/** What the community page shows: metric, strength subject, period and audience. */
export const useBoardChoice = create<Choice & { set: (patch: Partial<Choice>) => void }>((set) => ({
  metric: 'workouts',
  subject: '',
  period: 'month',
  audience: 'everyone',
  set: (patch) => set(patch),
}));
