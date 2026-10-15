import { afterSetInSuperset, supersetLabels, supersetOf } from './superset';

describe('supersets', () => {
  // 0 alone, 1+2 together, 3 alone, 4+5+6 together.
  const links = [false, true, false, false, true, true, false];

  it('finds the superset of an exercise', () => {
    expect(supersetOf(links, 0)).toEqual([0]);
    expect(supersetOf(links, 1)).toEqual([1, 2]);
    expect(supersetOf(links, 2)).toEqual([1, 2]);
    expect(supersetOf(links, 5)).toEqual([4, 5, 6]);
    expect(supersetOf(links, 3)).toEqual([3]);
  });

  it('labels supersets A1, A2, B1…', () => {
    expect(supersetLabels(links)).toEqual([null, 'A1', 'A2', null, 'B1', 'B2', 'B3']);
    expect(supersetLabels([true, false])).toEqual(['A1', 'A2']);
    expect(supersetLabels([false, false])).toEqual([null, null]);
  });

  it('A1 -> A2 with no rest; after A2 rest and back to A1', () => {
    const left = [3, 3, 3, 3, 3, 3, 3];
    expect(afterSetInSuperset(links, 1, left)).toEqual({ goTo: 2, rest: false });
    expect(afterSetInSuperset(links, 2, left)).toEqual({ goTo: 1, rest: true });
  });

  it('an exercise with no sets left is skipped in the round', () => {
    expect(afterSetInSuperset(links, 4, [0, 0, 0, 0, 2, 0, 2])).toEqual({ goTo: 6, rest: false });
    expect(afterSetInSuperset(links, 6, [0, 0, 0, 0, 0, 0, 1])).toEqual({ goTo: null, rest: true });
  });

  it('the superset is finished: rest and stay', () => {
    expect(afterSetInSuperset(links, 2, [3, 0, 0, 3, 3, 3, 3])).toEqual({ goTo: null, rest: true });
  });

  it('an exercise alone: rest as usual', () => {
    expect(afterSetInSuperset(links, 0, [2, 3, 3, 3, 3, 3, 3])).toEqual({ goTo: null, rest: true });
  });
});
