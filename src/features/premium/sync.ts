import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { isPlan, type Plan } from '@/lib/plan';
import { getAuthClient } from '@/lib/supabase';

/**
 * Premium sync. The app always reads and writes the database on the device (instant, works
 * offline); this sends what changed to the server and brings back what other devices changed.
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

/** Sends the outbox. Rows the server refuses for good (e.g. a rule) are dropped, not retried forever. */
/** Rows the server refused in the last push (0 = everything arrived). */
let refusedLastPush = 0;

export async function push(userId: string): Promise<number> {
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
  return (await pull(userId)) || recovered;
}

const resendKey = (userId: string) => `fft.sync.resent-2.${userId}`;

/** Premium starts on this device: everything here goes up, then the account's data comes down. */
export async function startSync(userId: string) {
  const db = getLocalDb(userId);
  await db.ready;
  db.tracking = true;
  db.markAllDirty();
  await AsyncStorage.removeItem(cursorKey(userId));
}

/** Premium ended: the device keeps everything (one last full pull), the server keeps nothing. */
export async function stopSync(userId: string) {
  const db = getLocalDb(userId);
  await db.ready;
  await pull(userId, { full: true });
  const files = [
    ...(db.tables.progress_photos ?? []).map((r) => fileOf('progress_photos', r)),
    ...(db.tables.exercises ?? []).map((r) => fileOf('exercises', r)),
  ].filter((f): f is { bucket: string; path: string } => f != null);
  for (const bucket of [PHOTOS, EXERCISE_IMAGES]) {
    const paths = files.filter((f) => f.bucket === bucket).map((f) => f.path);
    for (const part of chunks(paths, 100)) await server().storage.from(bucket).remove(part);
  }
  const { error } = await server().rpc('clear_my_online_data');
  if (error) throw new Error(error.message);
  db.tracking = false;
  db.outbox = {};
  db.scheduleSave();
  await AsyncStorage.removeItem(cursorKey(userId));
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
