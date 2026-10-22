import {
  ageOnDay,
  countedWeightKg,
  effectiveWaterTarget,
  isWaterAutomatic,
  trainingWaterMl,
  waterMlPerKg,
  waterTarget,
  waterTargetMl,
  workoutMinutes,
} from './hydration';

describe('water target (DECISIONS 127)', () => {
  it('base = weight × ml per kg of the age band', () => {
    expect(waterTargetMl({ weightKg: 70, ageYears: 25, sex: 'male' })).toBe(2450);
    expect(waterTargetMl({ weightKg: 70, ageYears: 40, sex: 'male' })).toBe(2300); // 2310 → 2300
    expect(waterTargetMl({ weightKg: 70, ageYears: 60, sex: 'male' })).toBe(2100);
  });

  it('age bands: under 30, 30–54, 55 and over; unknown = the middle band', () => {
    expect(waterMlPerKg(18)).toBe(35);
    expect(waterMlPerKg(29)).toBe(35);
    expect(waterMlPerKg(30)).toBe(33);
    expect(waterMlPerKg(54)).toBe(33);
    expect(waterMlPerKg(55)).toBe(30);
    expect(waterMlPerKg(null)).toBe(33);
  });

  it('never under the EFSA amount from drinks for the sex', () => {
    // 50 kg × 33 = 1650: a man gets 2.0 L, a woman 1650, unknown sex 1.8 L.
    const male = waterTarget({ weightKg: 50, ageYears: 40, sex: 'male' });
    expect(male.ml).toBe(2000);
    expect(male.floorApplied).toBe(true);
    expect(waterTargetMl({ weightKg: 50, ageYears: 40, sex: 'female' })).toBe(1650);
    expect(waterTargetMl({ weightKg: 45, ageYears: 60, sex: 'female' })).toBe(1600);
    expect(waterTargetMl({ weightKg: 50, ageYears: 40 })).toBe(1800);
  });

  it('above BMI 30 only 40% of the extra weight counts, without a jump at BMI 30', () => {
    // 180 cm: BMI 30 = 97.2 kg. 130 kg → 97.2 + 0.4 × 32.8 = 110.3 kg.
    expect(countedWeightKg(130, 180)).toBeCloseTo(110.32, 1);
    expect(countedWeightKg(97, 180)).toBe(97);
    expect(countedWeightKg(97.3, 180)).toBeCloseTo(97.24, 1);
    const b = waterTarget({ weightKg: 130, heightCm: 180, ageYears: 25, sex: 'male' });
    expect(b.base).toMatchObject({ kind: 'weight', countedKg: 110.3, mlPerKg: 35 });
    expect(b.ml).toBe(3850);
    // Without a height the BMI is unknown: the real weight counts.
    expect(waterTarget({ weightKg: 130, ageYears: 25 }).base).toMatchObject({ countedKg: null });
    expect(waterTargetMl({ weightKg: 130, ageYears: 25 })).toBe(4550);
  });

  it('a training day adds 500 ml per hour of workout, 500 ml when the length is unknown', () => {
    expect(trainingWaterMl(false, 90)).toBe(0);
    expect(trainingWaterMl(true, null)).toBe(500);
    expect(trainingWaterMl(true, 0)).toBe(500);
    expect(trainingWaterMl(true, 30)).toBe(250);
    expect(trainingWaterMl(true, 90)).toBe(750);
    expect(trainingWaterMl(true, 240)).toBe(1500); // capped
    const b = waterTarget({ weightKg: 70, ageYears: 25, sex: 'male', trainedToday: true });
    expect(b.ml).toBe(2950);
    expect(b.trainingMl).toBe(500);
    expect(
      waterTarget({ weightKg: 70, ageYears: 25, trainedToday: true, workoutMinutes: 75 }).ml,
    ).toBe(3100); // 2450 + 625 = 3075 → 3100
  });

  it('kept between 1.5 and 5.0 L', () => {
    const big = waterTarget({
      weightKg: 150,
      ageYears: 20,
      trainedToday: true,
      workoutMinutes: 180,
    });
    expect(big.ml).toBe(5000);
    expect(big.clamped).toBe('max');
    expect(waterTarget({ weightKg: 40, ageYears: 70, sex: 'female' }).ml).toBe(1600);
  });

  it('missing data falls back: no weight = the floor of the sex, nothing = 2.0 L', () => {
    const none = waterTarget({});
    expect(none.ml).toBe(2000);
    expect(none.base.kind).toBe('default');
    expect(none.used).toEqual({ weight: false, height: false, age: false, sex: false });
    expect(waterTarget({ sex: 'female' })).toMatchObject({ ml: 1600, base: { kind: 'floor' } });
    expect(waterTarget({ sex: 'male', heightCm: 180, ageYears: 30 }).ml).toBe(2000);
    // Training still counts without a weight.
    expect(waterTargetMl({ trainedToday: true })).toBe(2500);
    const used = waterTarget({ weightKg: 80, heightCm: 180, ageYears: 33, sex: 'male' }).used;
    expect(used).toEqual({ weight: true, height: true, age: true, sex: true });
  });

  it('rounds to 50 ml', () => {
    expect(waterTargetMl({ weightKg: 71, ageYears: 25, sex: 'male' })).toBe(2500); // 2485
    expect(waterTargetMl({ weightKg: 72.3, ageYears: 25, sex: 'male' })).toBe(2550); // 2531
  });
});

describe('helpers', () => {
  it('age on a day from date strings', () => {
    expect(ageOnDay('1990-10-22', '2026-10-22')).toBe(36);
    expect(ageOnDay('1990-10-23', '2026-10-22')).toBe(35);
    expect(ageOnDay(null, '2026-10-22')).toBeNull();
    expect(ageOnDay('nonsense', '2026-10-22')).toBeNull();
  });

  it('workout minutes: summed, each at most 3 h, an unended one = 1 h', () => {
    expect(workoutMinutes([])).toBeNull();
    expect(
      workoutMinutes([
        { startedAt: '2026-10-22T08:00:00Z', endedAt: '2026-10-22T09:15:00Z' },
        { startedAt: '2026-10-22T18:00:00Z', endedAt: null },
      ]),
    ).toBe(135);
    expect(
      workoutMinutes([{ startedAt: '2026-10-22T08:00:00Z', endedAt: '2026-10-23T08:00:00Z' }]),
    ).toBe(180);
  });

  it('automatic or the user’s own: rows from before count 2000 as the untouched default', () => {
    expect(isWaterAutomatic({ water_auto: null, water_ml: 2000 })).toBe(true);
    expect(isWaterAutomatic({ water_ml: 2500 })).toBe(false);
    expect(isWaterAutomatic({ water_auto: false, water_ml: 2000 })).toBe(false);
    expect(isWaterAutomatic({ water_auto: true, water_ml: 2500 })).toBe(true);
  });

  it('the target in force: the user’s own number, else the automatic one', () => {
    const input = { weightKg: 70, ageYears: 25, sex: 'male' as const };
    expect(effectiveWaterTarget(null, input)).toMatchObject({ ml: 2450, automatic: true });
    expect(effectiveWaterTarget({ waterMl: 3000, waterAuto: false }, input)).toMatchObject({
      ml: 3000,
      automatic: false,
      manualMl: 3000,
    });
    expect(effectiveWaterTarget({ waterMl: 3000, waterAuto: true }, input)).toMatchObject({
      ml: 2450,
      automatic: true,
      manualMl: 3000,
    });
  });
});
