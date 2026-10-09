import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ensurePermission, setReminder, type ReminderKind } from '@/lib/notifications';
import { useReminderTimes, type ReminderTimes } from '@/lib/reminder-times';
import { usePreferencesStore, type NotificationPrefs } from './preferences-store';

const prefKey: Record<ReminderKind, keyof NotificationPrefs> = {
  workout: 'workout_reminder',
  checkin: 'weekly_check_in',
  meals: 'meals',
};

/**
 * One reminder (workout, weekly check-in, meals): on or off, and when it goes off. Switching it on
 * asks the system for permission; changing the time moves the reminder if it is on.
 */
export function useReminder(kind: ReminderKind) {
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  const { times, loaded, load, set: setTimes } = useReminderTimes();
  const enabled = prefs.notifications[prefKey[kind]];

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const copy = {
    title: t(`settings.reminder.${kind}.title`),
    body: t(`settings.reminder.${kind}.body`),
  };

  /** 'denied' when the system does not let the app notify. */
  const toggle = async (value: boolean): Promise<'ok' | 'denied'> => {
    if (value && !(await ensurePermission())) return 'denied';
    const ok = await setReminder(kind, value, copy, times);
    if (!ok && value) return 'denied';
    prefs.set('notifications', { ...prefs.notifications, [prefKey[kind]]: value });
    return 'ok';
  };

  const changeTimes = async (patch: Partial<ReminderTimes>) => {
    const next = setTimes(patch);
    if (enabled) await setReminder(kind, true, copy, next);
  };

  return { enabled, times, toggle, changeTimes };
}
