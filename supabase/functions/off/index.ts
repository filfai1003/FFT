// Open Food Facts bridge. The client sends { query } or { barcode }; this function fetches the
// products from OFF, saves the new ones in `foods` as GLOBAL rows (owner_id null, source 'off',
// written with the service role: users cannot write global rows) and returns the stored rows.
// Later searches then stay inside our own database.
import { createClient } from 'npm:@supabase/supabase-js@2';

const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_en,brands,nutriments,states_tags';
const TIMEOUT_MS = 8000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  states_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
};

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? Number(v) : (v as number);
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
};

/**
 * Same rule as cleanOffText in src/domain/off-product.ts (DECISIONS 84): OFF text is written by
 * anyone, stored as a global food and read by AI apps, so no control, zero-width or direction
 * characters, no markup characters, one line, short.
 */
function cleanOffText(s: unknown, max: number): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ')
    .replace(/[<>{}`[\]\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function toRow(p: OffProduct) {
  const name = cleanOffText(p.product_name || p.product_name_en, 100);
  const nu = p.nutriments ?? {};
  const kcal = n(nu['energy-kcal_100g']) ?? (n(nu['energy_100g']) != null ? Math.round(n(nu['energy_100g'])! / 4.184) : null);
  if (!p.code || !/^\d{1,14}$/.test(p.code) || !name || kcal == null) return null;
  const states = p.states_tags ?? [];
  return {
    barcode: p.code,
    name,
    brand: cleanOffText((p.brands ?? '').split(',')[0], 60) || null,
    kcal_100g: kcal,
    protein_100g: n(nu['proteins_100g']) ?? 0,
    carbs_100g: n(nu['carbohydrates_100g']) ?? 0,
    sugars_100g: n(nu['sugars_100g']),
    fat_100g: n(nu['fat_100g']) ?? 0,
    saturates_100g: n(nu['saturated-fat_100g']),
    fiber_100g: n(nu['fiber_100g']),
    salt_100g: n(nu['salt_100g']),
    source: 'off',
    verified:
      states.includes('en:nutrition-facts-completed') && states.includes('en:product-name-completed'),
    owner_id: null,
  };
}

async function offFetch(path: string): Promise<Response> {
  return await fetch(`${OFF}${path}`, {
    headers: { 'User-Agent': 'FFT-app/1.0 (self-hosted)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // Only signed-in users (not the bare anon key) may use the bridge.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: user } = await admin.auth.getUser(token);
  if (!user.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  let body: { query?: string; barcode?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: cors });
  }

  let products: OffProduct[] = [];
  try {
    if (body.barcode && /^\d{6,14}$/.test(body.barcode)) {
      const res = await offFetch(`/api/v2/product/${body.barcode}.json?fields=${FIELDS}`);
      const json = await res.json();
      if (json.status === 1 && json.product) products = [{ ...json.product, code: json.product.code ?? body.barcode }];
    } else if (body.query && body.query.trim().length >= 2) {
      const q = encodeURIComponent(body.query.trim());
      const res = await offFetch(
        `/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=15&fields=${FIELDS}`,
      );
      const json = await res.json();
      products = json.products ?? [];
    }
  } catch {
    return new Response(JSON.stringify({ foods: [], offline: true }), { headers: { ...cors, 'content-type': 'application/json' } });
  }

  const rows = products.map(toRow).filter((r): r is NonNullable<ReturnType<typeof toRow>> => r != null);
  const barcodes = [...new Set(rows.map((r) => r.barcode))];
  if (barcodes.length === 0) {
    return new Response(JSON.stringify({ foods: [] }), { headers: { ...cors, 'content-type': 'application/json' } });
  }

  // Insert only what we do not have yet (one global row per barcode).
  const existing = await admin.from('foods').select('barcode').is('owner_id', null).in('barcode', barcodes);
  const have = new Set((existing.data ?? []).map((f: { barcode: string }) => f.barcode));
  const fresh = rows.filter((r, i) => !have.has(r.barcode) && rows.findIndex((x) => x.barcode === r.barcode) === i);
  if (fresh.length > 0) await admin.from('foods').insert(fresh);

  const { data } = await admin
    .from('foods')
    .select('*, food_servings(label, grams, deleted_at)')
    .is('owner_id', null)
    .in('barcode', barcodes);
  return new Response(JSON.stringify({ foods: data ?? [] }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
