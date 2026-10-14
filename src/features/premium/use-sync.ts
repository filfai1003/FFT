import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getLocalDb } from '@/lib/local-db';
import { syncOnce } from './sync';

/** How often to look for changes from other devices while the app is open. */
const EVERY_MS = 30_000;
/** Writes in a row become one sync, sent shortly after the last one. */
const AFTER_WRITE_MS = 1_500;

/**
 * Runs the premium sync in the background: right away, shortly after every change, every 30 s
 * and when the app comes back to the foreground. Failures (no network) are retried at the next
 * occasion; the app keeps working on the device meanwhile. Screens refresh when something new
 * arrives from another device.
 */
export function useSync(userId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !userId) return;
    const db = getLocalDb(userId);
    db.tracking = true;
    let running = false;
    let again = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (stopped) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        if (await syncOnce(userId)) await queryClient.invalidateQueries();
      } catch {
        // Offline or the server is busy: the outbox keeps everything for the next try.
      } finally {
        running = false;
        if (again && !stopped) {
          again = false;
          void run();
        }
      }
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), AFTER_WRITE_MS);
    };

    void run();
    const off = db.onChange(soon);
    const every = setInterval(() => void run(), EVERY_MS);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run();
    });
    return () => {
      stopped = true;
      off();
      clearInterval(every);
      app.remove();
      if (timer) clearTimeout(timer);
    };
  }, [userId, enabled, queryClient]);
}
