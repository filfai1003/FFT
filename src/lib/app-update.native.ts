import type { AppUpdateInfo } from './app-update';

export type { AppUpdateInfo } from './app-update';

// Loaded when first needed: the module does not exist in a development client or in tests.
function updates(): typeof import('expo-updates') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const u = require('expo-updates') as typeof import('expo-updates');
    return u.isEnabled ? u : null;
  } catch {
    return null;
  }
}

export function appUpdateInfo(): AppUpdateInfo {
  const u = updates();
  if (!u) {
    return {
      enabled: false,
      runtime: null,
      channel: null,
      updateId: null,
      createdAt: null,
      embedded: true,
    };
  }
  return {
    enabled: true,
    runtime: u.runtimeVersion,
    channel: u.channel,
    updateId: u.updateId,
    createdAt: u.createdAt,
    embedded: u.isEmbeddedLaunch,
  };
}

/** Downloads a newer version if there is one. 'ready' = the next start (or restartApp) uses it. */
export async function checkForAppUpdate(): Promise<'none' | 'ready' | 'error'> {
  const u = updates();
  if (!u) return 'none';
  try {
    const check = await u.checkForUpdateAsync();
    if (!check.isAvailable) return 'none';
    const fetched = await u.fetchUpdateAsync();
    return fetched.isNew ? 'ready' : 'none';
  } catch {
    return 'error';
  }
}

export async function restartApp() {
  const u = updates();
  if (u) await u.reloadAsync();
}

/** At a cold start: look for a newer version and, if there is one, switch to it right away. */
export async function updateOnLaunch() {
  if (__DEV__) return;
  if ((await checkForAppUpdate()) === 'ready') await restartApp();
}
