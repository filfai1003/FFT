/**
 * Web version of the over-the-air updates: there is nothing to update there (the page is always the
 * newest). The real implementation is app-update.native.ts.
 */
export type AppUpdateInfo = {
  enabled: boolean;
  runtime: string | null;
  channel: string | null;
  updateId: string | null;
  createdAt: Date | null;
  /** True when the app still runs the code it was built with, not a downloaded update. */
  embedded: boolean;
};

export const appUpdateInfo = (): AppUpdateInfo => ({
  enabled: false,
  runtime: null,
  channel: null,
  updateId: null,
  createdAt: null,
  embedded: true,
});

/** 'ready' = a newer version is downloaded and the next start (or restartApp) uses it. */
export async function checkForAppUpdate(): Promise<'none' | 'ready' | 'error'> {
  return 'none';
}

export async function restartApp() {}

/** At a cold start: look for a newer version and, if there is one, switch to it right away. */
export async function updateOnLaunch() {}
