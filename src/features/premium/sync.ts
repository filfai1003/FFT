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
import {
  CATEGORY_TABLES,
  normalizeCategories,
  tableShared,
  type DataCategory,
} from '@/domain/data-categories';
import {
  copyEncrypted,
  isPlan,
  savePlan,
  sharedCategories,
  usePlanStore,
  type Plan,
  type SyncChoice,
} from '@/lib/plan';
import { hiddenName, openFile, openRow, sealFile, sealRow } from '@/lib/vault-crypto';
import { forgetVaultKey, vaultKey } from './vault-key';
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
/** Sealed photos of an end-to-end encrypted copy (DECISIONS 64). */
const VAULT_FILES = 'vault-files';
const CHUNK = 200;
const EPOCH = '1970-01-01T00:00:00.000Z';
/** Pull a little before the last cursor: rows committed late are not missed (applying twice is harmless). */
const OVERLAP_MS = 2 * 60 * 1000;
/**
 * The server keeps deletions (tombstones) 90 days (DECISIONS 78). A device whose last pull is
 * older than this (a margin under 90) downloads everything again and drops what is gone there.
 */
const STALE_AFTER_MS = 80 * 24 * 60 * 60 * 1000;
export const isStale = (cursor: string | null, now = Date.now()) =>
  cursor != null && now - Date.parse(cursor) > STALE_AFTER_MS;

const server = () => getAuthClient() as unknown as SupabaseClient;
const cursorKey = (userId: string) => `fft.sync.${userId}`;
const vaultCursorKey = (userId: string) => `fft.sync.sealed.${userId}`;
const vaultClearKey = (userId: string) => `fft.sync.sealed-to-clear.${userId}`;

const chunks = <T>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export const pick = (table: string, row: Row): Row =>
  Object.fromEntries((columns[table] ?? []).filter((c) => c in row).map((c) => [c, row[c]]));

/** Only the user's own rows go up (catalogue exercises and Open Food Facts foods are shared). */
export function isOwn(db: LocalDb, table: string, row: Row, userId: string): boolean {
  if (table === 'exercises' || table === 'foods') return row.owner_id === userId;
  if (table === 'food_servings')
    return (db.tables.foods ?? []).some((f) => f.id === row.food_id && f.owner_id === userId);
  if (table === 'profiles') return row.id === userId;
  return row.user_id === userId;
}

