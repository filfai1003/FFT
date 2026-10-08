import { fetchBests } from '@/features/train/exercise-stats';
import { sessionRecords, totals } from './logic';
import { useSessionStore } from './store';
import { syncPendingSessions } from './sync';

const BESTS_TIMEOUT_MS = 2500;

/**
 * Finishes the workout in progress: finds the new records, freezes the session in the local
 * store (so nothing can be lost) and starts uploading it. Returns the session id for the summary.
 * Never waits for the network longer than a moment: offline just means "no records announced".
 */
export async function finishWorkout(
  userId: string,
  onUploaded?: () => void,
): Promise<string | null> {
  const active = useSessionStore.getState().active;
  if (!active) return null;
  const endedAt = new Date();

  const ids = active.exercises.map((e) => e.exerciseId);
  const bests = await Promise.race([
    fetchBests(ids),
    new Promise<Record<string, never>>((resolve) =>
      setTimeout(() => resolve({}), BESTS_TIMEOUT_MS),
    ),
  ]);

  const records = sessionRecords(active, bests);
  useSessionStore.getState().finish({
    userId,
    session: active,
    endedAt: endedAt.toISOString(),
    feeling: null,
    notes: '',
    records,
    totals: totals(active, endedAt),
    synced: false,
  });
  void syncPendingSessions(onUploaded);
  return active.id;
}
