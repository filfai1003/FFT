import '@/i18n';
import { t } from 'i18next';
import type { PlannedReminder } from '@/domain/reminders';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { defaultPreferences, type Preferences } from '@/features/settings/preferences-store';
import type { Translate } from '@/i18n';
import { setCurrentUserId } from '@/lib/current-user';
import { getLocalClient, getLocalDb } from '@/lib/local-db';
import {
  cancelSmartReminders,
  dismissStaleSmartReminders,
  scheduleSmartReminders,
} from '@/lib/notifications';
import { defaultReminderTimes } from '@/lib/reminder-times';
import { dateAt, localMinutes, reminderCopy, reminderLink, rescheduleReminders } from './schedule';

const U = '11111111-2222-4333-8444-555555555555';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tr = t as unknown as Translate;

jest.mock('@/lib/local-db/kv', () => {
  const texts = new Map<string, string>();
  return {
    kv: {
      texts,
      getText: async (k: string) => texts.get(k) ?? null,
      setText: async (k: string, v: string) => void texts.set(k, v),
      putFile: async () => undefined,
      fileUrl: async () => null,
      readFile: async () => null,
      removeFile: async () => undefined,
      clearAll: async () => texts.clear(),
    },
  };
});
jest.mock('@/lib/notifications', () => ({
  cancelSmartReminders: jest.fn(async () => undefined),
  dismissStaleSmartReminders: jest.fn(async () => undefined),
  scheduleSmartReminders: jest.fn(async () => true),
}));

const schedule = scheduleSmartReminders as jest.Mock;
const scheduled = () =>
  (schedule.mock.calls.at(-1)?.[0] ?? []) as {
    id: string;
    title: string;
    body: string;
    url: string;
  }[];
const db = () => getLocalClient(U);

const prefs = (n: Partial<Preferences['notifications']> = {}): Preferences => ({
  ...defaultPreferences,
  notifications: {
    ...defaultPreferences.notifications,
    meals: true,
    workout_reminder: false,
    water: false,
    weekly_summary: false,
    ...n,
  },
});
// Wednesday 2026-10-21, 09:30 in UTC (the profile's time zone).
const NOW = new Date('2026-10-21T09:30:00Z');
const DAY = '2026-10-21';

beforeEach(async () => {
  jest.clearAllMocks();
  setCurrentUserId(U);
  const local = getLocalDb(U);
  await local.wipeTables();
  local.tracking = false;
  useWorkoutStore.setState({ active: null, finished: {} });
  const c = db();
  await c.from('profiles').update({ timezone: 'UTC', diet_mode: 'tracking' }).eq('id', U);
  await c.from('consents').insert({ id: id(1), type: 'health_data', policy_version: '1' });
});

const run = (p: Preferences, now = NOW) =>
  rescheduleReminders(U, { prefs: p, times: defaultReminderTimes, now });

