import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils';
import { hkdf } from '@noble/hashes/hkdf';
import { scryptAsync } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha2';
import * as Crypto from 'expo-crypto';
import { base64ToBytes, bytesToBase64 } from './base64';

/**
 * End-to-end encryption of what leaves the phone (DECISIONS 64, 65). Audited pure JavaScript
 * (@noble), so it runs the same on phones (Hermes), in the browser and in tests; no native code.
 *
 * - Items (a row as JSON, a photo) are sealed with XChaCha20-Poly1305 under a 256-bit data key:
 *   a random 192-bit nonce per item (safe with random nonces), and "associated data" naming what
 *   the item is (table and row id, or the file), so the server cannot swap two items unnoticed.
 *   Format: version byte (1) | nonce (24) | ciphertext + tag (16), then base64.
 * - The data key is random. It is stored on the server only wrapped (sealed) twice: with a key
 *   derived from the user's passphrase (scrypt, salt and parameters stored with it) and with a key
 *   derived from a random recovery key shown once (HKDF: it already has 160 random bits).
 */

export type KdfParams = { alg: 'scrypt'; N: number; r: number; p: number };

/** What the server keeps (table vault_keys): nothing in it opens the data without a secret. */
export type VaultRecord = {
  kdf: KdfParams;
  /** Salt of the passphrase key (base64). */
  salt: string;
  wrapped_by_passphrase: string;
  wrapped_by_recovery: string;
  /** A known text sealed with the data key: tells a right key from a wrong one. */
  key_check: string;
};

export class WrongSecretError extends Error {
  constructor() {
    super('wrong passphrase or recovery key');
  }
}

const VERSION = 1;
const NONCE = 24;
const CHECK = 'fft-vault-check';
/** Passphrases shorter than this are refused (the recovery key is the strong way back). */
export const MIN_PASSPHRASE = 10;

export const randomBytes = (n: number): Uint8Array => Crypto.getRandomBytes(n);

/** Seals bytes; `aad` names what they are (must be the same to open them). */
export function seal(key: Uint8Array, plain: Uint8Array, aad: string): Uint8Array {
  const nonce = randomBytes(NONCE);
  const sealed = xchacha20poly1305(key, nonce, utf8ToBytes(aad)).encrypt(plain);
  const out = new Uint8Array(1 + NONCE + sealed.length);
  out[0] = VERSION;
  out.set(nonce, 1);
  out.set(sealed, 1 + NONCE);
  return out;
}

/** Opens sealed bytes; throws when the key, the name or the bytes are not right. */
export function open(key: Uint8Array, box: Uint8Array, aad: string): Uint8Array {
  if (box.length < 1 + NONCE + 16 || box[0] !== VERSION) throw new Error('not a sealed item');
  return xchacha20poly1305(key, box.subarray(1, 1 + NONCE), utf8ToBytes(aad)).decrypt(
    box.subarray(1 + NONCE),
  );
}

export const sealText = (key: Uint8Array, text: string, aad: string) =>
  bytesToBase64(seal(key, utf8ToBytes(text), aad));

export const openText = (key: Uint8Array, box: string, aad: string) =>
  bytesToUtf8(open(key, base64ToBytes(box), aad));

/** The key a passphrase gives (scrypt; yields to the app while it works). */
export async function passphraseKey(
  passphrase: string,
  salt: Uint8Array,
  kdf: KdfParams,
): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(passphrase.normalize('NFKC')), salt, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    dkLen: 32,
    asyncTick: 25,
  });
}

/** The key a recovery key gives (it is random already: no slow function needed). */
export const recoveryWrapKey = (recovery: Uint8Array) =>
  hkdf(sha256, recovery, undefined, 'fft-vault-recovery-1', 32);

/**
 * The key of the relay between phones (DECISIONS 65), from the pairing code (160 random bits,
 * shown as a QR code and as 32 characters): it never reaches the server.
 */
export const relayKeyFromCode = (code: Uint8Array) =>
  hkdf(sha256, code, undefined, 'fft-relay-1', 32);

// --- recovery key: 160 random bits, 32 characters in 8 groups --------------------------------
// Crockford's base32: no I, L, O, U (they look like 1, 1, 0, V); read back case-insensitively.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_BYTES = 20;

export function formatSecretCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)?.join('-') ?? '';
}

/** A typed code back to its bytes, or null when it is not one (wrong length or letters). */
export function parseSecretCode(text: string, size = RECOVERY_BYTES): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (clean.length !== Math.ceil((size * 8) / 5)) return null;
  const out = new Uint8Array(size);
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8 && o < size) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return o === size ? out : null;
}

// --- the vault ----------------------------------------------------------------------------------

/**
 * scrypt parameters for this device: as strong as it can do in about 1.5 s (measured on a small
 * run), between 2^14 (the minimum, 16 MB) and 2^16 (64 MB), r = 8, p = 1. Stored with the vault,
 * so every device derives the same key (a slower one just takes longer, once).
 */
