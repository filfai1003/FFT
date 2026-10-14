import { rankFoods, type Food } from './foods';

const food = (name: string, source: Food['source'] = 'ciqual') => ({ name, source }) as Food;

describe('food search ranking', () => {
  it('puts the closest names first', () => {
    const ranked = rankFoods(
      [
        food('Pineapple, raw'),
        food('Apple juice, pure juice'),
        food('Apple, pulp and peel, raw'),
        food('Cake, apple'),
      ],
      'apple',
    ).map((f) => f.name);
    expect(ranked).toEqual([
      'Apple, pulp and peel, raw',
      'Apple juice, pure juice',
      'Cake, apple',
      'Pineapple, raw',
    ]);
  });

  it('your own foods come first', () => {
    expect(rankFoods([food('Apple, raw'), food('My apple pie', 'custom')], 'apple')[0].name).toBe(
      'My apple pie',
    );
  });
});
