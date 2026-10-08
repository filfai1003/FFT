import type { Database } from './database';

/** Row / insert / update types of a public table: `Row<'profiles'>`. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
