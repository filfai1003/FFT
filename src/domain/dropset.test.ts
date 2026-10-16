import { firstDropWeight, hasDrops, suggestDrop } from './dropset';

describe('drop sets', () => {
  it('drops after the last set or after every set', () => {
    const last = { on: 'last' as const, reps: ['10'] };
    expect([0, 1, 2].map((i) => hasDrops(last, i, 3))).toEqual([false, false, true]);
    const every = { on: 'every' as const, reps: ['10', '12'] };
    expect([0, 1, 2].map((i) => hasDrops(every, i, 3))).toEqual([true, true, true]);
    expect(hasDrops({ on: 'every', reps: [] }, 0, 3)).toBe(false);
    expect(hasDrops(null, 2, 3)).toBe(false);
  });

  it('first time: about 20% less per drop, on a loadable weight', () => {
    expect(firstDropWeight(80, 1, 2.5)).toBe(62.5);
    expect(firstDropWeight(80, 2, 2.5)).toBe(47.5);
    expect(firstDropWeight(10, 4, 2.5)).toBeNull();
    expect(firstDropWeight(0, 1, 2.5)).toBeNull();
  });

  const base = { equipment: 'machine', unit: 'kg' as const };

  it('each drop follows its own target', () => {
    expect(suggestDrop({ ...base, previous: { weight: 60, reps: 12 }, target: '10-12' })).toEqual({
      kind: 'up',
      from: 60,
      to: 62.5,
      reps: 12,
    });
    expect(suggestDrop({ ...base, previous: { weight: 60, reps: 11 }, target: '10-12' })).toEqual({
      kind: 'same',
      from: 60,
      to: 60,
      reps: 11,
    });
    expect(suggestDrop({ ...base, previous: { weight: 60, reps: 6 }, target: '10' })).toMatchObject(
      { kind: 'down', to: 55 },
    );
  });

  it('small plates and dumbbells change the step', () => {
    expect(
      suggestDrop({ ...base, smallPlates: true, previous: { weight: 60, reps: 12 }, target: '12' })
        ?.to,
    ).toBe(61.25);
    expect(
      suggestDrop({
        ...base,
        equipment: 'dumbbells',
        previous: { weight: 14, reps: 12 },
        target: '12',
      })?.to,
    ).toBe(16);
  });

  it('nothing without history, target or a load to change', () => {
    expect(suggestDrop({ ...base, previous: undefined, target: '10' })).toBeNull();
    expect(suggestDrop({ ...base, previous: { weight: 60, reps: 10 }, target: 'max' })).toBeNull();
    expect(
      suggestDrop({
        ...base,
        equipment: 'bodyweight',
        previous: { weight: 1, reps: 10 },
        target: '10',
      }),
    ).toBeNull();
  });
});
