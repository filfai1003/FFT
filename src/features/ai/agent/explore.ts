import {
  isView,
  listData as listShared,
  queryData as queryShared,
  strengthReport as strengthShared,
  type DataSource,
} from '@/domain/data-tools';
import { columns, type Row } from '@/lib/local-db';
import { getSupabase } from '@/lib/supabase';
import type { Input } from './args';

export { READABLE } from '@/domain/data-tools';

/**
 * The coach's list_data / query_data / get_strength on the device's database. The logic is in
 * domain/data-tools.ts, shared with the MCP server (which reads the online database instead).
 */
const device: DataSource = {
  columns: (table) => columns[table] ?? [],
  load: async (table) => {
    let q = getSupabase()
      .from(table as 'profiles')
      .select('*');
    if (!isView(table)) q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  },
};

export const listData = () => listShared(device);
export const queryData = (input: Input) => queryShared(device, input);
export const strengthReport = (input: Input, today: string) => strengthShared(device, input, today);
