import { Platform } from 'react-native';
import { create } from 'zustand';
import { authStorage } from '@/lib/secure-storage';
import { fromHex, toHex } from '@/lib/vault-crypto';

/**
 * The data key of an end-to-end encrypted copy (DECISIONS 64), once unlocked on this device.
 * Phones keep it in the secure storage (Keychain / Keystore, like the sign-in and the own AI key),
 * so the passphrase is asked once per phone. The web app keeps it only for the browser tab
 * (sessionStorage): closing the tab forgets it and the passphrase is asked again.
 */

const name = (userId: string) => `fft.vault-key.${userId}`;
const memory = new Map<string, Uint8Array>();

/** Which accounts have their key on this device (for the screens). */
export const useVaultKeys = create<{ unlocked: Record<string, boolean> }>(() => ({
  unlocked: {},
}));
const mark = (userId: string, on: boolean) =>
  useVaultKeys.setState((s) => ({ unlocked: { ...s.unlocked, [userId]: on } }));

type TabStorage = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};
const tab = (): TabStorage | null => {
  try {
    return (globalThis as { sessionStorage?: TabStorage }).sessionStorage ?? null;
  } catch {
    return null;
  }
};

async function readStored(userId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return tab()?.getItem(name(userId)) ?? null;
    return await authStorage.getItem(name(userId));
  } catch {
    return null;
  }
}

/** The key, or null when this device has not been unlocked. */
export async function vaultKey(userId: string): Promise<Uint8Array | null> {
  const known = memory.get(userId);
  if (known) return known;
  const hex = await readStored(userId);
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) return null;
  const key = fromHex(hex);
  memory.set(userId, key);
  mark(userId, true);
  return key;
}

export async function storeVaultKey(userId: string, key: Uint8Array): Promise<void> {
  memory.set(userId, key);
  mark(userId, true);
  try {
    if (Platform.OS === 'web') tab()?.setItem(name(userId), toHex(key));
    else await authStorage.setItem(name(userId), toHex(key));
  } catch {
    // Kept for this run; asked again next time.
  }
}

export async function forgetVaultKey(userId: string): Promise<void> {
  memory.delete(userId);
  mark(userId, false);
  try {
    if (Platform.OS === 'web') tab()?.removeItem(name(userId));
    else await authStorage.removeItem(name(userId));
  } catch {
    // Nothing stored.
  }
}
