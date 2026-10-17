import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  columns,
  getLocalDb,
  pkOf,
  readLocalFile,
  writeLocalFile,
  type LocalDb,
  type Pending,
  type Row,
} from '@/lib/local-db';
import { isPlan, savePlan, usePlanStore, type Plan, type SyncChoice } from '@/lib/plan';
import { reportError } from '@/lib/error-report';
import { getAuthClient } from '@/lib/supabase';

/**
 * Sync with the copy on the server. The app always reads and writes the database on the device
 * (instant, works offline); this sends what changed to the server and brings back what other
 * devices changed. Only for accounts that chose to keep a copy on the server (DECISIONS 62):
 * otherwise nothing is sent or fetched.
 *
 * - Push: the outbox (one entry per changed row, latest state, with the time of the action).
 * - Pull: everything stored on the server since the last pull, plus deletions.
 * - Conflicts: per row, the most recent action wins (the server and `applyRemote` compare the
 *   time of the action, not the order things arrive in). The same change twice counts once.
 */

/** Parents before children (foreign keys on the server). Deletions go the other way. */
export const SYNC_ORDER = [
  'profiles',
  'user_settings',
  'consents',
  'exercises',
  'foods',
  'food_servings',
  'workout_plans',
  'plan_days',
  'plan_exercises',
  'workout_sessions',
  'session_exercises',
  'session_sets',
  'fixed_meal_plans',
  'fixed_meals',
  'fixed_meal_checks',
  'food_logs',
  'nutrition_goals',
  'water_logs',
  'body_metrics',
  'body_goals',
  'progress_photos',
  'supplements',
  'supplement_logs',
] as const;

const PHOTOS = 'progress-photos';
const EXERCISE_IMAGES = 'user-exercise-images';
const CHUNK = 200;
const EPOCH = '1970-01-01T00:00:00.000Z';
/** Pull a little before the last cursor: rows committed late are not missed (applying twice is harmless). */
const OVERLAP_MS = 2 * 60 * 1000;

const server = () => getAuthClient() as unknown as SupabaseClient;
const cursorKey = (userId: string) => `fft.sync.${userId}`;

const chunks = <T>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const pick = (table: string, row: Row): Row =>
  Object.fromEntries((columns[table] ?? []).filter((c) => c in row).map((c) => [c, row[c]]));

/** Only the user's own rows go up (catalogue exercises and Open Food Facts foods are shared). */
function isOwn(db: LocalDb, table: string, row: Row, userId: string): boolean {
  if (table === 'exercises' || table === 'foods') return row.owner_id === userId;
  if (table === 'food_servings')
    return (db.tables.foods ?? []).some((f) => f.id === row.food_id && f.owner_id === userId);
  if (table === 'profiles') return row.id === userId;
  return row.user_id === userId;
}

/** The file a row points to, if it has one kept on the device. */
function fileOf(table: string, row: Row): { bucket: string; path: string } | null {
  if (table === 'progress_photos' && row.storage_path)
    return { bucket: PHOTOS, path: String(row.storage_path) };
  if (table === 'exercises' && row.owner_id && row.image_path)
    return { bucket: EXERCISE_IMAGES, path: String(row.image_path) };
  return null;
}

