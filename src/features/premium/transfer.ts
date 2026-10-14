import type { SupabaseClient } from '@supabase/supabase-js';
import {
  columns,
  readLocalFile,
  readLocalTables,
  replaceLocalTables,
  wipeLocalData,
  writeLocalFile,
  type Row,
} from '@/lib/local-db';
import { getAuthClient } from '@/lib/supabase';

/**
 * Moves an account's data between this device and the server when its plan changes:
 * - premium starts: everything on the phone goes up, then the phone copy is erased;
 * - premium ends: everything comes back to the phone, then the server copy is erased.
 * Row ids never change, so nothing is duplicated if a move is retried after a failure.
 */

/** Parents before children (foreign keys). */
const ORDER = [
  'exercises',
  'foods',
  'food_servings',
  'workout_plans',
  'plan_days',
  'plan_exercises',
  'workout_sessions',
  'session_exercises',
  'session_sets',
  'fixed_meal_plans',
  'fixed_meals',
  'fixed_meal_checks',
  'food_logs',
  'nutrition_goals',
  'water_logs',
  'body_metrics',
  'body_goals',
  'progress_photos',
  'consents',
] as const;

const PHOTOS = 'progress-photos';
const EXERCISE_IMAGES = 'user-exercise-images';
const CHUNK = 200;

const server = () => getAuthClient() as unknown as SupabaseClient;

const pick = (table: string, row: Row): Row =>
  Object.fromEntries(columns[table].filter((c) => c in row).map((c) => [c, row[c]]));

const chunks = <T>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

function check<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res;
}

/** Rows of one table that belong to the user (catalogue and Open Food Facts rows excluded). */
function ownRows(tables: Record<string, Row[]>, table: string, userId: string): Row[] {
  const rows = tables[table] ?? [];
  if (table === 'exercises' || table === 'foods') return rows.filter((r) => r.owner_id === userId);
  if (table === 'food_servings') {
    const mine = new Set(ownRows(tables, 'foods', userId).map((f) => f.id));
    return rows.filter((r) => mine.has(r.food_id));
  }
  return rows.filter((r) => r.user_id === userId);
}

/** Ids (of `ids`) that the server does not have in `table`. */
async function missingOnServer(table: string, ids: string[]): Promise<Set<string>> {
  const missing = new Set(ids);
  for (const part of chunks([...missing], 100)) {
    const res = check(await server().from(table).select('id').in('id', part), table);
    for (const r of (res.data ?? []) as { id: string }[]) missing.delete(r.id);
  }
  return missing;
}

const fileName = (path: string) => path.split('/').pop() ?? path;

/** Premium started: the phone's data goes to the server, then the phone copy is erased. */
export async function uploadToServer(userId: string): Promise<void> {
  const local = await readLocalTables(userId);
  const out: Record<string, Row[]> = {};
  for (const t of ORDER) out[t] = ownRows(local, t, userId).map((r) => pick(t, r));

  // Another phone may have put data online already: keep its active plan / meal plan / workout.
  // (Rows of this phone already sent by an earlier, interrupted attempt do not count.)
  const has = async (table: string, column: string, value: string | boolean) => {
    const res = check(
      await server().from(table).select('id').is('deleted_at', null).eq(column, value),
      table,
    );
    const mine = new Set(out[table].map((r) => r.id));
    return ((res.data ?? []) as { id: string }[]).some((r) => !mine.has(r.id));
  };
  if (await has('workout_plans', 'status', 'active'))
    out.workout_plans = out.workout_plans.map((p) =>
      p.status === 'active' ? { ...p, status: 'archived' } : p,
    );
  if (await has('fixed_meal_plans', 'active', true))
    out.fixed_meal_plans = out.fixed_meal_plans.map((p) => ({ ...p, active: false }));
  if (await has('workout_sessions', 'status', 'active'))
    out.workout_sessions = out.workout_sessions.map((s) =>
      s.status === 'active' ? { ...s, status: 'discarded' } : s,
    );

  // Logged foods from Open Food Facts are shared rows the server already has; if one is missing
  // the log keeps its copied values and simply loses the link.
  const own = new Set(out.foods.map((f) => f.id as string));
  const linked = [
    ...new Set(
      out.food_logs
        .map((l) => l.food_id as string | null)
        .filter((id): id is string => !!id && !own.has(id)),
    ),
  ];
  const gone = await missingOnServer('foods', linked);
  out.food_logs = out.food_logs.map((l) =>
    gone.has(l.food_id as string) ? { ...l, food_id: null } : l,
  );

  // Files: on the server they must sit in the account's folder ("<userId>/<file>").
  const moveFile = async (bucket: string, path: string): Promise<string | null> => {
    const bytes = await readLocalFile(`${bucket}/${path}`);
    if (!bytes) return null;
    const target = `${userId}/${fileName(path)}`;
    check(
      await server()
        .storage.from(bucket)
        .upload(target, bytes, { contentType: 'image/jpeg', upsert: true }),
      bucket,
    );
    return target;
  };
  const photos: Row[] = [];
  for (const p of out.progress_photos) {
    const path = await moveFile(PHOTOS, p.storage_path as string);
    if (path) photos.push({ ...p, storage_path: path });
  }
  out.progress_photos = photos;
  for (const e of out.exercises) {
    if (e.image_path) e.image_path = await moveFile(EXERCISE_IMAGES, e.image_path as string);
  }

  for (const t of ORDER) {
    for (const part of chunks(out[t])) check(await server().from(t).upsert(part), t);
  }

  // Profile and settings: the phone's, unless the account was already set up online.
  const profile = check(
    await server()
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle(),
    'profiles',
  );
  const onlineReady = (profile.data as Row | null)?.onboarding_completed_at != null;
  const localProfile = (local.profiles ?? []).find((p) => p.id === userId);
  const localSettings = (local.user_settings ?? []).find((s) => s.user_id === userId);
  if (!onlineReady && localProfile)
    check(await server().from('profiles').upsert(pick('profiles', localProfile)), 'profiles');
  if (!onlineReady && localSettings)
    check(
      await server().from('user_settings').upsert(pick('user_settings', localSettings)),
      'user_settings',
    );

  await wipeLocalData(userId);
}

