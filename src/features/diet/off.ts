import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { toFood, type Food } from './foods';

type OffResponse = { foods?: Parameters<typeof toFood>[0][]; offline?: boolean };

/**
 * Foods from Open Food Facts, through the `off` Edge Function: it saves new products as global
 * rows in our database, so the next search finds them locally. Returns [] when offline.
 */
async function callOff(body: { query?: string; barcode?: string }): Promise<Food[]> {
  try {
    const { data, error } = await getSupabase().functions.invoke<OffResponse>('off', { body });
    if (error || !data?.foods) return [];
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
