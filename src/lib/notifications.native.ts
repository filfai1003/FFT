import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

/** Whether the system lets the app notify (never asks). */
export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
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
): Promise<boolean> {
  if (!supported) return false;
  await cancelKind(kind);
  if (!enabled) return true;
  if (!(await ensurePermission())) return false;

  const content = { title: copy.title, body: copy.body, data: { kind } };
  if (kind === 'workout') {
    // Every day at 18:00: tapping it opens the app on Today.
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 18, minute: 0 },
    });
  } else if (kind === 'checkin') {
    // Thursday 08:00 (weekday 5 = Thursday, Sunday is 1).
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 5,
        hour: 8,
        minute: 0,
      },
    });
  } else {
    for (const [hour, minute] of [
      [8, 0],
      [13, 0],
      [20, 0],
    ] as const) {
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
