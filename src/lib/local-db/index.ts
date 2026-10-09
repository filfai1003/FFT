import { createLocalClient, type LocalClient } from './client';
import { LocalDb } from './engine';
import { kv } from './kv';

const clients = new Map<string, LocalClient>();

/** The on-device database of one user (created on first use): the "backend" of free accounts. */
export function getLocalClient(userId: string): LocalClient {
  let client = clients.get(userId);
  if (!client) {
    client = createLocalClient(new LocalDb(kv, userId));
    clients.set(userId, client);
  }
  return client;
}

export { LOCAL_USER_ID } from './schema';
