import { useEffect } from 'react';
import { AppState } from 'react-native';
import { cancelRestEnd, notificationsAllowed, setReminder } from '@/lib/notifications';
import { defaultReminderTimes } from '@/lib/reminder-times';
import { usePreferencesStore } from './preferences-store';

const none = { rest_timer: false, workout_reminder: false, weekly_check_in: false, meals: false };
const empty = { title: '', body: '' };

/**
 * Notifications the system does not allow cannot be on: when the permission is missing (or the
 * user takes it away in the device settings) every notification option is switched off and the
 * scheduled reminders are removed. Checked at start and whenever the app comes back to the front.
 */
export function useNotificationGuard(active: boolean) {
  const anyOn = usePreferencesStore((s) => Object.values(s.notifications).some(Boolean));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const check = async () => {
      if (!usePreferencesStore.getState().notifications || (await notificationsAllowed())) return;
      if (cancelled) return;
      usePreferencesStore.getState().set('notifications', none);
      await Promise.all([
        setReminder('workout', false, empty, defaultReminderTimes),
        setReminder('checkin', false, empty, defaultReminderTimes),
        setReminder('meals', false, empty, defaultReminderTimes),
        cancelRestEnd(),
      ]);
    };
    if (anyOn) void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [active, anyOn]);
}
