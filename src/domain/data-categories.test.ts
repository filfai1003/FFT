import fs from 'fs';
import path from 'path';
import { SYNC_ORDER } from '@/features/premium/sync';
import {
  ALWAYS_SENT,
  CATEGORY_TABLES,
  categoryOf,
  DATA_CATEGORIES,
  normalizeCategories,
  tableShared,
} from './data-categories';

jest.mock('@/lib/supabase', () => ({ getAuthClient: () => null }));

describe('data categories (DECISIONS 63)', () => {
  it('every synced table is in exactly one category, or always sent', () => {
    for (const table of SYNC_ORDER) {
      const inCategories = DATA_CATEGORIES.filter((c) => CATEGORY_TABLES[c].includes(table));
      const always = ALWAYS_SENT.includes(table);
      expect([table, inCategories.length + (always ? 1 : 0)]).toEqual([table, 1]);
    }
  });

  it('the database uses the same mapping (public.table_category)', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../supabase/migrations/20261017130000_sync_categories.sql'),
      'utf8',
    );
    const fn = sql.slice(sql.indexOf('function public.table_category'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    for (const c of DATA_CATEGORIES) {
      const branch = body
        .split('then')
        .find((part, i, all) => all[i + 1]?.trim().startsWith(`'${c}'`));
      for (const table of CATEGORY_TABLES[c])
        expect([c, branch?.includes(`'${table}'`)]).toEqual([c, true]);
    }
  });

  it('names the category of tables and views; always-sent tables have none', () => {
    expect(categoryOf('water_logs')).toBe('diet');
    expect(categoryOf('daily_nutrition_totals')).toBe('diet');
    expect(categoryOf('exercise_records')).toBe('training');
    expect(categoryOf('profiles')).toBeNull();
    expect(tableShared('profiles', [])).toBe(true);
    expect(tableShared('water_logs', ['body'])).toBe(false);
  });

  it('cleans a list: known categories once, in order; not a list = all', () => {
    expect(normalizeCategories(['photos', 'diet', 'diet', 'x'])).toEqual(['diet', 'photos']);
    expect(normalizeCategories(null)).toEqual(['body', 'diet', 'training', 'photos']);
    expect(normalizeCategories([])).toEqual([]);
  });
});
