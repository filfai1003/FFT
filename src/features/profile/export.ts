import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { zipSync, strToU8 } from 'fflate';
import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toCsv } from '@/domain/csv';
import { useAiAccessStore } from '@/features/ai/access';
import { useConversations } from '@/features/ai/agent/conversations';
import { useAiSettings } from '@/features/ai/settings-store';
import { useSessionStore } from '@/features/auth/session-store';
import { useSyncStatus } from '@/features/premium/sync';
import { getMode } from '@/lib/mode';
import { usePlanStore } from '@/lib/plan';
import { getAuthClient, getSupabase } from '@/lib/supabase';

type Row = Record<string, unknown>;

/** All rows of a table the user can see (RLS), paged because the API returns 1000 at a time. */
async function fetchAll(table: string): Promise<Row[]> {
  const supabase = getSupabase();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table as 'profiles')
      .select('*')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return rows;
}

const TABLES = [
  'profiles',
  'user_settings',
  'consents',
  'exercises',
  'workout_plans',
  'plan_days',
  'plan_exercises',
  'workout_sessions',
  'session_exercises',
  'session_sets',
  'foods',
  'food_servings',
  'food_logs',
  'nutrition_goals',
  'fixed_meal_plans',
  'fixed_meals',
  'fixed_meal_checks',
  'water_logs',
  'body_metrics',
  'body_goals',
  'progress_photos',
  'supplements',
  'supplement_logs',
] as const;

export type ExportData = Record<(typeof TABLES)[number], Row[]>;

export async function collectData(): Promise<ExportData> {
  const entries = await Promise.all(TABLES.map(async (t) => [t, await fetchAll(t)] as const));
  const data = Object.fromEntries(entries) as ExportData;
  // Only the user's own exercises and foods: the shared catalogue is not their data.
  data.exercises = data.exercises.filter((e) => e.owner_id != null);
  data.foods = data.foods.filter((f) => f.owner_id != null);
  return data;
}

