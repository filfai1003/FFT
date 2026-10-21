import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ReminderTimes } from './reminder-times';

/**
 * Local reminders (no server involved). On the web there are no scheduled notifications, so
 * everything here is a no-op there.
 */
const supported = Platform.OS !== 'web';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Android 13+ shows the permission question only once a notification channel exists, so the channel
 * is created before the first request (and before any reminder is scheduled).
 */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Whether the system lets the app notify (never asks). */
export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  await ensureChannel();
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export type ReminderKind = 'workout' | 'checkin' | 'meals';

const ids: Record<ReminderKind, string[]> = { workout: [], checkin: [], meals: [] };

async function cancelKind(kind: ReminderKind) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === kind)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  ids[kind] = [];
}

/** (Re)schedules the repeating reminders of one kind, or removes them when `enabled` is false. */
export async function setReminder(
  kind: ReminderKind,
  enabled: boolean,
  copy: { title: string; body: string },
  times: ReminderTimes,
): Promise<boolean> {
  if (!supported) return false;
  await cancelKind(kind);
  if (!enabled) return true;
  if (!(await ensurePermission())) return false;

  const content = { title: copy.title, body: copy.body, data: { kind } };
  if (kind === 'workout') {
    // Every day at the chosen time: tapping it opens the app on Today.
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: times.workout.hour,
        minute: times.workout.minute,
      },
    });
  } else if (kind === 'checkin') {
    // Once a week (weekday 1 = Sunday … 7 = Saturday).
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: times.checkin.weekday,
        hour: times.checkin.hour,
        minute: times.checkin.minute,
      },
    });
  } else {
    for (const { hour, minute } of times.meals) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      });
    }
  }
  return true;
}

const REST_TAG = 'rest-timer';

/** A notification at the end of the rest, for when the app is in the background. */
export async function scheduleRestEnd(seconds: number, copy: { title: string; body: string }) {
  if (!supported || seconds < 5) return;
  await cancelRestEnd();
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: copy.title, body: copy.body, data: { kind: REST_TAG } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.round(seconds),
    },
  });
}

export async function cancelRestEnd() {
  if (!supported) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === REST_TAG)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// --- smart reminders (DECISIONS 122) ------------------------------------------------------------

const SMART = 'smart';
/** The daily repeating reminders of before 122, replaced by the smart ones. */
const LEGACY_SMART: string[] = ['workout', 'meals'];

export type SmartNotification = {
  /** Stable id of the reminder (`meal:lunch:2026-10-21`). */
  id: string;
  date: Date;
  title: string;
  body: string;
  /** The app page it opens (an Expo Router path). */
  url: string;
};

const kindOf = (n: { content: { data?: unknown } }) =>
  (n.content.data as { kind?: string } | undefined)?.kind;

/** Removes every scheduled smart reminder (and the old daily ones they replace). */
export async function cancelSmartReminders() {
  if (!supported) return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => {
        const kind = kindOf(n);
        return kind === SMART || (kind != null && LEGACY_SMART.includes(kind));
      })
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Replaces the scheduled smart reminders with `list` (each once, at its date). Nothing is asked:
 * without the system's permission nothing is scheduled. True when scheduled.
 */
export async function scheduleSmartReminders(list: readonly SmartNotification[]): Promise<boolean> {
  if (!supported) return false;
  await cancelSmartReminders();
  if (list.length === 0) return true;
  if (!(await notificationsAllowed())) return false;
  await ensureChannel();
  for (const n of list) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${SMART}.${n.id}`,
      content: { title: n.title, body: n.body, data: { kind: SMART, id: n.id, url: n.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date },
    });
  }
  return true;
}

/** Takes delivered smart reminders that no longer apply (lunch logged) out of the list. */
export async function dismissStaleSmartReminders(relevant: ReadonlySet<string>) {
  if (!supported) return;
  const shown = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    shown
      .filter((n) => {
        const data = n.request.content.data as { kind?: string; id?: string } | undefined;
        return data?.kind === SMART && data.id != null && !relevant.has(data.id);
      })
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

const opened = new Set<string>();

/**
 * Calls `open` with the page of a smart reminder the user tapped, also the one that started the
 * app. Only app paths ("/…") of the app's own reminders are followed.
 */
export function onReminderOpened(open: (url: string) => void): () => void {
  if (!supported) return () => undefined;
  const handle = (r: Notifications.NotificationResponse | null) => {
    if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const req = r.notification.request;
    const data = req.content.data as { kind?: string; url?: unknown } | undefined;
    const key = `${req.identifier}@${r.notification.date}`;
    if (data?.kind !== SMART || typeof data.url !== 'string' || !data.url.startsWith('/')) return;
    if (opened.has(key)) return;
    opened.add(key);
    open(data.url);
  };
  void Notifications.getLastNotificationResponseAsync().then(handle, () => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
