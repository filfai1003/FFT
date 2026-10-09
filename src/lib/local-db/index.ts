import { createLocalClient, type LocalClient } from './client';
import { LocalDb } from './engine';
import { kv } from './kv';

let client: LocalClient | null = null;

/** The on-device "backend" of the offline mode (created on first use). */
export function getLocalClient(): LocalClient {
  client ??= createLocalClient(new LocalDb(kv));
  return client;
}

export { LOCAL_USER_ID } from './schema';