describe('rescheduleReminders', () => {
  it('schedules the meals not logged yet, and drops one once it is logged', async () => {
    await run(prefs());
    expect(scheduled().map((n) => n.id)).toEqual([
      `meal:lunch:${DAY}`,
      `meal:dinner:${DAY}`,
      'meal:breakfast:2026-10-22',
      'meal:lunch:2026-10-22',
      'meal:dinner:2026-10-22',
      'meal:breakfast:2026-10-23',
      'meal:lunch:2026-10-23',
      'meal:dinner:2026-10-23',
    ]);
    expect(scheduled()[0]).toEqual(
      expect.objectContaining({
        title: 'Lunch not logged yet',
        body: 'You haven’t logged lunch yet. Tap to add it.',
        url: '/food-search?meal=lunch',
      }),
    );

    await db()
      .from('food_logs')
      .insert({
        id: id(5),
        day: DAY,
        meal: 'lunch',
        name: 'Rice',
        grams: 200,
        kcal: 260,
        protein_g: 5,
        carbs_g: 56,
        fat_g: 1,
      });
    await run(prefs());
    expect(scheduled().map((n) => n.id)).not.toContain(`meal:lunch:${DAY}`);
    // The delivered lunch reminder (if any) is taken out of the list.
    const relevant = (dismissStaleSmartReminders as jest.Mock).mock.calls.at(
      -1,
    )?.[0] as Set<string>;
    expect(relevant.has(`meal:lunch:${DAY}`)).toBe(false);
  });

  it('a reminder that went off is not sent again after its time moved', async () => {
    await run(prefs(), new Date('2026-10-21T07:00:00Z'));
    expect(scheduled().map((n) => n.id)).toContain(`meal:breakfast:${DAY}`);
    // 08:00 has passed: breakfast went off. Moving the breakfast time later does not repeat it.
    await rescheduleReminders(U, {
      prefs: prefs(),
      times: { ...defaultReminderTimes, meals: [{ hour: 10, minute: 0 }] },
      now: NOW,
    });
    expect(scheduled().map((n) => n.id)).not.toContain(`meal:breakfast:${DAY}`);
  });

  it('nothing at all when every smart reminder is off, or without the health data consent', async () => {
    await run(prefs({ meals: false }));
    expect(schedule).not.toHaveBeenCalled();
    expect(cancelSmartReminders).toHaveBeenCalled();

    await db().from('consents').update({ withdrawn_at: NOW.toISOString() }).eq('id', id(1));
    await run(prefs());
    expect(schedule).not.toHaveBeenCalled();
  });

  it('training: not today once trained, and the weekly summary on Sunday evening', async () => {
    await db()
      .from('workout_sessions')
      .insert({ id: id(30), status: 'done', started_at: '2026-10-21T07:00:00Z', day_name: 'Push' });
    await db()
      .from('session_sets')
      .insert({
        id: id(31),
        session_id: id(30),
        exercise_id: id(99),
        position: 0,
        weight_kg: 50,
        reps: 8,
        completed_at: '2026-10-21T07:10:00Z',
      });
    await run(prefs({ meals: false, workout_reminder: true, weekly_summary: true }));
    const ids = scheduled().map((n) => n.id);
    expect(ids).not.toContain(`training:${DAY}`);
    expect(ids).toContain('training:2026-10-22');
    const weekly = scheduled().find((n) => n.id === 'weekly:2026-10-19');
    expect(weekly).toEqual(
      expect.objectContaining({ title: 'Your week', url: '/progress/week?from=2026-10-19' }),
    );
    expect(weekly?.body).toMatch(/^1 workout/);
  });
});

describe('reminder text, links and times', () => {
  const r = (patch: Partial<PlannedReminder>): PlannedReminder => ({
    id: 'x',
    type: 'meal',
    day: DAY,
    at: 600,
    ...patch,
  });

  it('names the Up next day, the fixed meal, or says it generally', () => {
    expect(reminderCopy(r({ type: 'training', dayName: 'Push B' }), tr, null).title).toBe(
      'Today: Push B',
    );
    expect(reminderCopy(r({ type: 'training', dayName: null }), tr, null).title).toBe(
      'Training day',
    );
    expect(reminderCopy(r({ fixedMeal: { id: 'm', name: 'Oats' } }), tr, null).title).toBe('Oats');
    expect(reminderCopy(r({ type: 'weekly', weekFrom: '2026-10-26' }), tr, null).body).toBe(
      'See how your week went.',
    );
    expect(reminderLink(r({ fixedMeal: { id: 'm', name: 'Oats' } }))).toBe('/diet');
    expect(reminderLink(r({ type: 'training' }))).toBe('/train');
  });

  it('a day and minute in the profile time zone', () => {
    expect(dateAt(DAY, 13 * 60, 'UTC').toISOString()).toBe('2026-10-21T13:00:00.000Z');
    // Paris is UTC+2 in October (summer time ends on the 25th).
    expect(dateAt(DAY, 13 * 60, 'Europe/Paris').toISOString()).toBe('2026-10-21T11:00:00.000Z');
    expect(dateAt('2026-10-26', 13 * 60, 'Europe/Paris').toISOString()).toBe(
      '2026-10-26T12:00:00.000Z',
    );
    expect(localMinutes(new Date('2026-10-21T09:30:00Z'), 'Europe/Paris')).toBe(11 * 60 + 30);
  });
});