export async function calibrateKdf(
  budgetMs = 1500,
  now: () => number = () => Date.now(),
): Promise<KdfParams> {
  const probe = 2 ** 12;
  const start = now();
  await scryptAsync('calibration', 'calibration-salt', { N: probe, r: 8, p: 1, dkLen: 32 });
  const perProbe = Math.max(1, now() - start);
  let N = 2 ** 14;
  for (const candidate of [2 ** 16, 2 ** 15]) {
    if ((perProbe * candidate) / probe <= budgetMs) {
      N = candidate;
      break;
    }
  }
  return { alg: 'scrypt', N, r: 8, p: 1 };
}

/** A new vault: a random data key, wrapped with the passphrase and with a new recovery key. */
export async function createVault(
  passphrase: string,
  kdf: KdfParams,
): Promise<{ dataKey: Uint8Array; recoveryCode: string; record: VaultRecord }> {
  const dataKey = randomBytes(32);
  const recovery = randomBytes(RECOVERY_BYTES);
  const salt = randomBytes(16);
  const byPassphrase = await passphraseKey(passphrase, salt, kdf);
  const record: VaultRecord = {
    kdf,
    salt: bytesToBase64(salt),
    wrapped_by_passphrase: bytesToBase64(seal(byPassphrase, dataKey, 'fft-vault-key:passphrase')),
    wrapped_by_recovery: bytesToBase64(
      seal(recoveryWrapKey(recovery), dataKey, 'fft-vault-key:recovery'),
    ),
    key_check: sealText(dataKey, CHECK, 'fft-vault-check'),
  };
  return { dataKey, recoveryCode: formatSecretCode(recovery), record };
}

function checked(record: VaultRecord, dataKey: Uint8Array): Uint8Array {
  try {
    if (openText(dataKey, record.key_check, 'fft-vault-check') !== CHECK) throw new Error();
  } catch {
    throw new WrongSecretError();
  }
  return dataKey;
}

/** The data key from the passphrase; WrongSecretError when it is not the right one. */
export async function unlockWithPassphrase(
  record: VaultRecord,
  passphrase: string,
): Promise<Uint8Array> {
  const key = await passphraseKey(passphrase, base64ToBytes(record.salt), record.kdf);
  let dataKey: Uint8Array;
  try {
    dataKey = open(key, base64ToBytes(record.wrapped_by_passphrase), 'fft-vault-key:passphrase');
  } catch {
    throw new WrongSecretError();
  }
  return checked(record, dataKey);
}

/** The data key from the recovery key; WrongSecretError when it is not the right one. */
export function unlockWithRecovery(record: VaultRecord, code: string): Uint8Array {
  const recovery = parseSecretCode(code);
  if (!recovery) throw new WrongSecretError();
  let dataKey: Uint8Array;
  try {
    dataKey = open(
      recoveryWrapKey(recovery),
      base64ToBytes(record.wrapped_by_recovery),
      'fft-vault-key:recovery',
    );
  } catch {
    throw new WrongSecretError();
  }
  return checked(record, dataKey);
}

/** A new passphrase: only the passphrase wrap changes (new salt); the data stays as it is. */
export async function rewrapWithPassphrase(
  record: VaultRecord,
  dataKey: Uint8Array,
  passphrase: string,
  kdf: KdfParams = record.kdf,
): Promise<VaultRecord> {
  const salt = randomBytes(16);
  const key = await passphraseKey(passphrase, salt, kdf);
  return {
    ...record,
    kdf,
    salt: bytesToBase64(salt),
    wrapped_by_passphrase: bytesToBase64(seal(key, dataKey, 'fft-vault-key:passphrase')),
  };
}

// --- rows and files -------------------------------------------------------------------------------

/** A synced row, sealed: only the table and the id name it (the server sees those anyway). */
export const sealRow = (key: Uint8Array, table: string, id: string, row: unknown) =>
  sealText(key, JSON.stringify(row), `row:${table}:${id}`);

export const openRow = <T = Record<string, unknown>>(
  key: Uint8Array,
  table: string,
  id: string,
  box: string,
): T => JSON.parse(openText(key, box, `row:${table}:${id}`)) as T;

/** A photo, sealed; `name` is where it lives on the device (bucket/path). */
export const sealFile = (key: Uint8Array, name: string, bytes: Uint8Array) =>
  seal(key, bytes, `file:${name}`);

export const openFile = (key: Uint8Array, name: string, box: Uint8Array) =>
  open(key, box, `file:${name}`);

/** A short, stable name for a file on the server that does not tell what it is. */
export const hiddenName = (key: Uint8Array, name: string) =>
  Array.from(hkdf(sha256, key, undefined, `file-name:${name}`, 16), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
