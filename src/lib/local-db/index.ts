import { createLocalClient, type LocalClient } from './client';
import { LocalDb, type Kv } from './engine';
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
  const url = await store.fileUrl(key);
  if (!url) return null;
  try {
    return await (await fetch(url)).arrayBuffer();
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
