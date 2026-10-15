import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appUpdateInfo } from './app-update';
import { getAuthClient, isSupabaseConfigured } from './supabase';

/**
 * Automatic error reporting (DECISIONS 46): crashes and failures go to our own server
 * (`report_error`) and show up grouped in the admin panel, Errors tab. Only the error is sent
 * (message, stack, where, platform, version), never user data. Best effort: a report that cannot
 * be sent is dropped, and nothing here may throw.
 */

export type ErrorKind =
  'crash' | 'unhandled' | 'render' | 'query' | 'mutation' | 'sync' | 'handled';

type Report = { kind: ErrorKind; message: string; stack: string | null; context?: object };

const queue: Report[] = [];
const seen = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  }
  if (typeof error === 'object' && error && 'message' in error) {
    return { message: String((error as { message: unknown }).message), stack: null };
  }
  return { message: String(error), stack: null };
}

/** Reports an error. The same one at most once a minute; sent in small batches. */
export function reportError(error: unknown, kind: ErrorKind = 'handled', context?: object) {
  try {
    if (__DEV__ || !isSupabaseConfigured) return;
    const { message, stack } = describe(error);
    // Network trouble is not a bug: the app works offline by design.
    if (/network request failed|failed to fetch|load failed|aborted|timeout/i.test(message)) return;
    const key = `${kind}|${message}`;
    const now = Date.now();
    if ((seen.get(key) ?? 0) > now - 60_000) return;
    seen.set(key, now);
    if (queue.length >= 20) return;
    queue.push({ kind, message, stack, context });
    timer ??= setTimeout(() => void flush(), 2000);
  } catch {
    // Reporting must never be the cause of another error.
  }
}

async function flush() {
  timer = null;
  const server = getAuthClient() as unknown as SupabaseClient;
  const update = appUpdateInfo();
  while (queue.length > 0) {
    const r = queue.shift()!;
    try {
      await server.rpc('report_error', {
        p_kind: r.kind,
        p_message: r.message,
        p_stack: r.stack,
        p_context: r.context ?? null,
        p_platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim(),
        p_app_version: Constants.expoConfig?.version ?? null,
        p_update_id: update.updateId,
      });
    } catch {
      return;
    }
  }
}

let installed = false;

/** Catches what nothing else catches: crashes and promise rejections nobody handled. */
export function installErrorReporting() {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
    addEventListener?: (
      type: string,
      fn: (e: { reason?: unknown; error?: unknown }) => void,
    ) => void;
  };
  if (g.ErrorUtils) {
    const previous = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((e, fatal) => {
      reportError(e, fatal ? 'crash' : 'unhandled');
      // A fatal crash closes the app: give the report a moment to leave first.
      if (fatal) void flush();
      previous(e, fatal);
    });
  }
  if (Platform.OS === 'web' && g.addEventListener) {
    g.addEventListener('error', (e) => reportError(e.error ?? e, 'crash'));
    g.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandled'));
  }
}