/** One line per completed set: the workouts CSV. */
export function workoutRows(
  data: Pick<ExportData, 'workout_sessions' | 'session_sets' | 'exercises'>,
  exerciseNames: Map<string, string>,
) {
  const sessions = new Map(
    data.workout_sessions.filter((s) => s.deleted_at == null).map((s) => [s.id as string, s]),
  );
  return data.session_sets
    .filter(
      (s) => s.deleted_at == null && s.completed_at != null && sessions.has(s.session_id as string),
    )
    .map((s) => {
      const session = sessions.get(s.session_id as string)!;
      return {
        date: session.started_at,
        workout: session.day_name,
        exercise: exerciseNames.get(s.exercise_id as string) ?? s.exercise_id,
        set: (s.set_index as number) + 1,
        weight_kg: s.weight_kg,
        reps: s.reps,
        duration_s: s.duration_s,
        distance_m: s.distance_m,
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.set - b.set);
}

export const workoutColumns = [
  'date',
  'workout',
  'exercise',
  'set',
  'weight_kg',
  'reps',
  'duration_s',
  'distance_m',
] as const;

async function exerciseNames(): Promise<Map<string, string>> {
  const { data, error } = await getSupabase().from('exercises').select('id, name');
  if (error) throw error;
  return new Map(data.map((e) => [e.id, e.name]));
}

export async function workoutsCsv(): Promise<string> {
  const data = await collectData();
  const names = await exerciseNames();
  return toCsv(workoutRows(data, names), workoutColumns);
}

const ymd = () => new Date().toISOString().slice(0, 10);

/**
 * What the server keeps about the account itself (DECISIONS 83): email, plan, AI credit and usage,
 * tokens and connected apps, consent and copy settings, error reports, password requests, admin
 * log entries. Account state, so through the auth client. Null without an account; an error
 * message when the server cannot be reached (the rest of the export still works).
 */
async function accountPart(): Promise<unknown> {
  if (getMode() !== 'cloud') return null;
  try {
    const { data, error } = await (getAuthClient() as unknown as SupabaseClient).rpc(
      'export_my_account',
    );
    if (error) return { unavailable: error.message };
    return data;
  } catch (e) {
    return { unavailable: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * What the community holds about the account (DECISIONS 90): membership, scores, friends. Null
 * without an account or when not a member.
 */
async function communityPart(): Promise<unknown> {
  if (getMode() !== 'cloud') return null;
  try {
    const { data, error } = await (getAuthClient() as unknown as SupabaseClient).rpc(
      'community_export',
    );
    if (error) return { unavailable: error.message };
    return data;
  } catch (e) {
    return { unavailable: e instanceof Error ? e.message : String(e) };
  }
}

/** What only this device has: AI conversations, AI and copy settings (never the AI key itself). */
function devicePart(userId: string | null) {
  const conversations = Object.values(useConversations.getState().conversations).filter(
    (c) => c.userId === userId,
  );
  const ai = useAiSettings.getState();
  const plan = usePlanStore.getState();
  return {
    ai_conversations: conversations,
    ai_settings: {
      provider: ai.provider,
      model: ai.model,
      baseUrl: ai.baseUrl,
      ownKeySet: ai.apiKey.trim().length > 0,
    },
    ai_access: userId ? (useAiAccessStore.getState().byUser[userId] ?? null) : null,
    server_copy: {
      sync: plan.sync,
      categories: plan.categories,
      encrypted: plan.encrypted,
      lastSync: useSyncStatus.getState().lastAt,
    },
  };
}

/** Everything as a ZIP: data.json, account.json, community.json, device.json, a few CSVs and the photos. */
export async function fullExportZip(): Promise<Uint8Array> {
  const data = await collectData();
  const names = await exerciseNames();
  const userId = useSessionStore.getState().userId;
  const files: Record<string, Uint8Array> = {
    'data.json': strToU8(
      JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2),
    ),
    'account.json': strToU8(JSON.stringify(await accountPart(), null, 2)),
    'community.json': strToU8(JSON.stringify(await communityPart(), null, 2)),
    'device.json': strToU8(JSON.stringify(devicePart(userId), null, 2)),
    'workouts.csv': strToU8(toCsv(workoutRows(data, names), workoutColumns)),
    'food_log.csv': strToU8(
      toCsv(
        data.food_logs.filter((r) => r.deleted_at == null),
        ['day', 'meal', 'name', 'quantity_label', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
      ),
    ),
    'body_metrics.csv': strToU8(
      toCsv(
        data.body_metrics.filter((r) => r.deleted_at == null),
        [
          'day',
          'weight_kg',
          'body_fat_pct',
          'bf_method',
          'waist_cm',
          'hips_cm',
          'chest_cm',
          'arm_cm',
          'thigh_cm',
          'notes',
        ],
      ),
    ),
    'water.csv': strToU8(
      toCsv(
        data.water_logs.filter((r) => r.deleted_at == null),
        ['day', 'ml'],
      ),
    ),
  };

  const supabase = getSupabase();
  for (const photo of data.progress_photos.filter((p) => p.deleted_at == null)) {
    try {
      const signed = await supabase.storage
        .from('progress-photos')
        .createSignedUrl(photo.storage_path as string, 600);
      if (!signed.data) continue;
      const bytes = new Uint8Array(await (await fetch(signed.data.signedUrl)).arrayBuffer());
      files[`photos/${photo.day}-${photo.pose}.jpg`] = bytes;
    } catch {
      // A photo that cannot be fetched is skipped; the rest of the export still works.
    }
  }
  return zipSync(files, { level: 6 });
}

/** Hands the file to the user: a download on the web, the share sheet on a device. */
export async function deliverFile(name: string, bytes: Uint8Array, mime: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  // Earlier exports still in the cache go first (DECISIONS 83).
  removeExportFiles({ olderThanMs: 0 });
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}

const EXPORT_FILE = /^fft-(export|workouts)-.*\.(zip|csv)$/;

/**
 * Deletes the export files left in the app's cache (they hold health data). Not right after the
 * share sheet closes: the app the file went to (an email being written) may still be reading it.
 * So: before each new export, at start for files older than an hour, and all of them when the
 * account is deleted.
 */
export function removeExportFiles({ olderThanMs }: { olderThanMs: number }): number {
  if (Platform.OS === 'web') return 0;
  let removed = 0;
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (!(item instanceof File) || !EXPORT_FILE.test(item.name)) continue;
      const modified = item.modificationTime ?? 0;
      if (olderThanMs > 0 && Date.now() - modified < olderThanMs) continue;
      item.delete();
      removed += 1;
    }
  } catch {
    // Nothing to clean, or the cache cannot be read: nothing else depends on it.
  }
  return removed;
}

export const exportFileNames = {
  full: () => `fft-export-${ymd()}.zip`,
  workouts: () => `fft-workouts-${ymd()}.csv`,
};
