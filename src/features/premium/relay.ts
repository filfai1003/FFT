import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { create } from 'zustand';
import { tableShared } from '@/domain/data-categories';
import { base64ToBytes, bytesToBase64 } from '@/lib/base64';
import { reportError } from '@/lib/error-report';
import {
  getLocalDb,
  pkOf,
  readLocalFile,
  writeLocalFile,
  type LocalDb,
  type Pending,
  type Row,
} from '@/lib/local-db';
import { sharedCategories, usePlanStore } from '@/lib/plan';
import { authStorage } from '@/lib/secure-storage';
import { getAuthClient } from '@/lib/supabase';
import {
  formatSecretCode,
  openText,
  parseSecretCode,
  randomBytes,
  relayKeyFromCode,
  sealText,
  toHex,
  fromHex,
} from '@/lib/vault-crypto';
import { fileOf, isOwn, pick, SYNC_ORDER } from './sync';

/**
 * Encrypted relay between phones (DECISIONS 65), for accounts that keep NO copy on the server.
 * The phones of an account pair with a code shown as a QR code (160 random bits; it never goes to
 * the server); the key derived from it seals every message. A change made on one phone goes to
 * each other paired phone as a sealed message in a server mailbox; the phone it is for fetches
 * it, applies it (the newest change of each row wins, as with the copy on the server) and
 * acknowledges it, and the server deletes it at once (anything older than 30 days anyway). A phone
 * newly paired gets the whole database once from each of the others. Photos travel as sealed
 * messages too, deleted the same way. Only the categories the user shares are sent (DECISIONS 63).
 */

const server = () => getAuthClient() as unknown as SupabaseClient;
const stateKey = (userId: string) => `fft.relay.${userId}`;
const codeKey = (userId: string) => `fft.relay-code.${userId}`;
const CODE_PREFIX = 'FFTRELAY1:';
const ROWS_PER_MESSAGE = 200;

/** This phone in the relay: its id, its name, and the phones it already sent everything to. */
export type RelayState = { deviceId: string; name: string; sentFull: string[] };
export type RelayDevice = {
  device_id: string;
  name: string;
  last_seen_at: string | null;
  created_at: string;
};

/** Whether each account is paired on this phone (for the screens and the background run). */
export const useRelayStore = create<{ paired: Record<string, boolean> }>(() => ({ paired: {} }));
const markPaired = (userId: string, on: boolean) =>
  useRelayStore.setState((s) => ({ paired: { ...s.paired, [userId]: on } }));

export class InvalidCodeError extends Error {
  constructor() {
    super('not a pairing code');
  }
}

export async function loadRelay(userId: string): Promise<RelayState | null> {
  try {
    const saved = JSON.parse(
      (await AsyncStorage.getItem(stateKey(userId))) ?? 'null',
    ) as RelayState | null;
    const ok = saved != null && typeof saved.deviceId === 'string';
    markPaired(userId, ok);
    return ok ? { ...saved, sentFull: saved.sentFull ?? [] } : null;
  } catch {
    return null;
  }
}

async function saveRelay(userId: string, state: RelayState | null) {
  if (state) await AsyncStorage.setItem(stateKey(userId), JSON.stringify(state));
  else await AsyncStorage.removeItem(stateKey(userId));
  markPaired(userId, state != null);
}

async function storedCode(userId: string): Promise<Uint8Array | null> {
  try {
    const hex = await authStorage.getItem(codeKey(userId));
    return hex && /^[0-9a-f]{40}$/.test(hex) ? fromHex(hex) : null;
  } catch {
    return null;
  }
}

/** The pairing code of this account's relay, to show to another phone (null: not paired). */
export async function pairingCode(userId: string): Promise<{ text: string; qr: string } | null> {
  const code = await storedCode(userId);
  if (!code) return null;
  const text = formatSecretCode(code);
  return { text, qr: `${CODE_PREFIX}${text}` };
}

const deviceName = () => (Device.modelName ?? Device.deviceName ?? 'Phone').slice(0, 60);

async function pair(userId: string, code: Uint8Array): Promise<void> {
  const state: RelayState = { deviceId: Crypto.randomUUID(), name: deviceName(), sentFull: [] };
  const { error } = await server().rpc('relay_register', {
    p_device: state.deviceId,
    p_name: state.name,
  });
  if (error) throw new Error(error.message);
  await authStorage.setItem(codeKey(userId), toHex(code));
  await saveRelay(userId, state);
  const db = getLocalDb(userId);
  await db.ready;
  db.tracking = true;
}

/** The first phone: makes the pairing code and pairs itself. Returns the code to show. */
export async function startRelay(userId: string) {
  if (!(await loadRelay(userId))) await pair(userId, randomBytes(20));
  return pairingCode(userId);
}

/** Another phone: the code scanned (or typed) pairs it. Throws InvalidCodeError when it is not one. */
export async function joinRelay(userId: string, scanned: string): Promise<void> {
  const text = scanned.trim().replace(new RegExp(`^${CODE_PREFIX}`, 'i'), '');
  const code = parseSecretCode(text);
  if (!code) throw new InvalidCodeError();
  if (await loadRelay(userId)) await leaveRelay(userId);
  await pair(userId, code);
}

