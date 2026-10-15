import { parseTargetReps, stepFor, suggestNextWeight } from './progression';

const sets = (weight: number, ...reps: number[]) => reps.map((r) => ({ weight, reps: r }));
const base = { targetReps: '6-8', equipment: 'barbell', unit: 'kg' as const };

describe('parseTargetReps', () => {
  it('reads ranges and single numbers', () => {
    expect(parseTargetReps('6-8')).toEqual({ min: 6, max: 8 });
    expect(parseTargetReps('8–12')).toEqual({ min: 8, max: 12 });
    expect(parseTargetReps(' 5 ')).toEqual({ min: 5, max: 5 });
    expect(parseTargetReps('AMRAP')).toBeNull();
    expect(parseTargetReps('12-8')).toBeNull();
    expect(parseTargetReps(undefined)).toBeNull();
  });
});

describe('suggestNextWeight', () => {
  it('top of the range on every set: one step up', () => {
    expect(suggestNextWeight({ ...base, previous: sets(80, 8, 8, 8) })).toEqual({
      kind: 'up',
      from: 80,
      to: 82.5,
      reps: [8, 8, 8],
    });
  });

  it('an odd weight goes up to the next loadable one', () => {
    expect(suggestNextWeight({ ...base, previous: sets(81, 9, 8) })?.to).toBe(82.5);
  });

  it('dumbbells move by 2 kg, pounds by 5', () => {
    expect(
      suggestNextWeight({ ...base, equipment: 'dumbbells', previous: sets(20, 8, 8) })?.to,
    ).toBe(22);
    expect(suggestNextWeight({ ...base, unit: 'lb', previous: sets(185, 8, 8, 8) })?.to).toBe(190);
  });

  it('in the range but not at the top: same weight', () => {
    expect(suggestNextWeight({ ...base, previous: sets(80, 8, 7, 6) })).toMatchObject({
      kind: 'same',
      to: 80,
    });
  });

  it('below the range on every set: about 5% down, at least one step', () => {
    expect(suggestNextWeight({ ...base, previous: sets(100, 5, 4, 4) })).toMatchObject({
      kind: 'down',
      to: 95,
    });
    expect(suggestNextWeight({ ...base, previous: sets(40, 5, 5) })?.to).toBe(37.5);
  });

  it('warm-up sets at a lighter weight do not count', () => {
    expect(
      suggestNextWeight({ ...base, previous: [...sets(40, 10), ...sets(80, 8, 8)] }),
    ).toMatchObject({ kind: 'up', from: 80, reps: [8, 8] });
  });

  it('no suggestion without a rep target, history, or a load to add', () => {
    expect(suggestNextWeight({ ...base, targetReps: undefined, previous: sets(80, 8) })).toBeNull();
    expect(suggestNextWeight({ ...base, previous: [] })).toBeNull();
    expect(suggestNextWeight({ ...base, previous: [{ weight: null, reps: 8 }] })).toBeNull();
    expect(
      suggestNextWeight({ ...base, equipment: 'bodyweight', previous: sets(10, 8) }),
    ).toBeNull();
    expect(stepFor('bands', 'kg')).toBeNull();
  });
});
