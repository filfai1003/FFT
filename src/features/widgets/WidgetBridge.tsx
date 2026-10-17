import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSessionStore } from '@/features/auth/session-store';
import { useToday } from '@/features/profile/use-today';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useAppearanceStore } from '@/design/appearance-store';
import { reportError } from '@/lib/error-report';
import { setAppQueryClient } from './app-refresh';
import { buildSnapshot } from './build';
import { updateWidgets } from './update';

/** Changes in a row become one redraw. */
const DEBOUNCE_MS = 400;

/**
 * Keeps the home screen widgets up to date (Android): whenever the app's data changes (a query
 * refreshed after a write, the workout in progress, a setting, a new day) it rebuilds the snapshot
 * from the database, the same way the widget task does, and redraws the widgets when it differs.
 * Also lets the widget task refresh the open app after a quick action. Renders nothing.
 */
export function WidgetBridge() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const today = useToday();

  useEffect(() => {
    setAppQueryClient(queryClient);
    return () => setAppQueryClient(null);
  }, [queryClient]);

  useEffect(() => {
    if (!userId) return;
    let last: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const rebuild = async () => {
      try {
        const snapshot = await buildSnapshot(userId);
        const key = JSON.stringify(snapshot);
        if (stopped || key === last) return;
        last = key;
        await updateWidgets(snapshot);
      } catch (e) {
        reportError(e, 'widget', { step: 'bridge' });
      }
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), DEBOUNCE_MS);
    };
    soon();
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') soon();
    });
    const offWorkout = useWorkoutStore.subscribe(soon);
    const offPrefs = usePreferencesStore.subscribe(soon);
    const offLook = useAppearanceStore.subscribe(soon);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      offQueries();
      offWorkout();
      offPrefs();
      offLook();
    };
    // `today`: a new day redraws the widgets from zero.
  }, [userId, queryClient, today]);

  return null;
}
