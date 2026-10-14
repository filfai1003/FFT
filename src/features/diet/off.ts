import { useQuery } from '@tanstack/react-query';
import { getMode } from '@/lib/mode';
import { newId } from '@/lib/uuid';
import { getAuthClient, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { OFF_FIELDS, offToFoodRow, type OffProduct } from '@/domain/off-product';
import { toFood, type Food } from './foods';

type OffResponse = { foods?: Parameters<typeof toFood>[0][]; offline?: boolean };

type OffRow = Parameters<typeof toFood>[0];

/** Keeps products found online in the on-device foods, so they can be logged (and found) offline. */
async function saveLocally(rows: OffRow[]) {
  const db = getSupabase();
  for (const row of rows) {
    // One product per barcode on the device: a product found again keeps the id it already has.
    const same = row.barcode
      ? await db.from('foods').select('id').eq('barcode', row.barcode).is('owner_id', null).limit(1)
      : null;
    const knownId = (same?.data?.[0] as { id: string } | undefined)?.id;
    if (knownId) row.id = knownId;
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

const OFF = 'https://world.openfoodfacts.org';

/** Open Food Facts asked straight from the device (no account, or our server unreachable). */
async function offDirect(body: { query?: string; barcode?: string }): Promise<OffRow[]> {
  const headers = { 'User-Agent': 'FFT-app/1.0 (android)' };
  let products: OffProduct[] = [];
  if (body.barcode) {
    const res = await fetch(`${OFF}/api/v2/product/${body.barcode}.json?fields=${OFF_FIELDS}`, {
      headers,
    });
    const json = (await res.json()) as { status?: number; product?: OffProduct };
    if (json.status === 1 && json.product)
      products = [{ ...json.product, code: json.product.code ?? body.barcode }];
  } else if (body.query) {
    const q = encodeURIComponent(body.query);
    const res = await fetch(
      `${OFF}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`,
      { headers },
    );
    products = ((await res.json()) as { products?: OffProduct[] }).products ?? [];
  }
  return products
    .map(offToFoodRow)
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => ({ ...r, id: newId(), food_servings: [] }) as unknown as OffRow);
}

/**
 * Foods from Open Food Facts (a free, open database of packaged products). With an account
 * through our `off` function (it keeps what it finds for everyone); without one, or when our
 * server cannot be reached, straight from Open Food Facts. Only the barcode or the search words
 * are sent, nothing of the user. Found products are saved on the device. [] when offline.
 */
async function callOff(body: { query?: string; barcode?: string }): Promise<Food[]> {
  let rows: OffRow[] = [];
  if (getMode() === 'cloud' && isSupabaseConfigured) {
    try {
      const { data, error } = await getAuthClient().functions.invoke<OffResponse>('off', {
        body,
      });
      if (!error && data?.foods) rows = data.foods;
    } catch {
      rows = [];
    }
  }
  if (rows.length === 0) {
    try {
      rows = await offDirect(body);
    } catch {
      return []; // no network
    }
  }
  await saveLocally(rows);
  return rows.map(toFood);
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
