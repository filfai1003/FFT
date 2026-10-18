import { create } from 'zustand';
import type { CommunityMetric, CommunityPeriod } from '@/domain/community';

/** What the community page shows: metric, strength subject and period (shared with the pinned bar). */
export const useBoardChoice = create<{
  metric: CommunityMetric;
  subject: string;
  period: CommunityPeriod;
  set: (
    patch: Partial<{ metric: CommunityMetric; subject: string; period: CommunityPeriod }>,
  ) => void;
}>((set) => ({
  metric: 'workouts',
  subject: '',
  period: 'month',
  set: (patch) => set(patch),
}));
