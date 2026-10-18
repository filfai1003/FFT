import type { Activity } from '@/features/gamification/data';
import { gameWithWorkout } from './summary-game';

const activity = (days: string[], workouts: Activity['workouts'] = []): Activity => ({
  loggedDays: new Set(days),
  workouts,
  dietOnTargetDays: new Set(),
  checkInDays: new Set(),
  exerciseDays: [],
  daily: [],
});

const workout = { id: 'w', day: '2026-10-18', hour: 9, planId: null };

describe('workout summary · streak and badges', () => {
  it('counts the workout just finished even before the device database has it', () => {
    const g = gameWithWorkout(activity(['2026-10-16', '2026-10-17']), workout, '2026-10-18');
    expect(g.streak).toBe(3);
    expect(g.activity.workouts).toHaveLength(1);
    expect(g.badges.find((b) => b.id === 'first_workout')?.earned).toBe(true);
    expect(g.nextStreak).toBeGreaterThan(3);
  });

  it('never counts it twice once it is there', () => {
    const g = gameWithWorkout(activity(['2026-10-18'], [{ ...workout }]), workout, '2026-10-18');
    expect(g.activity.workouts).toHaveLength(1);
    expect(g.streak).toBe(1);
  });
});
