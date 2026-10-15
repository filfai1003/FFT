import { catalogueId } from '@/lib/local-db/engine';
import data from './how-to.json';

/**
 * "How to perform" for the catalogue exercises (DECISIONS 50): a few steps and the common
 * mistakes, written per slug in how-to.json (catalogue data, like the names). The user's own
 * exercises have none.
 */
export type HowTo = { steps: string[]; mistakes: string[] };

const bySlug = data as Record<string, HowTo>;
const byId: Record<string, HowTo> = Object.fromEntries(
  Object.entries(bySlug).map(([slug, h]) => [catalogueId(slug), h]),
);

export const howToSlugs = Object.keys(bySlug);

export function howToFor(exerciseId: string): HowTo | null {
  return byId[exerciseId] ?? null;
}
