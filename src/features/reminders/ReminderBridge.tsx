import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSessionStore } from '@/features/auth/session-store';
import { useToday } from '@/features/profile/use-today';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { reportError } from '@/lib/error-report';
import { onReminderOpened } from '@/lib/notifications';
import { useReminderTimes } from '@/lib/reminder-times';
import { rescheduleReminders, stopReminders } from './schedule';

/** Several writes in a row (a meal of five foods) become one reschedule. */
const DEBOUNCE_MS = 1500;

/**
 * Keeps the smart reminders right (DECISIONS 122): plans them again when the app opens, comes
 * back or goes to the background, after every write (the app invalidates its queries after each
 * one), when a workout starts or ends, when a reminder setting changes and on a new day. Also opens
 * the page of a reminder the user tapped. Renders nothing.
 */
export function ReminderBridge() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = useSessionStore((s) => s.userId);
  const today = useToday();

  useEffect(() => onReminderOpened((url) => router.push(url as Href)), [router]);

  // Signed out, or the health data consent withdrawn: no reminder about the data any more.
  useEffect(() => () => void stopReminders().catch(() => undefined), []);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      const prefs = usePreferencesStore.getState();
      const times = useReminderTimes.getState();
      rescheduleReminders(userId, {
        prefs,
        times: times.loaded ? times.times : undefined,
      }).catch((e) => reportError(e, 'handled', { step: 'reminders' }));
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    };
    soon();
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'invalidate') soon();
    });
    const offWorkout = useWorkoutStore.subscribe((s, prev) => {
      if (s.active?.id !== prev.active?.id) soon();
    });
    const offPrefs = usePreferencesStore.subscribe((s, prev) => {
      if (s.notifications !== prev.notifications || s.weekStart !== prev.weekStart) soon();
    });
    const offTimes = useReminderTimes.subscribe(soon);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') soon();
      // Going away: plan at once, the app may not get another chance.
      if (state === 'background') run();
    });
    return () => {
      if (timer) clearTimeout(timer);
      offQueries();
      offWorkout();
      offPrefs();
      offTimes();
      app.remove();
    };
    // `today`: a new day plans from zero.
  }, [userId, queryClient, today]);

  return null;
}
