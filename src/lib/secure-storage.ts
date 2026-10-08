import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** AES-256-CTR with a counter starting at 1. Exported for tests. */
export function encryptWithKey(plain: string, key: Uint8Array): string {
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  return aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(plain)));
}

export function decryptWithKey(hex: string, key: Uint8Array): string {
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(hex)));
}

/**
 * Storage for the auth session. The session holds the user's tokens and the account is a health
 * account, so on devices it is encrypted: the AES key lives in the Keychain/Keystore
 * (expo-secure-store, which cannot hold values over ~2 KB), the encrypted session in AsyncStorage.
 * On the web there is no secure store, so AsyncStorage (localStorage) is used as is.
 */
class EncryptedSessionStorage {
  async getItem(key: string): Promise<string | null> {
    const cipherText = await AsyncStorage.getItem(key);
    if (!cipherText) return null;
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    return decryptWithKey(cipherText, aesjs.utils.hex.toBytes(keyHex));
  }

  async setItem(key: string, value: string): Promise<void> {
    const keyBytes = Crypto.getRandomBytes(32);
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(keyBytes));
    await AsyncStorage.setItem(key, encryptWithKey(value, keyBytes));
  }

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  }
}

export const authStorage = Platform.OS === 'web' ? AsyncStorage : new EncryptedSessionStorage();
