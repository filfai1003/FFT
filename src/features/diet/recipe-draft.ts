import { create } from 'zustand';
import { newId } from '@/lib/uuid';
import type { Food } from './foods';
import type { Recipe } from './recipes';

export type DraftItem = { id: string; foodId: string; food: Food; grams: number };

export type RecipeDraft = {
  id: string;
  isNew: boolean;
  name: string;
  servings: number;
  items: DraftItem[];
  originalItemIds: string[];
  removedItemIds: string[];
};

export function draftFromRecipe(r: Recipe): RecipeDraft {
  return {
    id: r.id,
    isNew: false,
    name: r.name,
    servings: r.servings,
    items: r.items.map((i) => ({ id: i.id, foodId: i.foodId, food: i.food, grams: i.grams })),
    originalItemIds: r.items.map((i) => i.id),
    removedItemIds: [],
  };
}

export function newDraft(): RecipeDraft {
  return {
    id: newId(),
    isNew: true,
    name: '',
    servings: 1,
    items: [],
    originalItemIds: [],
    removedItemIds: [],
  };
}

export function addIngredient(d: RecipeDraft, food: Food, grams: number): RecipeDraft {
  const existing = d.items.find((i) => i.foodId === food.id);
  if (existing) {
    return {
      ...d,
      items: d.items.map((i) => (i === existing ? { ...i, grams: i.grams + grams } : i)),
    };
  }
  return { ...d, items: [...d.items, { id: newId(), foodId: food.id, food, grams }] };
}

export function setGrams(d: RecipeDraft, id: string, grams: number): RecipeDraft {
  return { ...d, items: d.items.map((i) => (i.id === id ? { ...i, grams } : i)) };
}

export function removeIngredient(d: RecipeDraft, id: string): RecipeDraft {
  return {
    ...d,
    items: d.items.filter((i) => i.id !== id),
    removedItemIds: d.originalItemIds.includes(id) ? [...d.removedItemIds, id] : d.removedItemIds,
  };
}

type Store = {
  draft: RecipeDraft | null;
  set: (d: RecipeDraft | null) => void;
  patch: (fn: (d: RecipeDraft) => RecipeDraft) => void;
};

export const useRecipeDraftStore = create<Store>((set, get) => ({
  draft: null,
  set: (draft) => set({ draft }),
  patch: (fn) => {
    const d = get().draft;
    if (d) set({ draft: fn(d) });
  },
}));
