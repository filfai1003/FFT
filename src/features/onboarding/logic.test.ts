import { addDays, localDay, shortDateLabel, weekOf } from '@/domain/day';
import { autoSplit } from '@/domain/nutrition';
import {
  bodyProblems,
  emptyDraft,
  parseBirthDate,
  starterMeals,
  targetsFor,
  toIsoDate,
  type OnboardingDraft,
} from './logic';

const today = new Date(2026, 9, 8);

const valid: OnboardingDraft = {
  ...emptyDraft,
  goal: 'lose_fat',
  name: 'Alex',
  birthDay: '8',
  birthMonth: '10',
  birthYear: '1995',
  sex: 'male',
  heightCm: '180',
  weightKg: '78.4',
  activity: 'light',
};

describe('birth date', () => {
  it('accepts real dates only', () => {
    expect(parseBirthDate('29', '2', '2000')).not.toBeNull();
    expect(parseBirthDate('30', '2', '2000')).toBeNull();
    expect(parseBirthDate('31', '4', '2000')).toBeNull();
    expect(parseBirthDate('1', '1', '99')).toBeNull();
    expect(parseBirthDate('', '1', '1999')).toBeNull();
    expect(toIsoDate(new Date(1995, 9, 8))).toBe('1995-10-08');
  });
});

describe('"About you" validation', () => {
  it('a complete adult passes', () => {
    expect(bodyProblems(valid, today)).toEqual([]);
  });

  it('blocks under 18, also the day before the 18th birthday', () => {
    expect(
      bodyProblems({ ...valid, birthYear: '2008', birthMonth: '10', birthDay: '9' }, today),
    ).toEqual(['underage']);
    expect(
      bodyProblems({ ...valid, birthYear: '2008', birthMonth: '10', birthDay: '8' }, today),
    ).toEqual([]);
  });

  it('reports each missing or implausible field', () => {
    expect(bodyProblems({ ...valid, name: ' ' }, today)).toContain('name');
    expect(bodyProblems({ ...valid, sex: null }, today)).toContain('sex');
    expect(bodyProblems({ ...valid, heightCm: '18' }, today)).toContain('height');
    expect(bodyProblems({ ...valid, weightKg: '5' }, today)).toContain('weight');
    expect(bodyProblems({ ...valid, birthYear: '2030' }, today)).toContain('birth');
  });

  it('accepts a decimal comma', () => {
    expect(bodyProblems({ ...valid, weightKg: '78,4' }, today)).toEqual([]);
  });
});

describe('targets', () => {
  it('maintenance, suggestion and safety minimum for the example user', () => {
    const t = targetsFor(valid, today);
    expect(t.maintenance).toBe(2420);
    expect(t.suggested).toBe(2200); // 2420 -10% = 2178 -> 2200
    expect(t.minimum).toBe(1850);
    expect(t.kcal).toBe(2200);
  });

  it('a chosen target overrides the suggestion', () => {
    expect(targetsFor({ ...valid, targetKcal: 2000 }, today).kcal).toBe(2000);
  });
});

describe('meal split', () => {
  it('adds up exactly to the target, for any total', () => {
    for (const kcal of [1500, 2000, 2350, 2777]) {
      const meals = starterMeals(kcal, { proteinG: 160, carbsG: 263, fatG: 73 });
      expect(meals).toHaveLength(4);
      expect(meals.reduce((a, m) => a + m.kcal, 0)).toBe(kcal);
      expect(meals.reduce((a, m) => a + m.proteinG, 0)).toBe(160);
      expect(meals.reduce((a, m) => a + m.carbsG, 0)).toBe(263);
      expect(meals.reduce((a, m) => a + m.fatG, 0)).toBe(73);
    }
  });

  it('autoSplit follows the shares', () => {
    const parts = autoSplit({ kcal: 1000, proteinG: 100, carbsG: 100, fatG: 100 }, [1, 1]);
    expect(parts.map((p) => p.kcal)).toEqual([500, 500]);
  });
});

describe('local day helpers', () => {
  it('uses the time zone of the user, not of the server', () => {
    const instant = new Date('2026-10-08T23:30:00Z');
    expect(localDay(instant, 'UTC')).toBe('2026-10-08');
    expect(localDay(instant, 'Europe/Rome')).toBe('2026-10-09');
    expect(localDay(instant, 'America/Los_Angeles')).toBe('2026-10-08');
  });

  it('adds days and builds weeks', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekOf('2026-10-08', 'mon')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(weekOf('2026-10-08', 'sun')[0]).toBe('2026-10-04');
    expect(shortDateLabel('2026-10-08')).toBe('THU OCT 08');
  });
});
