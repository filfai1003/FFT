import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recipeNutrition } from '@/domain/diet';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import { toFood, type Food } from './foods';

export type RecipeItem = { id: string; foodId: string; food: Food; grams: number };

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  items: RecipeItem[];
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  total: { kcal: number };
};

type Raw = {
  id: string;
  name: string;
  servings: number | string;
  deleted_at: string | null;
  recipe_items?: {
    id: string;
    food_id: string;
    grams: number | string;
    deleted_at: string | null;
    foods: Parameters<typeof toFood>[0] | null;
  }[];
};

export function toRecipe(r: Raw): Recipe {
  const items = (r.recipe_items ?? [])
    .filter((i) => i.deleted_at == null && i.foods != null)
    .map<RecipeItem>((i) => ({
      id: i.id,
      foodId: i.food_id,
      food: toFood(i.foods!),
      grams: Number(i.grams),
    }));
  const servings = Number(r.servings);
  const n = recipeNutrition(
    items.map((i) => ({ per100: i.food.per100, grams: i.grams })),
    servings,
  );
  return {
    id: r.id,
    name: r.name,
    servings,
    items,
    perServing: n.perServing,
    total: { kcal: n.total.kcal },
  };
}

const SELECT =
  'id, name, servings, deleted_at, recipe_items(id, food_id, grams, deleted_at, foods(*, food_servings(label, grams, deleted_at)))';

export const recipeKeys = {
  all: ['recipes'] as const,
  one: (id: string) => ['recipes', id] as const,
};

export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.all,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('recipes')
        .select(SELECT)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data as unknown as Raw[]).map(toRecipe);
    },
  });
}

export function useRecipe(id: string | undefined) {
  const all = useRecipes();
  return { ...all, data: all.data?.find((r) => r.id === id) };
}

export type RecipeInput = {
  id: string;
  name: string;
  servings: number;
  items: { id: string; foodId: string; grams: number }[];
  removedItemIds: string[];
};

export function useSaveRecipe() {
  const userId = useAuth((s) => s.userId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (r: RecipeInput) => {
      const supabase = getSupabase();
      const rec = await supabase.from('recipes').upsert({
        id: r.id,
        user_id: userId!,
        name: r.name.trim(),
        servings: r.servings,
        deleted_at: null,
      });
      if (rec.error) throw rec.error;
      if (r.items.length > 0) {
        const res = await supabase.from('recipe_items').upsert(
          r.items.map((i) => ({
            id: i.id,
            user_id: userId!,
            recipe_id: r.id,
            food_id: i.foodId,
            grams: i.grams,
            deleted_at: null,
          })),
        );
        if (res.error) throw res.error;
      }
      if (r.removedItemIds.length > 0) {
        const res = await supabase
          .from('recipe_items')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', r.removedItemIds);
        if (res.error) throw res.error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('recipes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}

export { newId };
