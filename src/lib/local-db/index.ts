import { createLocalClient, type LocalClient } from './client';
import { LocalDb, type Kv } from './engine';
import { kv } from './kv';

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

export { LOCAL_USER_ID } from './schema';
