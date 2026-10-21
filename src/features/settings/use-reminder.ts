import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ensurePermission, setReminder } from '@/lib/notifications';
import { useReminderTimes, type ReminderTimes } from '@/lib/reminder-times';
import { usePreferencesStore, type NotificationPrefs } from './preferences-store';

/**
 * The reminders of the Reminders settings. `checkin` is a plain weekly repeat; the others are
 * smart (DECISIONS 122): planned again from the data by the ReminderBridge (features/reminders)
 * whenever the data or these settings change, so here they only store the choice.
 */
export type ReminderSetting = 'workout' | 'checkin' | 'meals' | 'water' | 'weekly';

export const SMART_REMINDERS: readonly ReminderSetting[] = ['workout', 'meals', 'water', 'weekly'];

export const prefKey: Record<ReminderSetting, keyof NotificationPrefs> = {
  workout: 'workout_reminder',
  checkin: 'weekly_check_in',
  meals: 'meals',
  water: 'water',
  weekly: 'weekly_summary',
};

/**
 * One reminder: on or off, and when it goes off. Switching it on asks the system for permission;
 * changing the time moves the reminder if it is on.
 */
export function useReminder(kind: ReminderSetting) {
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  const { times, loaded, load, set: setTimes } = useReminderTimes();
  const enabled = prefs.notifications[prefKey[kind]];

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const copy = {
    title: t('settings.reminder.checkin.title'),
    body: t('settings.reminder.checkin.body'),
  };

  /** 'denied' when the system does not let the app notify. */
  const toggle = async (value: boolean): Promise<'ok' | 'denied'> => {
    if (value && !(await ensurePermission())) return 'denied';
    if (kind === 'checkin') {
      const ok = await setReminder('checkin', value, copy, times);
      if (!ok && value) return 'denied';
    }
    prefs.set('notifications', { ...prefs.notifications, [prefKey[kind]]: value });
    return 'ok';
  };

  const changeTimes = async (patch: Partial<ReminderTimes>) => {
    const next = setTimes(patch);
    if (enabled && kind === 'checkin') await setReminder('checkin', true, copy, next);
  };

  return { enabled, times, toggle, changeTimes };
}
