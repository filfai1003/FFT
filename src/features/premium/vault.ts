import type { SupabaseClient } from '@supabase/supabase-js';
import { getLocalDb } from '@/lib/local-db';
import { usePlanStore } from '@/lib/plan';
import { getAuthClient } from '@/lib/supabase';
import {
  calibrateKdf,
  createVault,
  rewrapWithPassphrase,
  unlockWithPassphrase,
  unlockWithRecovery,
  type VaultRecord,
} from '@/lib/vault-crypto';
import {
  finishServerCleanup,
  haltSync,
  markVaultClear,
  noteCleanup,
  pull,
  READABLE_FILES,
  resumeSync,
  sendSealed,
  switchCopyMode,
  syncOnce,
} from './sync';
import { storeVaultKey, vaultKey } from './vault-key';

/**
 * End-to-end encryption of the copy on the server (DECISIONS 64): one switch for the whole copy.
 * The data key never leaves the device unwrapped; the server keeps it wrapped with the passphrase
 * and with the recovery key (vault_keys), and keeps the data only sealed (vault_rows,
 * vault-files). Turning it on or off moves the whole copy from one form to the other.
 */

const server = () => getAuthClient() as unknown as SupabaseClient;

/** The wrapped key kept on the server (null: none set up). */
export async function fetchVaultRecord(): Promise<VaultRecord | null> {
  const { data, error } = await server().rpc('my_vault_keys');
  if (error) throw new Error(error.message);
  return (data as VaultRecord | null) ?? null;
}

async function saveVaultRecord(record: VaultRecord) {
  const { error } = await server().rpc('save_vault_keys', { p_record: record });
  if (error) throw new Error(error.message);
}

/**
 * First step of turning encryption on: a new data key, wrapped with the passphrase (scrypt
 * measured on this device) and with a new recovery key, stored on the server; the key is kept on
 * this device. Returns the recovery key, to be shown once.
 */
export async function setUpEncryption(userId: string, passphrase: string): Promise<string> {
  const kdf = await calibrateKdf();
  const { dataKey, recoveryCode, record } = await createVault(passphrase, kdf);
  await saveVaultRecord(record);
  await storeVaultKey(userId, dataKey);
  return recoveryCode;
}

/**
 * Turns encryption on (after setUpEncryption). In this order, so that nothing is lost:
 * 1. what other devices sent is fetched first (best effort);
 * 2. the background sync stops; every row here goes up sealed, photos too;
 * 3. the server switches and deletes the readable copy in the same transaction;
 * 4. this device syncs sealed from now on; the readable files are removed (retried at start).
 * If anything fails before 3, nothing changed on the server's readable copy.
 */
export async function turnEncryptionOn(userId: string): Promise<void> {
  const key = await vaultKey(userId);
  if (!key) throw new Error('no key on this device');
  if (usePlanStore.getState().sync !== 'on') throw new Error('the copy on the server is off');
  await pull(userId, { full: true }).catch(() => false);
  const db = getLocalDb(userId);
  await db.ready;
  haltSync(userId);
  try {
    db.markAllDirty();
    await sendSealed(userId, key);
    const { error } = await server().rpc('set_vault', { p_on: true });
    if (error) throw new Error(error.message);
  } catch (e) {
    resumeSync(userId);
    // What waits goes up readable again at the next sync.
    db.markAllDirty();
    throw e;
  }
  // Everything is up sealed already: nothing to send again.
  await switchCopyMode(userId, true, { resend: false });
  await noteCleanup(userId, READABLE_FILES);
  resumeSync(userId);
  await finishServerCleanup(userId);
}

/**
 * Turns encryption off: everything comes back readable to the server (the API and AI apps work
 * again). The sealed copy is fetched first, the server switches, every row here goes up readable,
 * and only then the sealed copy and the key are deleted (at the next sync if the network drops).
 */
export async function turnEncryptionOff(userId: string): Promise<void> {
  if (await vaultKey(userId)) await pull(userId, { full: true }).catch(() => false);
  haltSync(userId);
  try {
    const { error } = await server().rpc('set_vault', { p_on: false });
    if (error) throw new Error(error.message);
  } catch (e) {
    resumeSync(userId);
    throw e;
  }
  await switchCopyMode(userId, false);
  await markVaultClear(userId);
  resumeSync(userId);
  await syncOnce(userId).catch(() => false);
}

/**
 * Another device, or this one after a new install: the passphrase (or the recovery key) opens the
 * key kept on the server; it is then kept on this device and everything here goes up again sealed.
 */
export async function unlockEncryption(
  userId: string,
  secret: string,
  how: 'passphrase' | 'recovery',
): Promise<void> {
  const record = await fetchVaultRecord();
  if (!record) throw new Error('no key on the server');
  const key =
    how === 'passphrase'
      ? await unlockWithPassphrase(record, secret)
      : unlockWithRecovery(record, secret);
  await storeVaultKey(userId, key);
  await switchCopyMode(userId, true);
}

/** A new passphrase: only its wrap of the key changes on the server; the data stays as it is. */
export async function changePassphrase(userId: string, next: string): Promise<void> {
  const key = await vaultKey(userId);
  if (!key) throw new Error('no key on this device');
  const record = await fetchVaultRecord();
  if (!record) throw new Error('no key on the server');
  await saveVaultRecord(await rewrapWithPassphrase(record, key, next, await calibrateKdf()));
}
