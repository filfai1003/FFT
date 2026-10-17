import { createLocalClient, type LocalClient } from './client';
import { LocalDb, SEEDED_AT, type Kv } from './engine';
import { kv } from './kv';
import { columns, withDefaults, type Row } from './schema';

const clients = new Map<string, LocalClient>();
const dbs = new Map<string, LocalDb>();

function dbFor(userId: string, store: Kv = kv): LocalDb {
  let db = dbs.get(userId);
  if (!db) {
    db = new LocalDb(store, userId);
    dbs.set(userId, db);
  }
  return db;
}

/** Finishes every pending write of the on-device databases (call before the app restarts). */
export async function flushLocalDbs(): Promise<void> {
  await Promise.all([...dbs.values()].map((db) => db.flush()));
}

/** The on-device database itself (the sync reads its outbox and applies the server's rows). */
export function getLocalDb(userId: string): LocalDb {
  return dbFor(userId);
}

/** The on-device database of one user (created on first use): the "backend" of free accounts. */
export function getLocalClient(userId: string): LocalClient {
  let client = clients.get(userId);
  if (!client) {
    client = createLocalClient(dbFor(userId));
    clients.set(userId, client);
  }
  return client;
}

/** Every value equal to `from` (ids of the owner) becomes `to`; nothing else changes. */
function reassign<T>(value: T, from: string, to: string): T {
  if (value === from) return to as T;
  if (Array.isArray(value)) return value.map((v) => reassign(v, from, to)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, reassign(v, from, to)]),
    ) as T;
  return value;
}

/**
 * Moves everything one user has on this device to another user id: used when the account-less
 * mode gets an email and password. The new account's database is written in full (rows keep
 * their ids, only the owner changes; photo files stay where they are) and the old one is
 * emptied, so the data exists once.
 */
export async function moveLocalData(from: string, to: string, store: Kv = kv): Promise<number> {
  const source = dbs.get(from) ?? new LocalDb(store, from);
  await source.ready;
  const tables = reassign(source.tables, from, to);
  const rows = Object.values(tables).reduce((n, list) => n + list.length, 0);
  await store.setText(`database-${to}.json`, JSON.stringify({ format: 1, tables }));
  // The new account starts from the moved file the first time it is opened.
  dbs.delete(to);
  clients.delete(to);
  await source.wipeTables();
  dbs.delete(from);
  clients.delete(from);
  return rows;
}

/**
 * True when the database holds something the user made: anything but the catalogue, the shared
 * foods (and their portions) and the empty profile and settings every database starts with.
 */
export function hasOwnData(db: LocalDb): boolean {
  const ownFoods = new Set(
    (db.tables.foods ?? []).filter((f) => f.owner_id != null).map((f) => f.id),
  );
  return Object.entries(db.tables).some(([table, rows]) =>
    rows.some((r) => {
      if ((table === 'exercises' || table === 'foods') && r.owner_id == null) return false;
      if (table === 'food_servings') return ownFoods.has(r.food_id);
      if ((table === 'profiles' || table === 'user_settings') && r.updated_at === SEEDED_AT)
        return false;
      return true;
    }),
  );
}

export type CopyResult =
  | { ok: true; rows: number; files: number; missingFiles: number }
  /** The target already holds data of its own: nothing was written. */
  | { ok: false; reason: 'not-empty' };

/** The buckets whose files live on the device, and the row field that points to them. */
const FILE_FIELDS = [
  { table: 'progress_photos', field: 'storage_path', bucket: 'progress-photos' },
  { table: 'exercises', field: 'image_path', bucket: 'user-exercise-images' },
] as const;

/**
 * Copies one user's on-device database into another, empty one (an account deleted but its data
 * kept on the phone: the account-less mode takes it over). Rows keep their ids, the owner id
 * becomes `to`; photo files are copied into `to`'s folder (`<to>/<name>`) and the rows point to
 * the copies, so wiping `from` afterwards leaves them alone. The source is not changed. Nothing is
 * queued for sync. When `to` already holds data of its own, nothing is written (no merge: two
 * profiles, two settings rows and two active plans have no safe answer).
 */