/** The account's paired phones (empty when the server cannot say). */
export async function relayDevices(): Promise<RelayDevice[]> {
  const { data, error } = await server().rpc('relay_list');
  if (error) throw new Error(error.message);
  return (data as RelayDevice[] | null) ?? [];
}

/** This phone stops: forgets the code and its state (its data stays). */
async function forgetRelayHere(userId: string) {
  await saveRelay(userId, null);
  try {
    await authStorage.removeItem(codeKey(userId));
  } catch {
    // Nothing stored.
  }
  const db = getLocalDb(userId);
  await db.ready;
  db.tracking = false;
  db.outbox = {};
  db.scheduleSave();
}

/**
 * The copy on the server was turned on: the server ended the relay (set_sync deleted the paired
 * phones and their messages); this phone forgets it, and the sync takes over its outbox.
 */
export async function endRelayHere(userId: string): Promise<void> {
  await saveRelay(userId, null);
  try {
    await authStorage.removeItem(codeKey(userId));
  } catch {
    // Nothing stored.
  }
}

/** Unpairs this phone (on the server too). Its data stays on it. */
export async function leaveRelay(userId: string): Promise<void> {
  const state = await loadRelay(userId);
  if (state) {
    const { error } = await server().rpc('relay_remove', { p_device: state.deviceId });
    if (error) throw new Error(error.message);
  }
  await forgetRelayHere(userId);
}

/** Unpairs another phone: it receives nothing more, and what waited for it is deleted. */
export async function removeRelayDevice(userId: string, deviceId: string): Promise<void> {
  const state = await loadRelay(userId);
  if (state?.deviceId === deviceId) return leaveRelay(userId);
  const { error } = await server().rpc('relay_remove', { p_device: deviceId });
  if (error) throw new Error(error.message);
  if (state)
    await saveRelay(userId, { ...state, sentFull: state.sentFull.filter((d) => d !== deviceId) });
}

// --- messages -----------------------------------------------------------------------------------

type RelayMessage =
  | {
      v: 1;
      kind: 'rows';
      rows: { t: string; r: Row }[];
      deletes: { t: string; id: string; at: string }[];
    }
  | { v: 1; kind: 'file'; bucket: string; path: string; data: string };

const aad = (to: string, from: string) => `relay:${to}:${from}`;

/** Rows (and the photos they point to) as messages. */
async function messagesFor(
  db: LocalDb,
  userId: string,
  ups: { table: string; row: Row }[],
  deletes: { t: string; id: string; at: string }[],
): Promise<RelayMessage[]> {
  const out: RelayMessage[] = [];
  for (let i = 0; i < Math.max(ups.length, 1); i += ROWS_PER_MESSAGE) {
    const part = ups.slice(i, i + ROWS_PER_MESSAGE).map((u) => ({ t: u.table, r: u.row }));
    if (part.length > 0 || (i === 0 && deletes.length > 0))
      out.push({ v: 1, kind: 'rows', rows: part, deletes: i === 0 ? deletes : [] });
  }
  for (const { table, row } of ups) {
    const f = fileOf(table, row);
    if (!f) continue;
    const bytes = await readLocalFile(`${f.bucket}/${f.path}`);
    if (bytes)
      out.push({
        v: 1,
        kind: 'file',
        bucket: f.bucket,
        path: f.path,
        data: bytesToBase64(new Uint8Array(bytes)),
      });
  }
  return out;
}

/** Every own row of the shared categories: what a newly paired phone receives. */
function everything(db: LocalDb, userId: string) {
  const categories = sharedCategories(userId);
  return SYNC_ORDER.filter((t) => tableShared(t, categories)).flatMap((table) =>
    (db.tables[table] ?? [])
      .filter((r) => isOwn(db, table, r, userId))
      .map((r) => ({ table, row: pick(table, r) })),
  );
}

/** The outbox, as rows and deletions (only the shared categories; gone rows are skipped). */
function changes(db: LocalDb, userId: string, pending: Pending[]) {
  const categories = sharedCategories(userId);
  const ups: { table: string; row: Row }[] = [];
  const deletes: { t: string; id: string; at: string }[] = [];
  for (const table of SYNC_ORDER) {
    if (!tableShared(table, categories)) continue;
    for (const p of pending.filter((x) => x.table === table)) {
      if (p.op === 'delete') {
        deletes.push({ t: table, id: p.key, at: p.at });
        continue;
      }
      const row = (db.tables[table] ?? []).find((r) => String(r[pkOf(table)]) === p.key);
      if (row && isOwn(db, table, row, userId)) ups.push({ table, row: pick(table, row) });
    }
  }
  return { ups, deletes };
}

/** Under the gateway's 1 MB body limit, with room for the JSON around the payloads. */
const MAX_REQUEST_PAYLOAD = 950_000;

