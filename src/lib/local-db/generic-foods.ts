import { genericFoodTable } from './generic-food-table';
import type { Row } from './schema';

/** Same ids as on the server (supabase/scripts/generate-seed.js): logs and sync point to them. */
export const genericFoodId = (code: number) =>
  `cf000000-0000-4000-8000-${String(code).padStart(12, '0')}`;

const AS_OF = '2020-07-07T00:00:00.000Z'; // the CIQUAL table version

let rows: Row[] | null = null;

/**
 * The generic foods as read-only `foods` rows. They ship with the app and are read from here, not
 * stored in each user's database (3000 rows would make every save slower).
 */
export function genericFoodRows(): Row[] {
  rows ??= genericFoodTable.map(
    ([code, name, kcal, protein, carbs, sugars, fat, sat, fiber, salt]) => ({
      id: genericFoodId(code),
      owner_id: null,
      barcode: null,
      name,
      brand: null,
      kcal_100g: kcal,
      protein_100g: protein,
      carbs_100g: carbs,
      sugars_100g: sugars,
      fat_100g: fat,
      saturates_100g: sat,
      fiber_100g: fiber,
      salt_100g: salt,
      source: 'ciqual',
      verified: true,
      created_at: AS_OF,
      updated_at: AS_OF,
      deleted_at: null,
    }),
  );
  return rows;
}
