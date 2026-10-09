/**
 * Web version of local reminders: browsers cannot schedule notifications for a closed app, so
 * everything is a no-op. The real implementation is notifications.native.ts (iOS / Android).
 */
export type ReminderKind = 'workout' | 'checkin' | 'meals';

/** Whether the system lets the app notify (never asks). Never on the web. */
export async function notificationsAllowed(): Promise<boolean> {
  return false;
}

export async function ensurePermission(): Promise<boolean> {
  return false;
}

export async function setReminder(
  _kind: ReminderKind,
  _enabled: boolean,
  _copy: { title: string; body: string },
): Promise<boolean> {
  return false;
}

export async function scheduleRestEnd(_seconds: number, _copy: { title: string; body: string }) {}

export async function cancelRestEnd() {}