/** Every row of `table` whose `column` is `value` (or one of the values), page by page. */
async function fetchAll(table: string, column: string, value: string | string[]) {
  const rows: Row[] = [];
  const order = table === 'user_settings' ? 'user_id' : 'id';
  for (let from = 0; ; from += 1000) {
    const base = server().from(table).select('*');
    const filtered = Array.isArray(value) ? base.in(column, value) : base.eq(column, value);
    const res = check(await filtered.order(order).range(from, from + 999), table);
    const page = (res.data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function fetchByIds(table: string, column: string, ids: string[]) {
  const rows: Row[] = [];
  for (const part of chunks(ids, 100)) rows.push(...(await fetchAll(table, column, part)));
  return rows;
}

/** Premium ended: the server's data comes back to the phone, then the server copy is erased. */
export async function downloadToDevice(userId: string): Promise<void> {
  const tables: Record<string, Row[]> = {};
  for (const t of ORDER) {
    if (t === 'food_servings') continue;
    tables[t] = await fetchAll(
      t,
      t === 'exercises' || t === 'foods' ? 'owner_id' : 'user_id',
      userId,
    );
  }
  // Open Food Facts foods the logs point to come along, so "log again" keeps working offline.
  const own = new Set(tables.foods.map((f) => f.id as string));
  const linked = [
    ...new Set(
      tables.food_logs
        .map((l) => l.food_id as string | null)
        .filter((id): id is string => !!id && !own.has(id)),
    ),
  ];
  tables.foods.push(...(await fetchByIds('foods', 'id', linked)));
  tables.food_servings = await fetchByIds(
    'food_servings',
    'food_id',
    tables.foods.map((f) => f.id as string),
  );
  tables.profiles = await fetchAll('profiles', 'id', userId);
  tables.user_settings = await fetchAll('user_settings', 'user_id', userId);

  // Files first: if one fails nothing has changed yet.
  const files: { bucket: string; path: string }[] = [
    ...tables.progress_photos.map((p) => ({ bucket: PHOTOS, path: p.storage_path as string })),
    ...tables.exercises
      .filter((e) => e.image_path)
      .map((e) => ({ bucket: EXERCISE_IMAGES, path: e.image_path as string })),
  ];
  for (const f of files) {
    const res = await server().storage.from(f.bucket).download(f.path);
    if (res.error || !res.data) continue; // a missing file: the row stays, without its picture
    await writeLocalFile(
      `${f.bucket}/${f.path}`,
      new Uint8Array(await res.data.arrayBuffer()),
      res.data.type || 'image/jpeg',
    );
  }

  await replaceLocalTables(userId, tables);

  for (const bucket of [PHOTOS, EXERCISE_IMAGES]) {
    const paths = files.filter((f) => f.bucket === bucket).map((f) => f.path);
    for (const part of chunks(paths, 100)) await server().storage.from(bucket).remove(part);
  }
  check(await server().rpc('clear_my_online_data'), 'clear_my_online_data');
}

/** What the server says about the account; null when it cannot be reached. */
export async function fetchPremium(): Promise<boolean | null> {
  try {
    const res = await server().rpc('is_premium');
    if (res.error) return null;
    return res.data === true;
  } catch {
    return null;
  }
}
