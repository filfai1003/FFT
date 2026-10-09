import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * `cloud`: a Supabase account (sign in, data on the server).
 * `offline`: no account, everything is saved on this device only, no sync.
 */
export type AppMode = 'cloud' | 'offline';

const KEY = 'fft.mode';
let current: AppMode = 'cloud';

/** The mode in use (read from storage once at start-up by `loadMode`). */
export const getMode = (): AppMode => current;

export async function loadMode(): Promise<AppMode> {
  try {
    current = (await AsyncStorage.getItem(KEY)) === 'offline' ? 'offline' : 'cloud';
  } catch {
    current = 'cloud';
  }
  return current;
}

export async function setMode(mode: AppMode): Promise<void> {
  current = mode;
  try {
    await AsyncStorage.setItem(KEY, mode);
  } catch {
    // The mode still applies for this run.
  }
}