/** The file a row points to, if it has one kept on the device. */
export function fileOf(table: string, row: Row): { bucket: string; path: string } | null {
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

/** How the outbox goes up: readable rows, or sealed ones (end-to-end encryption, DECISIONS 64). */
type FileRef = { bucket: string; path: string };
type Del = { id: string; at: string; file?: FileRef };
type Sender = {
  upsert(table: string, rows: Row[]): Promise<PushError | null>;
  /** Deletes rows on the server, and the files they had (a purged photo, DECISIONS 78). */
  remove(table: string, dels: Del[]): Promise<PushError | null>;
  file(f: FileRef): Promise<void>;
};
type PushError = { message: string; code?: string };

/** Removes files from the server, best effort (the server's own purge catches what is left). */
async function removeFiles(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  await server()
    .storage.from(bucket)
    .remove(paths)
    .catch(() => undefined);
}

const readable: Sender = {
  upsert: (table, rows) => pushRows(table, rows, []),
  remove: async (table, dels) => {
    const error = await pushRows(
      table,
      [],
      dels.map(({ id, at }) => ({ id, at })),
    );
    if (!error) {
      const files = dels.flatMap((d) => (d.file ? [d.file] : []));
      for (const bucket of new Set(files.map((f) => f.bucket)))
        await removeFiles(
          bucket,
          files.filter((f) => f.bucket === bucket).map((f) => f.path),
        );
    }
    return error;
  },
  file: uploadFile,
};

/** Where a sealed file lives on the server: a name that does not tell which photo it is. */
const sealedPath = (userId: string, key: Uint8Array, f: { bucket: string; path: string }) =>
  `${userId}/${f.bucket === PHOTOS ? 'p-' : 't-'}${hiddenName(key, `${f.bucket}/${f.path}`)}`;

const isoTime = (v: unknown) => {
  const t = Date.parse(String(v ?? ''));
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
};

function sealedSender(userId: string, key: Uint8Array): Sender {
  const send = async (items: Record<string, unknown>[]) =>
    (await server().rpc('vault_push', { p_rows: items })).error;
  return {
    upsert: (table, rows) =>
      send(
        rows.map((r) => {
          const id = String(r[pkOf(table)]);
          return {
            tbl: table,
            row_id: id,
            updated_at: isoTime(r.updated_at),
            ciphertext: sealRow(key, table, id, r),
          };
        }),
      ),
    remove: async (table, dels) => {
      const error = await send(
        dels.map((d) => ({ tbl: table, row_id: d.id, updated_at: isoTime(d.at), deleted: true })),
      );
      // The sealed copies of the files go too.
      if (!error)
        await removeFiles(
          VAULT_FILES,
          dels.flatMap((d) => (d.file ? [sealedPath(userId, key, d.file)] : [])),
        );
      return error;
    },
    file: async (f) => {
      const bytes = await readLocalFile(`${f.bucket}/${f.path}`);
      if (!bytes) return;
      const name = `${f.bucket}/${f.path}`;
      await server()
        .storage.from(VAULT_FILES)
        .upload(sealedPath(userId, key, f), sealFile(key, name, new Uint8Array(bytes)), {
          contentType: 'application/octet-stream',
          upsert: true,
        });
    },
  };
}

export async function push(userId: string): Promise<number> {
  if (halted.has(userId) || serverCopyOff(userId)) return 0;
  if (copyEncrypted(userId)) {
    // Locked (the passphrase was not entered on this device yet): everything waits.
    const key = await vaultKey(userId);
    return key ? sendOutbox(userId, sealedSender(userId, key)) : 0;
  }
  return sendOutbox(userId, readable);
}

/**
 * Sends the outbox sealed with `key`, whatever the state of the copy: used while encryption is
 * being turned on (the sealed copy goes up before the readable one is deleted).
 */
export const sendSealed = (userId: string, key: Uint8Array) =>
  sendOutbox(userId, sealedSender(userId, key));

async function sendOutbox(userId: string, sender: Sender): Promise<number> {
  const db = getLocalDb(userId);
  await db.ready;
  const pending = Object.values(db.outbox);
  if (pending.length === 0) return 0;
  const byTable = new Map<string, Pending[]>();
  const sent: Pending[] = [];
  // Categories the user does not keep on the server never go up (DECISIONS 63): forgotten here,
  // queued again in full if the category is turned on.
  const categories = sharedCategories(userId);
  for (const p of pending) {
    if (!tableShared(p.table, categories)) sent.push(p);
    else byTable.set(p.table, [...(byTable.get(p.table) ?? []), p]);
  }
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
        if (f) await sender.file(f);
      }
      const error = await sender.upsert(
        table,
        part.map((r) => r.row),
      );
      if (!error) {
        sent.push(...part.map((r) => r.p));
        continue;
      }
      if (isNetworkError(error)) throw new Error(error.message);
      // One bad row must not block the others: send them one by one, drop the refused ones.
      for (const r of part) {
        const e = await sender.upsert(table, [r.row]);
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
      const error = await sender.remove(
        table,
        part.map((p) => ({ id: p.key, at: p.at, ...(p.file ? { file: p.file } : {}) })),
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
  if (copyEncrypted(userId)) {
    const key = await vaultKey(userId);
    return key ? pullSealed(userId, key, opts) : false;
  }
  const db = getLocalDb(userId);
  await db.ready;
  // The device started with no readable database: everything comes back, not only what is new.
  const stored = await AsyncStorage.getItem(cursorKey(userId));
  // Away longer than the server keeps deletions: everything again, and what is gone there goes here.
  const stale = isStale(stored);
  const full = opts.full || db.freshStart || stale;
  const saved = full ? null : stored;
  const since = saved ? new Date(new Date(saved).getTime() - OVERLAP_MS).toISOString() : EPOCH;
  const { data, error } = await server().rpc('sync_pull', { p_since: since });
  if (error) throw new Error(error.message);
  const result = data as Record<string, unknown> & {
    now: string;
    tombstones: { table: string; id: string; at: string }[];
  };

  let changed = false;
  const categories = sharedCategories(userId);
  for (const table of SYNC_ORDER) {
    // A category not kept on the server: nothing of it is taken from there.
    if (!tableShared(table, categories)) continue;
    const rows = (result[table] as Row[] | undefined) ?? [];
    const deleted = result.tombstones.filter((t) => t.table === table);
    if (db.applyRemote(table, rows, deleted)) changed = true;
    if (stale) {
      const pk = pkOf(table);
      const present = new Set(rows.map((r) => String(r[pk])));
      if (db.dropMissing(table, present, (r) => isOwn(db, table, r, userId))) changed = true;
    }
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

type SealedItem = {
  tbl: string;
  row_id: string;
  updated_at: string;
  deleted: boolean;
  ciphertext: string | null;
};

/**
 * The same with an end-to-end encrypted copy: sealed rows are opened here with the data key (an
 * item that does not open, e.g. altered on the server, is left out and reported); photos are
 * downloaded sealed and opened.
 */
async function pullSealed(
  userId: string,
  key: Uint8Array,
  opts: { full?: boolean },
): Promise<boolean> {
  const db = getLocalDb(userId);
  await db.ready;
  const stored = await AsyncStorage.getItem(vaultCursorKey(userId));
  const stale = isStale(stored);
  const full = opts.full || db.freshStart || stale;
  const saved = full ? null : stored;
  const since = saved ? new Date(new Date(saved).getTime() - OVERLAP_MS).toISOString() : EPOCH;
  const { data, error } = await server().rpc('vault_pull', { p_since: since });
  if (error) throw new Error(error.message);
  const result = data as { now: string; rows: SealedItem[] };

  const byTable = new Map<string, { rows: Row[]; deleted: { id: string; at: string }[] }>();
  const slot = (t: string) => {
    if (!byTable.has(t)) byTable.set(t, { rows: [], deleted: [] });
    return byTable.get(t)!;
  };
  let unreadable = 0;
  for (const item of result.rows ?? []) {
    if (item.deleted) {
      slot(item.tbl).deleted.push({ id: item.row_id, at: isoTime(item.updated_at) });
      continue;
    }
    try {
      const row = openRow(key, item.tbl, item.row_id, String(item.ciphertext));
      if (String(row[pkOf(item.tbl)]) !== item.row_id) throw new Error('row id does not match');
      slot(item.tbl).rows.push(row);
    } catch {
      unreadable += 1;
    }
  }
  if (unreadable > 0)
    reportError(new Error(`${unreadable} sealed items could not be opened`), 'sync');

  let changed = false;
  const categories = sharedCategories(userId);
  for (const table of SYNC_ORDER) {
    if (!tableShared(table, categories)) continue;
    if (stale) {
      const present = new Set(
        (result.rows ?? []).filter((i) => i.tbl === table && !i.deleted).map((i) => i.row_id),
      );
      if (db.dropMissing(table, present, (r) => isOwn(db, table, r, userId))) changed = true;
    }
    const got = byTable.get(table);
    if (!got) continue;
    if (db.applyRemote(table, got.rows, got.deleted)) changed = true;
    for (const row of got.rows) {
      const f = fileOf(table, row);
      if (!f || (await readLocalFile(`${f.bucket}/${f.path}`))) continue;
      const res = await server()
        .storage.from(VAULT_FILES)
        .download(sealedPath(userId, key, f));
      if (res.error || !res.data) continue;
      try {
        const bytes = openFile(
          key,
          `${f.bucket}/${f.path}`,
          new Uint8Array(await res.data.arrayBuffer()),
        );
        await writeLocalFile(`${f.bucket}/${f.path}`, bytes, 'image/jpeg');
        changed = true;
      } catch {
        reportError(new Error('a sealed file could not be opened'), 'sync');
      }
    }
  }
  await AsyncStorage.setItem(vaultCursorKey(userId), result.now);
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
  // Encryption was turned off: once the readable copy is all up, the sealed one goes.
  if (!copyEncrypted(userId) && Object.keys(db.outbox).length === 0)
    await finishVaultClear(userId).catch((e: unknown) => reportError(e, 'sync'));
  const pulled = await pull(userId);
  // Rows deleted a week ago go for good (here, then on the server with the next push).
  const purged = (await db.purgeDeleted()) > 0;
  if (purged) db.scheduleSave();
  const changed = pulled || recovered || purged;
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
  // An encrypted copy: the sealed rows are counted (the server cannot tell what is in them).
  const { data, error } = await server().rpc(
    copyEncrypted(userId) ? 'vault_counts' : 'sync_counts',
  );
  if (error) throw new Error(error.message);
  const online = data as Record<string, number>;
  const categories = sharedCategories(userId);
  const differences = SYNC_ORDER.filter((t) => tableShared(t, categories)).flatMap((table) => {
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

const asChoice = (v: unknown): SyncChoice =>
  v === true ? 'on' : v === false ? 'off' : 'undecided';

/** The copy on the server as the server says: on / off / undecided, and the categories kept. */
export type SyncState = {
  sync: SyncChoice;
  categories: DataCategory[];
  /** End-to-end encrypted (DECISIONS 64). */
  encrypted: boolean;
};

/** What the server says about the copy on the server; null when it cannot be reached. */
export async function fetchSyncState(): Promise<SyncState | null> {
  try {
    const res = await server().rpc('my_sync_state');
    if (!res.error && res.data && typeof res.data === 'object') {
      const d = res.data as { enabled?: unknown; categories?: unknown; encrypted?: unknown };
      return {
        sync: asChoice(d.enabled),
        categories: normalizeCategories(d.categories),
        encrypted: d.encrypted === true,
      };
    }
    // A server from before DECISIONS 63: on / off only, everything kept.
    const old = await server().rpc('my_sync');
    if (old.error) return null;
    return { sync: asChoice(old.data), categories: normalizeCategories(null), encrypted: false };
  } catch {
    return null;
  }
}

/** What the server says about the copy on the server (on / off / undecided); null = unreachable. */
export async function fetchSyncChoice(): Promise<SyncChoice | null> {
  return (await fetchSyncState())?.sync ?? null;
}

/** The tables of some categories. */
export const tablesOf = (categories: readonly DataCategory[]) =>
  categories.flatMap((c) => CATEGORY_TABLES[c]);

/**
 * Files to remove from the server: a bucket ("progress-photos"), or the files of a bucket whose
 * name starts with something ("vault-files:p-" = the sealed progress photos).
 */
type CleanupTarget = string;
const ALL_FILES: CleanupTarget[] = [PHOTOS, EXERCISE_IMAGES, VAULT_FILES];
const isTarget = (v: unknown): v is CleanupTarget =>
  typeof v === 'string' && ALL_FILES.includes(v.split(':')[0]);

/** The files of some categories, readable and sealed. */
const filesOf = (categories: readonly DataCategory[]): CleanupTarget[] => [
  ...(categories.includes('photos') ? [PHOTOS, `${VAULT_FILES}:p-`] : []),
  ...(categories.includes('training') ? [EXERCISE_IMAGES, `${VAULT_FILES}:t-`] : []),
];

/** Files that still wait to be removed (all of them: an older device wrote only a time). */
async function filesToClean(userId: string): Promise<CleanupTarget[]> {
  const saved = await AsyncStorage.getItem(cleanupKey(userId));
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    if (Array.isArray(list)) return list.filter(isTarget);
  } catch {
    // A time (written before DECISIONS 63): every bucket.
  }
  return [PHOTOS, EXERCISE_IMAGES];
}

export async function noteCleanup(userId: string, targets: CleanupTarget[]) {
  const next = [...new Set([...(await filesToClean(userId)), ...targets])];
  await AsyncStorage.setItem(cleanupKey(userId), JSON.stringify(next));
}

/** Every file of an account: the readable ones and the sealed ones. */
export const EVERY_FILE: CleanupTarget[] = ALL_FILES;
/** The readable files only (encryption turned on: the sealed ones stay). */
export const READABLE_FILES: CleanupTarget[] = [PHOTOS, EXERCISE_IMAGES];

/**
 * Removes files of the account from private buckets (listed on the server, so files this phone
 * never downloaded go too). The rows are already gone (set_sync(false), a category turned off,
 * encryption turned on or off).
 */
async function removeServerFiles(userId: string, targets: CleanupTarget[]) {
  for (const target of targets) {
    const [bucket, prefix = ''] = target.split(':');
    // Pages of 100 (at most 20 000 files); a page that removes nothing ends it (no endless loop).
    for (let round = 0; round < 200; round++) {
      const { data, error } = await server()
        .storage.from(bucket)
        .list(userId, prefix ? { limit: 100, search: prefix } : { limit: 100 });
      if (error) throw new Error(error.message);
      const names = ((data ?? []) as { name: string }[])
        .filter((f) => f.name.startsWith(prefix))
        .map((f) => `${userId}/${f.name}`);
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
  const targets = await filesToClean(userId);
  if (targets.length === 0) return true;
  try {
    await removeServerFiles(userId, targets);
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
  // The sealed copy and its key went with it (set_sync(false), DECISIONS 64).
  await noteCleanup(userId, EVERY_FILE);
  await savePlan(userId, { sync: 'off', home: 'device', encrypted: false });
  await AsyncStorage.removeItem(vaultClearKey(userId));
  await forgetVaultKey(userId);
  await detachSync(userId);
  resumeSync(userId);
  await finishServerCleanup(userId);
}

/**
 * The copy became end-to-end encrypted, or readable again (here or on another device): this
 * device sends everything again in the new form (changes the server refused meanwhile are not
 * lost) and fetches everything from the start.
 */
export async function switchCopyMode(
  userId: string,
  encrypted: boolean,
  { resend = true }: { resend?: boolean } = {},
) {
  const db = getLocalDb(userId);
  await db.ready;
  await savePlan(userId, { encrypted });
  if (resend && db.tracking) db.markAllDirty();
  await AsyncStorage.removeItem(cursorKey(userId));
  await AsyncStorage.removeItem(vaultCursorKey(userId));
}

/** Encryption was turned off: the sealed copy goes once the readable one is all up. */
export async function markVaultClear(userId: string) {
  await AsyncStorage.setItem(vaultClearKey(userId), new Date().toISOString());
}

/**
 * Deletes the sealed copy, its key and its files (encryption turned off and the readable copy
 * up). Nothing happens when none waits.
 */
export async function finishVaultClear(userId: string): Promise<void> {
  if (!(await AsyncStorage.getItem(vaultClearKey(userId)))) return;
  const { error } = await server().rpc('clear_vault');
  if (error) throw new Error(error.message);
  await noteCleanup(userId, [VAULT_FILES]);
  await AsyncStorage.removeItem(vaultClearKey(userId));
  await forgetVaultKey(userId);
  await finishServerCleanup(userId);
}

/**
 * Turns the copy on the server on: the server notes it (and the categories to keep, DECISIONS 63:
 * all of them unless the user chose fewer), then everything on this phone of those categories
 * (every row and its photos) is queued and goes up with the next sync, which then brings back what
 * other devices have.
 */
export async function turnSyncOn(
  userId: string,
  categories: readonly DataCategory[] = normalizeCategories(null),
): Promise<void> {
  // Old files waiting to be removed go first: removing them later would remove the new uploads.
  await finishServerCleanup(userId);
  await AsyncStorage.removeItem(cleanupKey(userId));
  const { error } = await server().rpc('set_sync', { p_enabled: true });
  if (error) throw new Error(error.message);
  const kept = await server().rpc('set_sync_categories', { p_categories: [...categories] });
  if (kept.error) throw new Error(kept.error.message);
  await savePlan(userId, { categories: normalizeCategories(kept.data ?? categories) });
  resumeSync(userId);
  await startSync(userId);
  await savePlan(userId, { sync: 'on', home: 'online' });
}

/**
 * Chooses the categories kept on the server (DECISIONS 63). A category turned off is deleted
 * from the server at once (rows by the server, files here through the storage API, retried at the
 * next start if the network drops); this phone keeps everything. A category turned on: every row
 * of it here is queued to go up.
 */
export async function setSharedCategories(
  userId: string,
  next: readonly DataCategory[],
): Promise<void> {
  const before = sharedCategories(userId);
  const wanted = normalizeCategories(next);
  const added = wanted.filter((c) => !before.includes(c));
  // Files of a category turned off a moment ago go first: removing them later would remove the
  // new uploads.
  if (added.length > 0 && !(await finishServerCleanup(userId)))
    throw new Error('files of the server copy are still being removed');
  const { data, error } = await server().rpc('set_sync_categories', { p_categories: wanted });
  if (error) throw new Error(error.message);
  const kept = normalizeCategories(data ?? wanted);
  const removed = before.filter((c) => !kept.includes(c));
  const db = getLocalDb(userId);
  await db.ready;
  await savePlan(userId, { categories: kept });
  applyCategoryChange(db, before, kept);
  if (filesOf(removed).length > 0) {
    await noteCleanup(userId, filesOf(removed));
    await finishServerCleanup(userId);
  }
}

/**
 * The categories changed (here or on another device): the waiting changes of those turned off are
 * forgotten, every row of those turned on is queued (while this device syncs).
 */
export function applyCategoryChange(
  db: LocalDb,
  before: readonly DataCategory[],
  after: readonly DataCategory[],
) {
  const removed = before.filter((c) => !after.includes(c));
  const added = after.filter((c) => !before.includes(c));
  if (removed.length > 0) db.dropPending(tablesOf(removed));
  if (added.length > 0 && db.tracking) db.markAllDirty(tablesOf(added));
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
