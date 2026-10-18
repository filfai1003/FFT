import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appUpdateInfo } from './app-update';
import { getAuthClient, isSupabaseConfigured } from './supabase';

/**
 * Automatic error reporting (DECISIONS 46): crashes and failures go to our own server
 * (`report_error`) and show up grouped in the admin panel, Errors tab. Best effort: a report that
 * cannot be sent is dropped, and nothing here may throw.
 *
 * Only what tells a bug apart is sent, never what the user typed (DECISIONS 96): the error's kind
 * and code (`TypeError`, `PostgrestError`), its SQLSTATE or error code, the table or function name
 * and other fixed labels from the code (context), the screen (ids removed), platform and app
 * version, and the stack frames (function names and positions in the bundle). Error messages are
 * left out: a database error or a thrown Error can repeat a food name, a note or an email. Kept:
 * the messages of `ReportCode` (fixed texts written in the code) and the engine's own TypeError /
 * ReferenceError / RangeError messages ("undefined is not a function"), with quoted text, emails
 * and numbers removed. The server strips again (20261018213000_report_error_strip.sql).
 */

export type ErrorKind =
  'crash' | 'unhandled' | 'render' | 'query' | 'mutation' | 'sync' | 'widget' | 'handled';

/** A fixed text written in the code (never user data): kept as the report's message. */
export class ReportCode extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'ReportCode';
  }
}

type Context = Record<string, string | number>;
type Report = { kind: ErrorKind; message: string; stack: string | null; context: Context | null };

const queue: Report[] = [];
const seen = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let screen: string | null = null;

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,40}$/;
const SAFE_VALUE = /^[A-Za-z0-9_.:/ -]{0,60}$/;
const CONTEXT_KEYS = new Set([
  'table',
  'fn',
  'key',
  'screen',
  'step',
  'widget',
  'via',
  'what',
  'action',
  'code',
  'sqlstate',
  'count',
  'bytes',
]);
const ENGINE_ERRORS = new Set(['TypeError', 'ReferenceError', 'RangeError']);

/** Quoted text, emails and numbers out of an engine message. */
function scrub(text: string): string {
  return text
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, (q) =>
      /^.[A-Za-z_$][\w$.]{0,39}.$/.test(q) ? q : `${q[0]}?${q[0]}`,
    )
    .replace(/[^\s@'"]+@[^\s@'"]+/g, '?@?')
    .replace(/\d+/g, '#')
    .slice(0, 200);
}

/** Only the stack frames: the first line of a JavaScript stack repeats the message. */
function framesOf(stack: unknown): string | null {
  if (typeof stack !== 'string') return null;
  const frames = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^at\s/.test(l) || /^[^\s@]*@\S*:\d+(:\d+)?$/.test(l))
    .slice(0, 40);
  return frames.length ? frames.join('\n').slice(0, 4000) : null;
}

/** What may leave the phone about an error (exported for tests). */
export function describeError(error: unknown): {
  message: string;
  stack: string | null;
  code: string | null;
} {
  const e = (typeof error === 'object' && error ? error : {}) as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    stack?: unknown;
  };
  const rawName = error instanceof Error ? error.name : typeof e.code === 'string' ? 'Error' : '';
  const name = SAFE_CODE.test(rawName) ? rawName : error instanceof Error ? 'Error' : typeof error;
  const code =
    typeof e.code === 'string' && SAFE_CODE.test(e.code)
      ? e.code
      : typeof e.status === 'number'
        ? String(e.status)
        : null;
  const raw = typeof e.message === 'string' ? e.message : '';
  let message = name;
  if (error instanceof ReportCode) message = raw.slice(0, 120);
  else if (ENGINE_ERRORS.has(name) && raw) message = `${name}: ${scrub(raw)}`;
  return { message, stack: framesOf(e.stack), code };
}

/** Only known keys with plain short values (exported for tests). */
export function cleanContext(context: object | undefined): Context | null {
  const out: Context = {};
  for (const [k, v] of Object.entries(context ?? {})) {
    if (!CONTEXT_KEYS.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && SAFE_VALUE.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** The screen the user is on (route, ids removed), added to every report. */
export function setErrorScreen(path: string | null) {
  screen = path
    ? path
        .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
        .replace(/\d+/g, '#')
        .replace(/[^A-Za-z0-9_.:/ #()[\]-]/g, '')
        .slice(0, 60)
    : null;
}

/** Reports an error. The same one at most once a minute; sent in small batches. */
export function reportError(error: unknown, kind: ErrorKind = 'handled', context?: object) {
  try {
    if (__DEV__ || !isSupabaseConfigured) return;
    // Network trouble is not a bug: the app works offline by design (checked on the raw message,
    // which never leaves the phone).
    const raw =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    if (/network request failed|failed to fetch|load failed|aborted|timeout/i.test(raw)) return;
    const { message, stack, code } = describeError(error);
    const ctx = cleanContext({
      ...(code ? { code } : {}),
      ...(screen ? { screen } : {}),
      ...(context ?? {}),
    });
    const key = `${kind}|${message}|${JSON.stringify(ctx)}`;
    const now = Date.now();
    if ((seen.get(key) ?? 0) > now - 60_000) return;
    seen.set(key, now);
    if (queue.length >= 20) return;
    queue.push({ kind, message, stack, context: ctx });
    timer ??= setTimeout(() => void flush(), 2000);
  } catch {
    // Reporting must never be the cause of another error.
  }
}

/** Sends the waiting reports now (a background task that is about to end). */
export async function flushErrors() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  try {
    await flush();
  } catch {
    // Best effort, like every report.
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
        p_context: r.context,
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
