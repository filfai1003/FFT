import {
  ABOUT,
  isView,
  listData as listShared,
  queryData as queryShared,
  READABLE,
  strengthReport as strengthShared,
  type DataSource,
} from '@/domain/data-tools';
import { ageInYears } from '@/domain/nutrition';
import { columns, type Row } from '@/lib/local-db';
import { getSupabase } from '@/lib/supabase';
import { AI_CATEGORIES, notShared, TABLE_CATEGORY, type AiAccess } from '../access';
import type { Input } from './args';

export { READABLE } from '@/domain/data-tools';

/**
 * The coach's list_data / query_data / get_strength on the device's database. The logic is in
 * domain/data-tools.ts, shared with the MCP server (which reads the online database instead).
 *
 * What the coach sends must not identify the person (DECISIONS 66): the profile row loses its id
 * (the account id), the name, the birth date (the age in years instead) and the time zone, and
 * `owner_id` (the account id on the user's own foods and exercises) becomes "user". Only the
 * tables of the categories the user shared can be read.
 */

/** Columns the coach never sees, per table (on top of data-tools' HIDDEN). */
const DROPPED: Record<string, readonly string[]> = {
  profiles: ['id', 'name', 'birth_date', 'timezone', 'onboarding_completed_at', 'created_at'],
};

/** The coach's columns of a table: identifying ones dropped, the age in place of the birth date. */
export function coachColumns(table: string, base: readonly string[]): string[] {
  const dropped = new Set(DROPPED[table] ?? []);
  const kept = base.filter((c) => !dropped.has(c));
  return table === 'profiles' ? ['age', ...kept] : kept;
}

/** A row as the coach may see it (see coachColumns). */
export function anonymiseRow(table: string, row: Row, now: Date = new Date()): Row {
  const out: Row = { ...row };
  if (table === 'profiles' && typeof row.birth_date === 'string' && row.birth_date)
    out.age = ageInYears(new Date(row.birth_date), now);
  for (const c of DROPPED[table] ?? []) delete out[c];
  if ('owner_id' in out) out.owner_id = out.owner_id == null ? null : 'user';
  return out;
}

const ABOUT_FOR_COACH: Partial<Record<string, string>> = {
  profiles: 'The user: age in years, sex, height, activity, experience, goal, diet mode.',
  foods:
    "Foods: the user's own (owner_id = user), generic foods (source ciqual) and products (off).",
};

/** The tables the coach may read with this access. */
export const coachTables = (access: AiAccess) =>
  READABLE.filter((t) => {
    const c = TABLE_CATEGORY[t];
    return c != null && access[c];
  });

function deviceSource(access: AiAccess): DataSource {
  return {
    readable: coachTables(access),
    about: { ...ABOUT_FOR_COACH },
    columns: (table) => coachColumns(table, columns[table] ?? []),
    load: async (table) => {
      let q = getSupabase()
        .from(table as 'profiles')
        .select('*');
      if (!isView(table)) q = q.is('deleted_at', null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const now = new Date();
      return ((data ?? []) as Row[]).map((r) => anonymiseRow(table, r, now));
    },
  };
}

export async function listData(access: AiAccess) {
  const map = (await listShared(deviceSource(access))) as Record<string, unknown>;
  const hidden = AI_CATEGORIES.filter((c) => !access[c]);
  return hidden.length
    ? {
        ...map,
        not_shared: hidden,
        not_shared_note:
          'The user has not shared these categories with you; their tables are not listed. If it matters, tell them they can allow it in the AI coach settings.',
      }
    : map;
}

export async function queryData(input: Input, access: AiAccess) {
  const table = typeof input.table === 'string' ? input.table.trim() : '';
  const category = TABLE_CATEGORY[table];
  if (category && !access[category] && table in ABOUT) return notShared(category);
  return queryShared(deviceSource(access), input);
}

export async function strengthReport(input: Input, today: string, access: AiAccess) {
  if (!access.training) return notShared('training');
  return strengthShared(deviceSource(access), input, today);
}
