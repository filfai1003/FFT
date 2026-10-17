/**
 * What leaves the phone, by category (DECISIONS 63). The user chooses which categories go into the
 * copy on the server (and to paired phones, DECISIONS 65); a few rows the other devices need to
 * start (profile, settings, consents) always go when the copy is on. Shared by the app (sync), the
 * api service (server/api.js) and mirrored in SQL (`public.table_category`): keep them in sync.
 */
export type DataCategory = 'body' | 'diet' | 'training' | 'photos';

export const DATA_CATEGORIES: readonly DataCategory[] = ['body', 'diet', 'training', 'photos'];

/** Always sent when the copy (or the relay) is on: other devices cannot start without them. */
export const ALWAYS_SENT: readonly string[] = ['profiles', 'user_settings', 'consents'];

export const CATEGORY_TABLES: Record<DataCategory, readonly string[]> = {
  body: ['body_metrics', 'body_goals'],
  diet: [
    'foods',
    'food_servings',
    'food_logs',
    'nutrition_goals',
    'fixed_meal_plans',
    'fixed_meals',
    'fixed_meal_checks',
    'water_logs',
    'supplements',
    'supplement_logs',
  ],
  training: [
    'exercises',
    'workout_plans',
    'plan_days',
    'plan_exercises',
    'workout_sessions',
    'session_exercises',
    'session_sets',
  ],
  photos: ['progress_photos'],
};

/** Views read by the API / coach, and the category their rows come from. */
const VIEW_CATEGORY: Record<string, DataCategory> = {
  daily_nutrition_totals: 'diet',
  exercise_records: 'training',
  exercise_e1rm_daily: 'training',
};

/** The category of a table or view; null = always sent (or not user data). */
export function categoryOf(table: string): DataCategory | null {
  for (const c of DATA_CATEGORIES) if (CATEGORY_TABLES[c].includes(table)) return c;
  return VIEW_CATEGORY[table] ?? null;
}

export const isDataCategory = (v: unknown): v is DataCategory =>
  typeof v === 'string' && (DATA_CATEGORIES as readonly string[]).includes(v);

/** A clean list (known categories, once each, in the usual order); anything else = all. */
export function normalizeCategories(v: unknown): DataCategory[] {
  if (!Array.isArray(v)) return [...DATA_CATEGORIES];
  return DATA_CATEGORIES.filter((c) => v.includes(c));
}

/** Whether rows of a table may leave the phone with these categories on. */
export function tableShared(table: string, categories: readonly DataCategory[]): boolean {
  const c = categoryOf(table);
  return c == null || categories.includes(c);
}

/** English names, for the server's answers (the app uses i18n). */
export const CATEGORY_LABELS: Record<DataCategory, string> = {
  body: 'Body',
  diet: 'Diet',
  training: 'Training',
  photos: 'Progress photos',
};
