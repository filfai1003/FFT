import { t as translate } from 'i18next';
import { localDay } from '@/domain/day';
import type { Translate } from '@/i18n';
import { getCurrentUserId, setCurrentUserId } from '@/lib/current-user';
import { reportError } from '@/lib/error-report';
import { getLocalDb } from '@/lib/local-db';
import { isWidgetAction, runWidgetAction } from './actions';
import { refreshApp } from './app-refresh';
import { buildSnapshot } from './build';
import {
  forToday,
  readSnapshot,
  saveSnapshot,
  type WidgetName,
  type WidgetSnapshot,
} from './snapshot';
import { liveState, NOTICE_MS, readState, saveState, type WidgetState } from './state';
import { updateWidgets } from './update';

const t = translate as unknown as Translate;

/**
 * What the widget task does (task-handler.tsx), outside the library so it can be tested. The task
 * runs in the app's JavaScript when the app is open, else in a fresh one Android starts for it:
 * the database and the workout in progress are then read from the device first.
 */

let chain: Promise<unknown> = Promise.resolve();

/** One widget task at a time (two quick taps must not write over each other). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The account the widgets show (the snapshot's). With the app closed nobody is signed in yet in
 * this JavaScript: the widgets act for that account. With another account signed in (the snapshot
 * is out of date) they do nothing until the app redraws them.
 */
function actsFor(userId: string): boolean {
  const current = getCurrentUserId();
  if (current == null) setCurrentUserId(userId);
  return (current ?? userId) === userId;
}

let building: Promise<WidgetSnapshot | null> | null = null;
let builtAt = 0;
let built: WidgetSnapshot | null = null;

/**
 * The snapshot rebuilt from the database (several widgets updating together share one build), or
 * the saved one when the database cannot be read (an earlier day's totals then start from zero).
 */
export async function currentSnapshot(now = new Date()): Promise<WidgetSnapshot | null> {
  const saved = await readSnapshot();
  if (!saved) return null;
  const savedToday = forToday(saved, localDay(now, saved.timeZone));
  if (!actsFor(saved.userId)) return savedToday;
  if (built && built.userId === saved.userId && now.getTime() - builtAt < 3000) return built;
  building ??= buildSnapshot(saved.userId, now)
    .then(async (s) => {
      built = s;
      builtAt = Date.now();
      await saveSnapshot(s);
      return s;
    })
    .finally(() => {
      building = null;
    });
  try {
    return await building;
  } catch (e) {
    reportError(e, 'widget', { step: 'build' });
    return savedToday;
  }
}

/** Forgets the shared build (after a write the next one must read the database again). */
function invalidateBuild() {
  built = null;
  builtAt = 0;
}

/** What a widget shows now: the snapshot and the widgets' state. */
export async function widgetView(now = new Date()) {
  const snapshot = await currentSnapshot(now);
  return { snapshot, state: liveState(await readState(), now.getTime()) };
}

/**
 * A tap on a quick action (not on a link: those open the app directly). Runs the action, redraws
 * every widget, refreshes the open app; an Undo (or a message) is taken away again after its time.
 * Never throws: a failure is reported and shown on the widget.
 */
export async function handleWidgetClick(
  action: string | undefined,
  data: Record<string, unknown>,
  widget: WidgetName,
  now: () => Date = () => new Date(),
): Promise<void> {
  if (!isWidgetAction(action)) return;
  const shown = await serial(async (): Promise<WidgetState | null> => {
    const saved = await readSnapshot();
    if (!saved || !actsFor(saved.userId)) {
      await updateWidgets(saved);
      return null;
    }
    let state = liveState(await readState(), now().getTime());
    let snapshot: WidgetSnapshot | null = saved;
    try {
      // Every tap is checked against the data as it is now.
      invalidateBuild();
      snapshot = await buildSnapshot(saved.userId, now());
      if (!snapshot) {
        // The health data consent was withdrawn: nothing is written, the widgets ask to open the app.
        await updateWidgets(null, state);
        return null;
      }
      const before = state;
      const result = await runWidgetAction(action, data, snapshot, state, now());
      state = result.state;
      if (result.wrote) {
        // Written to the device before the task ends (the app may not be running).
        await getLocalDb(saved.userId).flush();
        snapshot = (await buildSnapshot(saved.userId, now())) ?? snapshot;
      }
      await saveState(state);
      await updateWidgets(snapshot, state);
      if (result.wrote) await refreshApp();
      return state.undo !== before.undo ? state : null;
    } catch (e) {
      reportError(e, 'widget', { action });
      state = {
        ...state,
        notice: { widget, text: t('widgets.failed'), until: now().getTime() + NOTICE_MS },
      };
      await saveState(state);
      await updateWidgets(snapshot, state);
      return state;
    }
  });
  if (!shown) return;
  // Take the Undo (or the message) away once its time is up, unless something newer replaced it.
  const until = Math.max(shown.undo?.until ?? 0, shown.notice?.until ?? 0);
  await sleep(Math.max(0, until - now().getTime()) + 50);
  await serial(async () => {
    const st = await readState();
    const stale =
      (shown.undo && st.undo?.id === shown.undo.id) ||
      (shown.notice && st.notice?.until === shown.notice.until);
    if (!stale) return;
    const next = liveState(st, now().getTime());
    await saveState(next);
    await updateWidgets(await readSnapshot(), next);
  });
}
