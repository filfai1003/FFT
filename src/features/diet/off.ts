import { useQuery } from '@tanstack/react-query';
import { getMode } from '@/lib/mode';
import { newId } from '@/lib/uuid';
import { getAuthClient, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { toFood, type Food } from './foods';

type OffResponse = { foods?: Parameters<typeof toFood>[0][]; offline?: boolean };

type OffRow = Parameters<typeof toFood>[0];

/** Keeps products found online in the on-device foods, so they can be logged (and found) offline. */
async function saveLocally(rows: OffRow[]) {
  const db = getSupabase();
  for (const row of rows) {
    const { food_servings: servings, ...food } = row;
    await db.from('foods').upsert(food as never);
    const known = await db.from('food_servings').select('id').eq('food_id', row.id).limit(1);
    if (!known.data?.length && servings?.length)
      await db.from('food_servings').insert(
        servings.map((s) => ({
          id: newId(),
          food_id: row.id,
          label: s.label,
          grams: s.grams,
        })) as never,
      );
  }
}

/**
 * Foods from Open Food Facts, through the `off` Edge Function (it needs the account and
 * internet; it only looks products up, nothing of the user is sent). Found products are saved on
 * the device. Returns [] without an account, offline or on any error.
 */
async function callOff(body: { query?: string; barcode?: string }): Promise<Food[]> {
  if (getMode() !== 'cloud' || !isSupabaseConfigured) return [];
  try {
    const { data, error } = await getAuthClient().functions.invoke<OffResponse>('off', { body });
    if (error || !data?.foods) return [];
    await saveLocally(data.foods);
    return data.foods.map(toFood);
  } catch {
    return [];
  }
}

export function useOffSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: ['foods', 'off', q],
    enabled: enabled && q.length >= 3,
    staleTime: 10 * 60 * 1000,
    queryFn: () => callOff({ query: q }),
  });
}

/** One product by barcode: our database first, then Open Food Facts. */
export async function lookupBarcode(code: string): Promise<Food | null> {
  const supabase = getSupabase();
  const local = await supabase
    .from('foods')
    .select('*, food_servings(label, grams, deleted_at)')
    .eq('barcode', code)
    .is('deleted_at', null)
    .limit(1);
  if (!local.error && local.data && local.data.length > 0) {
    return toFood(local.data[0] as unknown as Parameters<typeof toFood>[0]);
  }
  const remote = await callOff({ barcode: code });
  return remote[0] ?? null;
}

/** Merge lists without repeating a food (by id, then by barcode). */
export function mergeFoods(...lists: (Food[] | undefined)[]): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const f of lists.flatMap((l) => l ?? [])) {
    const key = f.barcode ?? f.id;
    if (seen.has(f.id) || seen.has(key)) continue;
    seen.add(f.id);
    seen.add(key);
    out.push(f);
  }
  return out;
}