async function send(key: Uint8Array, from: string, to: string[], messages: RelayMessage[]) {
  const sealed = to.flatMap((peer) =>
    messages.map((m) => ({
      to: peer,
      from,
      payload: sealText(key, JSON.stringify(m), aad(peer, from)),
    })),
  );
  // Up to 20 messages or about 1 MB per request; a big one (a photo) alone.
  let batch: typeof sealed = [];
  let size = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await server().rpc('relay_send', { p_messages: batch });
    if (error) throw new Error(error.message);
    batch = [];
    size = 0;
  };
  for (const m of sealed) {
    // The gateway refuses request bodies over 1 MB (docs/DEPLOY.md): a message that big would fail
    // at every sync and hold back everything after it, so it is left out and reported instead.
    if (m.payload.length > MAX_REQUEST_PAYLOAD) {
      reportError(new Error(`relay message too big (${m.payload.length} bytes), not sent`));
      continue;
    }
    if (batch.length >= 20 || size + m.payload.length > MAX_REQUEST_PAYLOAD) await flush();
    batch.push(m);
    size += m.payload.length;
  }
  await flush();
}

/** Applies a message from another phone; returns whether anything changed here. */
async function apply(db: LocalDb, userId: string, m: RelayMessage): Promise<boolean> {
  const categories = sharedCategories(userId);
  if (m.kind === 'file') {
    if (!fileFromShared(m.bucket, categories)) return false;
    await writeLocalFile(`${m.bucket}/${m.path}`, base64ToBytes(m.data), 'image/jpeg');
    return true;
  }
  let changed = false;
  for (const table of SYNC_ORDER) {
    if (!tableShared(table, categories)) continue;
    const rows = m.rows.filter((x) => x.t === table).map((x) => x.r);
    const deleted = m.deletes.filter((d) => d.t === table).map((d) => ({ id: d.id, at: d.at }));
    if ((rows.length > 0 || deleted.length > 0) && db.applyRemote(table, rows, deleted))
      changed = true;
  }
  return changed;
}

const fileFromShared = (bucket: string, categories: ReturnType<typeof sharedCategories>) =>
  bucket === 'progress-photos'
    ? categories.includes('photos')
    : bucket === 'user-exercise-images'
      ? categories.includes('training')
      : false;

/**
 * One round of the relay: sends what changed here (everything to a newly paired phone), then
 * fetches, applies and acknowledges what the other phones sent. Returns whether anything changed
 * here. Does nothing for an account that keeps a copy on the server, or a phone not paired.
 */
export async function relayOnce(userId: string): Promise<boolean> {
  const plan = usePlanStore.getState();
  if (plan.userId === userId && plan.sync === 'on') return false;
  const state = await loadRelay(userId);
  const code = state ? await storedCode(userId) : null;
  if (!state || !code) return false;
  const key = relayKeyFromCode(code);
  const db = getLocalDb(userId);
  await db.ready;
  db.tracking = true;

  const devices = await relayDevices();
  // Unpaired from another phone (or the copy on the server was turned on): this phone stops.
  if (!devices.some((d) => d.device_id === state.deviceId)) {
    await forgetRelayHere(userId);
    return false;
  }
  const peers = devices.map((d) => d.device_id).filter((d) => d !== state.deviceId);
  const known = peers.filter((p) => state.sentFull.includes(p));
  const fresh = peers.filter((p) => !state.sentFull.includes(p));

  const pending = Object.values(db.outbox);
  if (known.length > 0 && pending.length > 0) {
    const { ups, deletes } = changes(db, userId, pending);
    await send(key, state.deviceId, known, await messagesFor(db, userId, ups, deletes));
  }
  if (fresh.length > 0) {
    await send(
      key,
      state.deviceId,
      fresh,
      await messagesFor(db, userId, everything(db, userId), []),
    );
  }
  // Sent to every phone (a phone paired later gets everything anyway).
  db.settle(pending);
  if (fresh.length > 0 || state.sentFull.some((d) => !peers.includes(d)))
    await saveRelay(userId, { ...state, sentFull: [...known, ...fresh] });

  let changed = false;
  for (let round = 0; round < 50; round++) {
    const { data, error } = await server().rpc('relay_fetch', { p_device: state.deviceId });
    if (error) throw new Error(error.message);
    const inbox = (data as { id: string; from: string; payload: string }[] | null) ?? [];
    if (inbox.length === 0) break;
    for (const item of inbox) {
      try {
        const m = JSON.parse(
          openText(key, item.payload, aad(state.deviceId, item.from)),
        ) as RelayMessage;
        if (await apply(db, userId, m)) changed = true;
      } catch (e) {
        // Not sealed with this key (a phone paired with another code) or damaged: dropped.
        reportError(e, 'sync', { via: 'relay' });
      }
    }
    const ack = await server().rpc('relay_ack', {
      p_device: state.deviceId,
      p_ids: inbox.map((i) => i.id),
    });
    if (ack.error) throw new Error(ack.error.message);
  }
  return changed;
}
