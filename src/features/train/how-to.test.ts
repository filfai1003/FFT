import { catalogue } from '@/lib/local-db/catalogue';
import { catalogueId } from '@/lib/local-db/engine';
import { howToFor, howToSlugs } from './how-to';

describe('how to perform', () => {
  it('every catalogue exercise has steps and mistakes, and nothing else is listed', () => {
    for (const e of catalogue) {
      const h = howToFor(catalogueId(e.slug));
      expect(h).not.toBeNull();
      expect(h!.steps.length).toBeGreaterThanOrEqual(3);
      expect(h!.mistakes.length).toBeGreaterThanOrEqual(1);
    }
    expect(howToSlugs.sort()).toEqual(catalogue.map((e) => e.slug).sort());
  });

  it("the user's own exercises have none", () => {
    expect(howToFor('00000000-0000-4000-8000-000000000001')).toBeNull();
  });
});