export async function copyLocalData(from: string, to: string, store: Kv = kv): Promise<CopyResult> {
  const source = dbs.get(from) ?? new LocalDb(store, from);
  await source.flush();
  const target = dbs.get(to) ?? new LocalDb(store, to);
  await target.flush();
  if (hasOwnData(target)) return { ok: false, reason: 'not-empty' };

  const tables = reassign(source.tables, from, to);
  const newPath = (path: string) =>
    path.startsWith(`${from}/`) ? `${to}/${path.slice(from.length + 1)}` : `${to}/${path}`;
  let files = 0;
  let missingFiles = 0;
  for (const { table, field, bucket } of FILE_FIELDS) {
    for (const row of tables[table] ?? []) {
      const path = row[field];
      if (typeof path !== 'string' || !path) continue;
      // Catalogue pictures ship with the app: only the user's own exercises have a file here.
      if (table === 'exercises' && row.owner_id == null) continue;
      const next = newPath(path);
      const bytes = await store.readFile(`${bucket}/${path}`);
      if (bytes) {
        await store.putFile(`${bucket}/${next}`, bytes, 'image/jpeg');
        files += 1;
      } else if (row.deleted_at == null) missingFiles += 1;
      row[field] = next;
    }
  }
  const rows = Object.values(tables).reduce((n, list) => n + list.length, 0);
  // Files first: the database never points to a picture that is not there yet.
  await store.setText(`database-${to}.json`, JSON.stringify({ format: 1, tables }));
  dbs.delete(to);
  clients.delete(to);
  return { ok: true, rows, files, missingFiles };
}

/** Every table of one user's on-device database (read only: use the client to change rows). */
export async function readLocalTables(
  userId: string,
  store: Kv = kv,
): Promise<Record<string, Row[]>> {
  const db = dbFor(userId, store);
  await db.ready;
  return db.tables;
}

/**
 * Puts rows that come from the server into one user's on-device database (premium ended): each
 * table given replaces the user's rows of that table; the catalogue and the Open Food Facts foods
 * already on the device are kept.
 */
export async function replaceLocalTables(
  userId: string,
  incoming: Record<string, Row[]>,
  store: Kv = kv,
): Promise<void> {
  const db = dbFor(userId, store);
  await db.ready;
  for (const [table, rows] of Object.entries(incoming)) {
    if (!columns[table]) continue;
    const ids = new Set(rows.map((r) => r.id));
    const shared =
      table === 'exercises' || table === 'foods'
        ? db.tables[table].filter((r) => r.owner_id == null && !ids.has(r.id))
        : table === 'food_servings'
          ? db.tables[table].filter((r) => !ids.has(r.id))
          : [];
    const clean = rows.map((r) =>
      withDefaults(
        table,
        Object.fromEntries(columns[table].filter((c) => c in r).map((c) => [c, r[c]])),
        userId,
      ),
    );
    db.tables[table] = [...shared, ...clean];
  }
  await db.save();
}

/** Erases one user's data and files on this device (it now lives on the server). */
export async function wipeLocalData(userId: string, store: Kv = kv): Promise<void> {
  await dbFor(userId, store).wipe();
}

/** The bytes of a file kept on the device (`<bucket>/<path>`), or null when it is missing. */
export async function readLocalFile(key: string, store: Kv = kv): Promise<ArrayBuffer | null> {
  try {
    const bytes = await store.readFile(key);
    return bytes
      ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      : null;
  } catch {
    return null;
  }
}

/** A URL the app can show (an image), or null when the file is not on this device. */
export async function localFileUrl(key: string, store: Kv = kv): Promise<string | null> {
  return store.fileUrl(key);
}

export async function writeLocalFile(
  key: string,
  bytes: Uint8Array,
  mime: string,
  store: Kv = kv,
): Promise<void> {
  await store.putFile(key, bytes, mime);
}

export { LOCAL_USER_ID } from './schema';
export { columns, type Row } from './schema';
export { pkOf, type LocalDb, type Pending } from './engine';
