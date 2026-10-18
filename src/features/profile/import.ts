import * as DocumentPicker from 'expo-document-picker';
import { strFromU8, unzipSync } from 'fflate';
import { SYNC_ORDER } from '@/features/premium/sync';
import { columns, pkOf, writeLocalFile, type Row } from '@/lib/local-db';
import { readUri } from '@/lib/read-uri';
import { getSupabase } from '@/lib/supabase';

/**
 * Brings back an FFT export (the ZIP from Data & sync → Export): data.json and the photos.
 * Nothing on the device is deleted. A row of the file is added when it is not here, and replaces
 * the one here only when it was changed later (the most recent change wins, like the sync). The
 * rows become this account's, so an export of another account or device can be imported too.
 */

export type ImportResult = { rows: number; skipped: number; photos: number };

/** Lets the user pick the ZIP; null when cancelled. */
export async function pickExportFile(): Promise<Uint8Array | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return readUri(res.assets[0].uri);
}

/** The rows of an export, by table (throws when the file is not an FFT export). */
export function readExport(zip: Uint8Array): {
  tables: Record<string, Row[]>;
  photos: Record<string, Uint8Array>;
} {
  const files = unzipSync(zip);
  const json = files['data.json'];
  if (!json) throw new Error('not an FFT export');
  const parsed = JSON.parse(strFromU8(json)) as Record<string, unknown>;
  const tables: Record<string, Row[]> = {};
  for (const table of SYNC_ORDER) {
    const rows = parsed[table];
    if (Array.isArray(rows)) tables[table] = rows as Row[];
  }
  if (Object.keys(tables).length === 0) throw new Error('not an FFT export');
  const photos: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files))
    if (name.startsWith('photos/') && bytes.length > 0) photos[name.slice(7)] = bytes;
  return { tables, photos };
}

/** The row as this account's: owner columns point to the user, unknown columns are dropped. */
function asMine(table: string, row: Row, userId: string): Row {
  const out: Row = Object.fromEntries(
    (columns[table] ?? []).filter((c) => c in row).map((c) => [c, row[c]]),
  );
  if (table === 'profiles') out.id = userId;
  if ('user_id' in out || table === 'user_settings') out.user_id = userId;
  if ((table === 'exercises' || table === 'foods') && out.owner_id != null) out.owner_id = userId;
  return out;
}

/** Tables with "only one active" rules: an imported active row yields to the one already here. */
function demote(table: string, row: Row): Row | null {
  if (table === 'workout_plans' && row.status === 'active') return { ...row, status: 'archived' };
  if (table === 'fixed_meal_plans' && row.active === true) return { ...row, active: false };
  if (table === 'workout_sessions' && row.status === 'active')
    return { ...row, status: 'discarded' };
  return null;
}

export async function importExport(zip: Uint8Array, userId: string): Promise<ImportResult> {
  const { tables, photos } = readExport(zip);
  const db = getSupabase();
  const result: ImportResult = { rows: 0, skipped: 0, photos: 0 };

  for (const table of SYNC_ORDER) {
    const pk = pkOf(table);
    for (const raw of tables[table] ?? []) {
      let row = asMine(table, raw, userId);
      if (table === 'progress_photos') {
        // The ZIP names photos by day and pose; on the device they live in the user's folder.
        const bytes = photos[`${String(row.day)}-${String(row.pose)}.jpg`];
        const file =
          String(row.storage_path ?? '')
            .split('/')
            .pop() || `${String(row.id)}.jpg`;
        row = { ...row, storage_path: `${userId}/${file}` };
        if (bytes) {
          await writeLocalFile(`progress-photos/${userId}/${file}`, bytes, 'image/jpeg');
          result.photos += 1;
        }
      }
      const key = row[pk];
      if (key == null) {
        result.skipped += 1;
        continue;
      }
      const here = await db
        .from(table as 'profiles')
        .select('updated_at')
        .eq(pk as 'id', key as string)
        .maybeSingle();
      const hereAt = (here.data as { updated_at?: string } | null)?.updated_at;
      if (hereAt && String(row.updated_at ?? '') <= hereAt) {
        result.skipped += 1; // the device has this row in the same or a newer version
        continue;
      }
      let res = await db.from(table as 'profiles').upsert(row as never);
      const fallback = res.error?.code === '23505' ? demote(table, row) : null;
      if (fallback) res = await db.from(table as 'profiles').upsert(fallback as never);
      if (res.error) result.skipped += 1;
      else result.rows += 1;
    }
  }
  return result;
}
