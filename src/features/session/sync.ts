import { getSupabase } from '@/lib/supabase';
import { toRows } from './logic';
import { useSessionStore, type FinishedSession } from './store';

const CHUNK = 200;

/**
 * Uploads one finished workout. Idempotent: every row has its client UUID and is upserted, so a
 * retry after a dropped connection never duplicates anything. Returns true when fully uploaded.
 */
export async function uploadFinished(f: FinishedSession): Promise<boolean> {
  const supabase = getSupabase();
  const rows = toRows(f.session, f.userId, {
    endedAt: new Date(f.endedAt),
    feeling: f.feeling,
    notes: f.notes,
  });

  const s = await supabase.from('workout_sessions').upsert(rows.session);
  if (s.error) return false;

  if (rows.exercises.length > 0) {
    const e = await supabase.from('session_exercises').upsert(rows.exercises);
    if (e.error) return false;
  }
  for (let i = 0; i < rows.sets.length; i += CHUNK) {
    const r = await supabase.from('session_sets').upsert(rows.sets.slice(i, i + CHUNK));
    if (r.error) return false;
  }
  return true;
}

let running = false;
let runAgain = false;

/** Tries to upload every finished workout that is not synced yet. Safe to call often. */
export async function syncPendingSessions(onUploaded?: () => void): Promise<void> {
  if (running) {
    runAgain = true; // something changed while uploading: go around once more
    return;
  }
  running = true;
  try {
    const pending = Object.values(useSessionStore.getState().finished).filter((f) => !f.synced);
    for (const f of pending) {
      // The summary screen may still be editing feeling/notes: read the latest version.
      const latest = useSessionStore.getState().finished[f.session.id];
      if (!latest || latest.synced) continue;
      let ok = false;
      try {
        ok = await uploadFinished(latest);
      } catch {
        ok = false; // offline: try again later
      }
      // If it was edited while uploading, leave it pending: the next pass uploads the new version.
      if (ok && useSessionStore.getState().finished[latest.session.id] === latest) {
        useSessionStore.getState().markSynced(latest.session.id);
        onUploaded?.();
      }
    }
  } finally {
    running = false;
  }
  if (runAgain) {
    runAgain = false;
    await syncPendingSessions(onUploaded);
  }
}
