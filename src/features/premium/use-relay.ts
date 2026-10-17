import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getLocalDb } from '@/lib/local-db';
import { reportError } from '@/lib/error-report';
import { loadRelay, relayOnce, useRelayStore } from './relay';

/** How often to look for messages from the other phones while the app is open. */
const EVERY_MS = 60_000;
/** Writes in a row become one message, sent shortly after the last one. */
const AFTER_WRITE_MS = 3_000;

/**
 * Runs the encrypted relay between phones (DECISIONS 65) in the background, like useSync does
 * for the copy on the server: right away, shortly after every change, every minute and when the
 * app comes back. Only for a paired phone of an account without a copy on the server (`enabled`).
 */
export function useRelay(userId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const paired = useRelayStore((s) => (userId ? s.paired[userId] === true : false));

  useEffect(() => {
    if (enabled && userId) void loadRelay(userId);
  }, [userId, enabled]);

  useEffect(() => {
    if (!enabled || !paired || !userId) return;
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
        if (await relayOnce(userId)) await queryClient.invalidateQueries();
      } catch (e) {
        // Offline: the outbox keeps everything for the next try.
        reportError(e, 'sync', { via: 'relay' });
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
  }, [userId, enabled, paired, queryClient]);
}
