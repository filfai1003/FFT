import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Per100, Portion } from '@/domain/diet';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';

export type Food = {
  id: string;
  ownerId: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  per100: Per100;
  source: 'off' | 'custom';
  verified: boolean;
  servings: Portion[];
};

type FoodRow = {
  id: string;
  owner_id: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  kcal_100g: number | string;
  protein_100g: number | string;
  carbs_100g: number | string;
  sugars_100g: number | string | null;
  fat_100g: number | string;
  saturates_100g: number | string | null;
  fiber_100g: number | string | null;
  salt_100g: number | string | null;
  source: string;
  verified: boolean;
  food_servings?: { label: string; grams: number | string; deleted_at: string | null }[] | null;
};

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));

export function toFood(r: FoodRow): Food {
  return {
    id: r.id,
    ownerId: r.owner_id,
    barcode: r.barcode,
    name: r.name,
    brand: r.brand,
    per100: {
      kcal: Number(r.kcal_100g),
      protein: Number(r.protein_100g),
      carbs: Number(r.carbs_100g),
      fat: Number(r.fat_100g),
      sugars: num(r.sugars_100g),
      saturates: num(r.saturates_100g),
      fiber: num(r.fiber_100g),
      salt: num(r.salt_100g),
    },
    source: r.source as Food['source'],
    verified: r.verified,
    servings: (r.food_servings ?? [])
      .filter((s) => s.deleted_at == null)
      .map((s) => ({ label: s.label, grams: Number(s.grams) })),
  };
}

export const FOOD_SELECT = '*, food_servings(label, grams, deleted_at)';

export const foodKeys = {
  all: ['foods'] as const,
  search: (q: string) => ['foods', 'search', q] as const,
  recent: ['foods', 'recent'] as const,
  mine: ['foods', 'mine'] as const,
  one: (id: string) => ['foods', 'one', id] as const,
};

/** Escapes the characters that mean something in a LIKE pattern. */
export function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function useFoodSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: foodKeys.search(q),
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('foods')
        .select(FOOD_SELECT)
        .is('deleted_at', null)
        .ilike('name', likePattern(q))
        .order('verified', { ascending: false })
        .order('name')
        .limit(30);
      if (error) throw error;
      return (data as unknown as FoodRow[]).map(toFood);
    },
  });
}

/** Foods logged recently, most recent first, without repeats. */
export function useRecentFoods() {
  return useQuery({
    queryKey: foodKeys.recent,
    queryFn: async () => {
      const supabase = getSupabase();
      const logs = await supabase
        .from('food_logs')
        .select('food_id, created_at')
        .not('food_id', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(120);
      if (logs.error) throw logs.error;
      const ids = [...new Set((logs.data as { food_id: string }[]).map((l) => l.food_id))].slice(
        0,
        25,
      );
      if (ids.length === 0) return [] as Food[];
      const foods = await supabase
        .from('foods')
        .select(FOOD_SELECT)
        .in('id', ids)
        .is('deleted_at', null);
      if (foods.error) throw foods.error;
      const byId = new Map((foods.data as unknown as FoodRow[]).map((f) => [f.id, toFood(f)]));
      return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    },
  });
}

export function useMyFoods() {
  const userId = useAuth((s) => s.userId);
  return useQuery({
    queryKey: foodKeys.mine,
    enabled: userId != null,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('foods')
        .select(FOOD_SELECT)
        .eq('owner_id', userId!)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data as unknown as FoodRow[]).map(toFood);
    },
  });
}

export function useFood(id: string | undefined) {
  return useQuery({
    queryKey: foodKeys.one(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('foods')
        .select(FOOD_SELECT)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return toFood(data as unknown as FoodRow);
    },
  });
}

export type FoodInput = {
  id?: string;
  name: string;
  brand: string;
  barcode: string;
  per100: Per100;
  portions: Portion[];
};

/** Your own food ("Mine"): visible only to you. */
export function useSaveFood() {
  const userId = useAuth((s) => s.userId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FoodInput) => {
      const supabase = getSupabase();
      const id = input.id ?? newId();
      const { error } = await supabase.from('foods').upsert({
        id,
        owner_id: userId!,
        name: input.name.trim(),
        brand: input.brand.trim() || null,
        barcode: input.barcode.trim() || null,
        kcal_100g: input.per100.kcal,
        protein_100g: input.per100.protein,
        carbs_100g: input.per100.carbs,
        sugars_100g: input.per100.sugars ?? null,
        fat_100g: input.per100.fat,
        saturates_100g: input.per100.saturates ?? null,
        fiber_100g: input.per100.fiber ?? null,
        salt_100g: input.per100.salt ?? null,
        source: 'custom',
        verified: false,
      });
      if (error) throw error;
      if (input.portions.length > 0) {
        // Replace the portions: soft-delete the old ones, insert the new ones.
        await supabase
          .from('food_servings')
          .update({ deleted_at: new Date().toISOString() })
          .eq('food_id', id);
        const res = await supabase.from('food_servings').insert(
          input.portions.map((p) => ({
            id: newId(),
            food_id: id,
            label: p.label,
            grams: p.grams,
          })),
        );
        if (res.error) throw res.error;
      }
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: foodKeys.all }),
  });
}
