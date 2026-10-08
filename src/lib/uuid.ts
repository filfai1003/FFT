import * as Crypto from 'expo-crypto';

/** Client-generated ids (offline-ready): every row gets its UUID before it reaches the server. */
export function newId(): string {
  return Crypto.randomUUID();
}

/**
 * A deterministic UUID for (user, purpose): retrying a step upserts the same row instead of
 * creating a duplicate. SHA-256 of "user:purpose", formatted as a v4-shaped UUID.
 */
export async function stableId(userId: string, purpose: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${userId}:${purpose}`,
  );
  const b = hex.slice(0, 32).split('');
  b[12] = '4';
  b[16] = '8';
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