async function uploadFile(f: { bucket: string; path: string }) {
  const bytes = await readLocalFile(`${f.bucket}/${f.path}`);
  if (!bytes) return;
  await server().storage.from(f.bucket).upload(f.path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
}

async function pushRows(table: string, rows: Row[], deletes: { id: string; at: string }[]) {
  const { error } = await server().rpc('sync_push', {
    p_table: table,
    p_rows: rows,
    p_deletes: deletes,
  });
  return error;
}

/**
 * The account chose not to keep a copy on the server, or has not chosen yet (DECISIONS 62):
 * nothing goes up or comes down. Only known for the account loaded in the plan store; another
 * account (or none loaded, e.g. in tests) is not stopped here.
 */
function serverCopyOff(userId: string) {
  const s = usePlanStore.getState();
  return s.userId === userId && s.sync !== 'on';
}

/** Accounts being deleted: their sync is stopped for the rest of this run. */
const halted = new Set<string>();

/**
 * Stops every upload of an account that is about to be deleted: whatever waits in its outbox is
 * never sent (the background sync and "Check sync" do nothing for it any more).
 */
export function haltSync(userId: string) {
  halted.add(userId);
}

/** The deletion did not happen after all: the sync goes on, the outbox was kept. */
export function resumeSync(userId: string) {
  halted.delete(userId);
}

/** Sends the outbox. Rows the server refuses for good (e.g. a rule) are dropped, not retried forever. */
/** Rows the server refused in the last push (0 = everything arrived). */
let refusedLastPush = 0;

export async function push(userId: string): Promise<number> {
  if (halted.has(userId) || serverCopyOff(userId)) return 0;
  const db = getLocalDb(userId);
  await db.ready;
  const pending = Object.values(db.outbox);
  if (pending.length === 0) return 0;
  const byTable = new Map<string, Pending[]>();
  for (const p of pending) byTable.set(p.table, [...(byTable.get(p.table) ?? []), p]);
  const sent: Pending[] = [];
  refusedLastPush = 0;

  for (const table of SYNC_ORDER) {
    const ups = (byTable.get(table) ?? []).filter((p) => p.op === 'upsert');
    const pk = pkOf(table);
    const rows: { p: Pending; row: Row }[] = [];
    for (const p of ups) {
      const row = (db.tables[table] ?? []).find((r) => String(r[pk]) === p.key);
      if (!row || !isOwn(db, table, row, userId)) {
        sent.push(p); // gone since, or not the user's: nothing to send
        continue;
      }
      rows.push({ p, row: pick(table, row) });
    }
    for (const part of chunks(rows)) {
      for (const { row } of part) {
        const f = fileOf(table, row);
        if (f) await uploadFile(f);
      }
      const error = await pushRows(
        table,
        part.map((r) => r.row),
        [],
      );
      if (!error) {
        sent.push(...part.map((r) => r.p));
        continue;
      }
      if (isNetworkError(error)) throw new Error(error.message);
      // One bad row must not block the others: send them one by one, drop the refused ones.
      for (const r of part) {
        const e = await pushRows(table, [r.row], []);
        if (e && isNetworkError(e)) throw new Error(e.message);
        // Left out for good: say so (a row lost without a trace is how a breakfast went missing).
        if (e) refusedLastPush += 1;
        if (e) console.warn(`sync: the server refused ${table} ${r.p.key}: ${e.message}`);
        if (e) reportError(new Error(`refused ${table}: ${e.message}`), 'sync', { table });
        sent.push(r.p);
      }
    }
  }

  for (const table of [...SYNC_ORDER].reverse()) {
    const dels = (byTable.get(table) ?? []).filter((p) => p.op === 'delete');
    for (const part of chunks(dels)) {
      const error = await pushRows(
        table,
        [],
        part.map((p) => ({ id: p.key, at: p.at })),
      );
      if (error && isNetworkError(error)) throw new Error(error.message);
      sent.push(...part);
    }
  }

  db.settle(sent);
  return sent.length;
}

function isNetworkError(e: { message?: string; code?: string }) {
  // PostgREST answers rule violations with a code; no code = it never got there.
  return !e.code || /fetch|network|timeout/i.test(e.message ?? '');
}

/** Brings back what changed on the server since the last pull. Returns whether anything changed here. */
export async function pull(userId: string, opts: { full?: boolean } = {}): Promise<boolean> {
  if (serverCopyOff(userId)) return false;
  const db = getLocalDb(userId);
  await db.ready;
  // The device started with no readable database: everything comes back, not only what is new.
  const full = opts.full || db.freshStart;
  const saved = full ? null : await AsyncStorage.getItem(cursorKey(userId));
  const since = saved ? new Date(new Date(saved).getTime() - OVERLAP_MS).toISOString() : EPOCH;
  const { data, error } = await server().rpc('sync_pull', { p_since: since });
  if (error) throw new Error(error.message);
  const result = data as Record<string, unknown> & {
    now: string;
    tombstones: { table: string; id: string; at: string }[];
  };

  let changed = false;
  for (const table of SYNC_ORDER) {
    const rows = (result[table] as Row[] | undefined) ?? [];
    const deleted = result.tombstones.filter((t) => t.table === table);
    if (db.applyRemote(table, rows, deleted)) changed = true;
    for (const row of rows) {
      const f = fileOf(table, row);
      if (!f || (await readLocalFile(`${f.bucket}/${f.path}`))) continue;
      const res = await server().storage.from(f.bucket).download(f.path);
      if (res.error || !res.data) continue;
      await writeLocalFile(
        `${f.bucket}/${f.path}`,
        new Uint8Array(await res.data.arrayBuffer()),
        res.data.type || 'image/jpeg',
      );
      changed = true;
    }
  }
  await AsyncStorage.setItem(cursorKey(userId), result.now);
  db.freshStart = false;
  return changed;
}

/** One round: send, then receive (a device that lost its database receives first). */
export async function syncOnce(userId: string): Promise<boolean> {
  if (halted.has(userId) || serverCopyOff(userId)) return false;
  const db = getLocalDb(userId);
  await db.ready;
  const recovered = db.freshStart ? await pull(userId) : false;
  // Once per device: everything goes up again. Food logs of products only on the device used to be
  // refused by the server and lost from the outbox; the server now keeps them (without the link).
  // Rows the server already has in the same version change nothing.
  const resend = await AsyncStorage.getItem(resendKey(userId));
  if (!resend) db.markAllDirty();
  await push(userId);
  // Done only when the server took everything (otherwise: again at the next sync).
  if (!resend && refusedLastPush === 0)
    await AsyncStorage.setItem(resendKey(userId), new Date().toISOString());
  const changed = (await pull(userId)) || recovered;
  useSyncStatus.setState({ lastAt: new Date().toISOString(), refused: refusedLastPush });
  return changed;
}

const resendKey = (userId: string) => `fft.sync.resent-2.${userId}`;

/** When this device last finished a sync, and how many rows the server refused then. */
export const useSyncStatus = create<{ lastAt: string | null; refused: number }>(() => ({
  lastAt: null,
  refused: 0,
}));

export type SyncCheck = {
  /** Tables whose number of items differs between this device and the server. */
  differences: { table: string; device: number; server: number }[];
  /** Changes still waiting to be sent. */
  pending: number;
  refused: number;
};

/**
 * "Check sync": syncs now, then counts the user's items table by table here and on the server.
 * Everything in sync = no differences and nothing waiting.
 */
export async function checkSync(userId: string): Promise<SyncCheck> {
  await syncOnce(userId);
  const db = getLocalDb(userId);
  const { data, error } = await server().rpc('sync_counts');
  if (error) throw new Error(error.message);
  const online = data as Record<string, number>;
  const differences = SYNC_ORDER.flatMap((table) => {
    const device = (db.tables[table] ?? []).filter(
      (r) => r.deleted_at == null && isOwn(db, table, r, userId),
    ).length;
    const serverCount = Number(online[table] ?? 0);
    return device === serverCount ? [] : [{ table, device, server: serverCount }];
  });
  return {
    differences,
    pending: Object.keys(db.outbox).length,
    refused: useSyncStatus.getState().refused,
  };
}

/** Sends every item of this device again (the server keeps the newest version of each). */
export async function resendAll(userId: string): Promise<SyncCheck> {
  const db = getLocalDb(userId);
  await db.ready;
  db.markAllDirty();
  return checkSync(userId);
}

/**
 * The sync starts on this device (the copy on the server was turned on, here or elsewhere):
 * every row here is queued to go up (photos go with their row), then the account's data comes
 * down from the start.
 */
export async function startSync(userId: string) {
  const db = getLocalDb(userId);
  await db.ready;
  db.tracking = true;
  db.markAllDirty();
  await AsyncStorage.removeItem(cursorKey(userId));
}

/**
 * The sync ends on this device (the copy on the server was turned off, here or elsewhere): the
 * device keeps everything, nothing waits to be sent and nothing is noted any more.
 */
export async function detachSync(userId: string) {
  const db = getLocalDb(userId);
  await db.ready;
  db.tracking = false;
  db.outbox = {};
  db.scheduleSave();
  await AsyncStorage.removeItem(cursorKey(userId));
}

// --- Keep a copy on the server: on / off (DECISIONS 62) ---------------------------------------

const cleanupKey = (userId: string) => `fft.sync.files-to-remove.${userId}`;

/** What the server says about the copy on the server; null when it cannot be reached. */
export async function fetchSyncChoice(): Promise<SyncChoice | null> {
  try {
    const res = await server().rpc('my_sync');
    if (res.error) return null;
    return res.data === true ? 'on' : res.data === false ? 'off' : 'undecided';
  } catch {
    return null;
  }
}

/**
 * Removes every file of the account from the two private buckets (listed on the server, so files
 * this phone never downloaded go too). The rows are already gone (set_sync(false)).
 */
async function removeServerFiles(userId: string) {
  for (const bucket of [PHOTOS, EXERCISE_IMAGES]) {
    // Pages of 100 (at most 20 000 files); a page that removes nothing ends it (no endless loop).
    for (let round = 0; round < 200; round++) {
      const { data, error } = await server().storage.from(bucket).list(userId, { limit: 100 });
      if (error) throw new Error(error.message);
      const names = ((data ?? []) as { name: string }[]).map((f) => `${userId}/${f.name}`);
      if (names.length === 0) break;
      const removed = await server().storage.from(bucket).remove(names);
      if (removed.error) throw new Error(removed.error.message);
      if (Array.isArray(removed.data) && removed.data.length === 0) break;
    }
  }
}

/**
 * Files left on the server by an earlier "turn off" that could not finish (no network): removed
 * now. Returns true when nothing is left to remove.
 */
export async function finishServerCleanup(userId: string): Promise<boolean> {
  if (!(await AsyncStorage.getItem(cleanupKey(userId)))) return true;
  try {
    await removeServerFiles(userId);
    await AsyncStorage.removeItem(cleanupKey(userId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns the copy on the server off (or answers "only on this phone" for a new account). Cannot be
 * undone: the server deletes the account's data (every synced table, in one transaction), then
 * this removes its files. In this order, so that nothing is lost:
 * 1. what other devices sent is fetched first (best effort): this phone keeps it;
 * 2. the sync stops: nothing in the outbox is sent any more;
 * 3. the server deletes the data and notes the choice (if that fails, the sync goes on as before);
 * 4. this device stops noting changes; the files are removed (retried at the next start if the
 *    network drops meanwhile).
 */
export async function turnSyncOff(userId: string): Promise<void> {
  const db = getLocalDb(userId);
  await db.ready;
  if (usePlanStore.getState().sync === 'on') await pull(userId, { full: true }).catch(() => false);
  haltSync(userId);
  try {
    const { error } = await server().rpc('set_sync', { p_enabled: false });
    if (error) throw new Error(error.message);
  } catch (e) {
    resumeSync(userId);
    throw e;
  }
  await AsyncStorage.setItem(cleanupKey(userId), new Date().toISOString());
  await savePlan(userId, { sync: 'off', home: 'device' });
  await detachSync(userId);
  resumeSync(userId);
  await finishServerCleanup(userId);
}

/**
 * Turns the copy on the server on: the server notes it, then everything on this phone (every row
 * and its photos) is queued and goes up with the next sync, which then brings back what other
 * devices have.
 */
export async function turnSyncOn(userId: string): Promise<void> {
  // Old files waiting to be removed go first: removing them later would remove the new uploads.
  await finishServerCleanup(userId);
  await AsyncStorage.removeItem(cleanupKey(userId));
  const { error } = await server().rpc('set_sync', { p_enabled: true });
  if (error) throw new Error(error.message);
  resumeSync(userId);
  await startSync(userId);
  await savePlan(userId, { sync: 'on', home: 'online' });
}

/** What the server says about the account; null when it cannot be reached. */
export async function fetchPlan(): Promise<Plan | null> {
  try {
    const res = await server().rpc('my_plan');
    if (res.error) return null;
    return isPlan(res.data) ? res.data : null;
  } catch {
    return null;
  }
}
