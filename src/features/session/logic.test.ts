import {
  addExercises,
  addSet,
  adjustRest,
  buildSession,
  exerciseState,
  formatClock,
  goTo,
  keepLastWeight,
  moveExercise,
  parseDuration,
  removeExercise,
  removeSet,
  restRemainingS,
  sessionRecords,
  setDropField,
  setField,
  startRest,
  toMeters,
  toRows,
  toggleSet,
  totals,
  unfinished,
  restoreExercise,
  undoSetDone,
  type NewExercise,
} from './logic';

const now = new Date('2026-10-08T10:00:00Z');

const incline: NewExercise = {
  exerciseId: 'incline',
  name: 'Incline dumbbell press',
  logType: 'weight_reps',
  imagePath: null,
  restS: 120,
  targetSets: 4,
  previous: [
    { weightKg: 24, reps: 10, durationS: null, distanceM: null },
    { weightKg: 24, reps: 9, durationS: null, distanceM: null },
    { weightKg: 24, reps: 8, durationS: null, distanceM: null },
    { weightKg: 22, reps: 8, durationS: null, distanceM: null },
  ],
};

const plank: NewExercise = {
  exerciseId: 'plank',
  name: 'Plank',
  logType: 'time',
  imagePath: null,
  restS: 60,
  targetSets: 2,
  previous: [],
};

function session(unit: 'kg' | 'lb' = 'kg', exercises = [incline, plank]) {
  return buildSession({
    planId: 'plan',
    planDayId: 'day',
    dayName: 'Push A',
    cycleNumber: 3,
    outOfOrder: false,
    weightUnit: unit,
    exercises,
    now,
  });
}

describe('building a session', () => {
  it('pre-fills the load from the previous session and leaves the reps empty', () => {
    const s = session();
    const sets = s.exercises[0].sets;
    expect(sets).toHaveLength(4);
    expect(sets.map((x) => x.weight)).toEqual(['24', '24', '24', '22']);
    expect(sets.map((x) => x.reps)).toEqual(['', '', '', '']);
    expect(sets.map((x) => x.previous)).toEqual(['24 × 10', '24 × 9', '24 × 8', '22 × 8']);
  });

  it('keeps the planned reps of the exercise, and none for one without a target', () => {
    const planned = { ...incline, targetReps: ' 6-8 ' };
    const s = session('kg', [planned, { ...plank, targetReps: '' }]);
    expect(s.exercises[0].targetReps).toBe('6-8');
    expect(s.exercises[1].targetReps).toBeUndefined();
  });

  it('with no history the load is empty and there is no previous', () => {
    const sets = session().exercises[1].sets;
    expect(sets.map((x) => x.weight)).toEqual(['', '']);
    expect(sets.map((x) => x.previous)).toEqual([null, null]);
  });

  it('shows the previous load in the unit of the user', () => {
    const sets = session('lb').exercises[0].sets;
    expect(sets[0].weight).toBe('52.9'); // 24 kg
    expect(sets[0].previous).toBe('52.9 × 10');
  });

  it('every set and exercise row has its own id', () => {
    const s = session();
    const ids = [
      ...s.exercises.map((e) => e.rowId),
      ...s.exercises.flatMap((e) => e.sets.map((x) => x.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('editing', () => {
  it('toggling a set records the time and can be undone', () => {
    const s = session();
    const a = toggleSet(s, 0, 0, now);
    expect(a.completed).toBe(true);
    expect(a.session.exercises[0].sets[0]).toMatchObject({
      done: true,
      completedAt: now.toISOString(),
    });
    const b = toggleSet(a.session, 0, 0, now);
    expect(b.completed).toBe(false);
    expect(b.session.exercises[0].sets[0]).toMatchObject({ done: false, completedAt: null });
    expect(s.exercises[0].sets[0].done).toBe(false); // the original is untouched
  });

  it('adds a set starting from the last load, and removes one', () => {
    let s = setField(session(), 0, 3, 'weight', '25');
    s = addSet(s, 0);
    expect(s.exercises[0].sets).toHaveLength(5);
    expect(s.exercises[0].sets[4].weight).toBe('25');
    s = removeSet(s, 0, 0);
    expect(s.exercises[0].sets).toHaveLength(4);
  });

  it('adds exercises on the fly without duplicates and removes them', () => {
    let s = addExercises(session('kg', [incline]), [incline, plank]);
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(['incline', 'plank']);
    s = goTo(s, 1);
    s = removeExercise(s, 1);
    expect(s.exercises).toHaveLength(1);
    expect(s.index).toBe(0);
  });

  it('moving exercises keeps the one on screen', () => {
    let s = goTo(session(), 0);
    s = moveExercise(s, 0, 1);
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(['plank', 'incline']);
    expect(s.index).toBe(1); // still looking at the incline press
  });

  it('exercise state', () => {
    let s = session();
    expect(exerciseState(s.exercises[0])).toBe('todo');
    s = toggleSet(s, 0, 0, now).session;
    expect(exerciseState(s.exercises[0])).toBe('partial');
    for (let i = 1; i < 4; i++) s = toggleSet(s, 0, i, now).session;
    expect(exerciseState(s.exercises[0])).toBe('done');
  });
});

describe('rest timer', () => {
  it('counts down from the start, can be adjusted by 15 s and ends at zero', () => {
    let s = startRest(session(), 120, 1_000_000);
    expect(restRemainingS(s, 1_000_000)).toBe(120);
    expect(restRemainingS(s, 1_000_000 + 36_000)).toBe(84);
    s = adjustRest(s, 15, 1_000_000 + 36_000);
    expect(restRemainingS(s, 1_000_000 + 36_000)).toBe(99);
    s = adjustRest(s, -15, 1_000_000 + 36_000);
    expect(restRemainingS(s, 1_000_000 + 36_000)).toBe(84);
    expect(restRemainingS(s, 1_000_000 + 200_000)).toBe(0);
    expect(adjustRest(s, -600, 1_000_000).rest).toBeNull();
  });

  it('a rest of zero seconds means no timer', () => {
    expect(startRest(session(), 0, 0).rest).toBeNull();
  });

  it('formats clocks', () => {
    expect(formatClock(84)).toBe('01:24');
    expect(formatClock(3725)).toBe('01:02:05');
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('totals, unfinished and records', () => {
  function doneSession() {
    let s = session();
    s = setField(s, 0, 0, 'reps', '10');
    s = setField(s, 0, 0, 'weight', '26');
    s = setField(s, 0, 1, 'reps', '9');
    s = setField(s, 0, 1, 'weight', '26');
    s = toggleSet(s, 0, 0, now).session;
    s = toggleSet(s, 0, 1, now).session;
    return s;
  }

  it('volume counts only completed weighted sets', () => {
    const t = totals(doneSession(), new Date('2026-10-08T10:52:40Z'));
    expect(t).toMatchObject({
      volumeKg: 26 * 10 + 26 * 9,
      setsDone: 2,
      setsTotal: 6,
      exercisesDone: 0,
    });
    expect(t.durationS).toBe(52 * 60 + 40);
  });

  it('lists what is not finished for the Finish sheet', () => {
    expect(unfinished(doneSession())).toEqual([
      { name: 'Incline dumbbell press', done: 2, total: 4 },
      { name: 'Plank', done: 0, total: 2 },
    ]);
  });

  it('detects NEW MAX and NEW EST. 1RM against previous bests (kg)', () => {
    const records = sessionRecords(doneSession(), {
      incline: { actualMax: 24, est1rm: 32 },
    });
    expect(records.map((r) => r.kind)).toEqual(['max', 'est1rm']);
    expect(records[0]).toMatchObject({
      name: 'Incline dumbbell press',
      value: 26,
      was: 24,
      reps: 10,
    });
  });

  it('no records the first time an exercise is done', () => {
    expect(sessionRecords(doneSession(), {})).toEqual([]);
  });

  it('records are compared in kg even when the user types lb', () => {
    let s = session('lb', [incline]);
    s = setField(s, 0, 0, 'weight', '60'); // 27.2 kg > 24 kg
    s = setField(s, 0, 0, 'reps', '10');
    s = toggleSet(s, 0, 0, now).session;
    const [max] = sessionRecords(s, { incline: { actualMax: 24, est1rm: null } });
    expect(max.value).toBeCloseTo(27.22, 1);
  });
});

describe('saving', () => {
  it('writes only completed sets, renumbered, with weights in kg', () => {
    let s = session('lb', [incline, plank]);
    s = setField(s, 0, 0, 'weight', '185');
    s = setField(s, 0, 0, 'reps', '5');
    s = setField(s, 0, 2, 'weight', '185');
    s = setField(s, 0, 2, 'reps', '4');
    s = toggleSet(s, 0, 0, now).session;
    s = toggleSet(s, 0, 2, now).session; // the 2nd set is skipped
    s = setField(s, 1, 0, 'duration', '1:30');
    s = toggleSet(s, 1, 0, now).session;

    const rows = toRows(s, 'user', {
      endedAt: new Date('2026-10-08T11:00:00Z'),
      feeling: 4,
      notes: ' ok ',
    });
    expect(rows.session).toMatchObject({
      id: s.id,
      user_id: 'user',
      plan_day_id: 'day',
      cycle_number: 3,
      status: 'done',
      feeling: 4,
      notes: 'ok',
      ended_at: '2026-10-08T11:00:00.000Z',
    });
    expect(rows.exercises.map((e) => [e.exercise_id, e.position])).toEqual([
      ['incline', 0],
      ['plank', 1],
    ]);
    const inclineSets = rows.sets.filter((x) => x.exercise_id === 'incline');
    expect(inclineSets.map((x) => x.set_index)).toEqual([0, 1]);
    expect(inclineSets[0].weight_kg).toBe(83.91); // 185 lb
    expect(inclineSets.map((x) => x.reps)).toEqual([5, 4]);
    const plankSet = rows.sets.find((x) => x.exercise_id === 'plank')!;
    expect(plankSet).toMatchObject({ duration_s: 90, reps: null, weight_kg: null });
  });

  it('an exercise with nothing checked off is not saved', () => {
    const rows = toRows(session(), 'user', { endedAt: now, feeling: null, notes: '' });
    expect(rows.exercises).toEqual([]);
    expect(rows.sets).toEqual([]);
    expect(rows.session.notes).toBeNull();
  });

  it('parses durations and distances', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('a:b')).toBeNull();
    expect(toMeters('5')).toBe(5000);
    expect(toMeters('2,5')).toBe(2500);
    expect(toMeters('x')).toBeNull();
  });
});

describe('undo', () => {
  it('UNDO of a set only un-checks that set and stops the rest, keeping later edits', () => {
    let s = session();
    const setId = s.exercises[0].sets[0].id;
    s = startRest(toggleSet(s, 0, 0, now).session, 90, 0);
    s = setField(s, 0, 1, 'reps', '8'); // typed after the toast appeared
    const undone = undoSetDone(s, setId);
    expect(undone.exercises[0].sets[0]).toMatchObject({ done: false, completedAt: null });
    expect(undone.rest).toBeNull();
    expect(undone.exercises[0].sets[1].reps).toBe('8');
  });

  it('UNDO twice or on an unchecked set changes nothing', () => {
    const s = session();
    expect(undoSetDone(s, s.exercises[0].sets[0].id)).toBe(s);
  });

  it('UNDO of a removed exercise restores it in place', () => {
    const s = session();
    const removed = s.exercises[0];
    const without = removeExercise(s, 0);
    const back = restoreExercise(without, removed, 0);
    expect(back.exercises.map((e) => e.exerciseId)).toEqual(['incline', 'plank']);
    expect(restoreExercise(back, removed, 0)).toBe(back);
  });
});

describe('next weight suggestion', () => {
  const bench: NewExercise = {
    exerciseId: 'bench',
    name: 'Bench press',
    logType: 'weight_reps',
    imagePath: null,
    restS: 120,
    targetSets: 3,
    targetReps: '6-8',
    equipment: 'barbell',
    previous: [40, 80, 80, 80].map((w, i) => ({
      weightKg: w,
      reps: i === 0 ? 10 : 8,
      durationS: null,
      distanceM: null,
    })),
  };
  const build = (e: NewExercise) =>
    buildSession({
      planId: null,
      planDayId: null,
      dayName: 'Push',
      cycleNumber: null,
      outOfOrder: false,
      weightUnit: 'kg',
      now,
      exercises: [e],
    });

  it('working sets start at the suggested weight; Keep goes back and forth', () => {
    const s = build({ ...bench, targetSets: 4 });
    expect(s.exercises[0].suggestion).toMatchObject({ kind: 'up', from: 80, to: 82.5 });
    expect(s.exercises[0].sets.map((x) => x.weight)).toEqual(['40', '82.5', '82.5', '82.5']);
    const kept = keepLastWeight(s, 0);
    expect(kept.exercises[0].sets.map((x) => x.weight)).toEqual(['40', '80', '80', '80']);
    expect(kept.exercises[0].suggestion?.kept).toBe(true);
    const back = keepLastWeight(kept, 0, false);
    expect(back.exercises[0].sets.map((x) => x.weight)).toEqual(['40', '82.5', '82.5', '82.5']);
  });

  it('no suggestion without a rep target', () => {
    const s = build({ ...bench, targetReps: undefined });
    expect(s.exercises[0].suggestion).toBeUndefined();
    expect(s.exercises[0].sets.map((x) => x.weight)).toEqual(['40', '80', '80']);
  });
});

describe('reorder exercises', () => {
  it('a move of several places keeps the exercise on screen', () => {
    const ex = (id: string): NewExercise => ({
      exerciseId: id,
      name: id,
      logType: 'weight_reps',
      imagePath: null,
      restS: 60,
      targetSets: 1,
      previous: [],
    });
    const s = goTo(
      buildSession({
        planId: null,
        planDayId: null,
        dayName: 'x',
        cycleNumber: null,
        outOfOrder: false,
        weightUnit: 'kg',
        now,
        exercises: ['a', 'b', 'c', 'd'].map(ex),
      }),
      1,
    );
    const moved = moveExercise(s, 0, 3);
    expect(moved.exercises.map((e) => e.exerciseId)).toEqual(['b', 'c', 'd', 'a']);
    expect(moved.exercises[moved.index].exerciseId).toBe('b');
  });
});

describe('drop sets in the workout', () => {
  const press: NewExercise = {
    exerciseId: 'press',
    name: 'Chest press machine',
    logType: 'weight_reps',
    imagePath: null,
    restS: 90,
    targetSets: 3,
    targetReps: '8-10',
    equipment: 'machine',
    drops: { on: 'last', reps: ['10', '12'] },
    previous: [],
  };
  const build = (e: NewExercise) =>
    buildSession({
      planId: null,
      planDayId: null,
      dayName: 'Push',
      cycleNumber: null,
      outOfOrder: false,
      weightUnit: 'kg',
      now,
      exercises: [e],
    });

  it('first time: drops on the last set only, about 20% lighter each', () => {
    const s = build({
      ...press,
      previous: [80, 80, 80].map((w) => ({
        weightKg: w,
        reps: 9,
        durationS: null,
        distanceM: null,
      })),
    });
    const sets = s.exercises[0].sets;
    expect(sets.map((x) => x.drops?.length ?? 0)).toEqual([0, 0, 2]);
    expect(sets[2].drops!.map((d) => [d.weight, d.target])).toEqual([
      ['62.5', '10'],
      ['47.5', '12'],
    ]);
  });

  it('each drop is suggested from the same drop last time', () => {
    const prev = (w: number, drops?: { weightKg: number; reps: number }[]) => ({
      weightKg: w,
      reps: 9,
      durationS: null,
      distanceM: null,
      drops,
    });
    const s = build({
      ...press,
      previous: [
        prev(80),
        prev(80),
        prev(80, [
          { weightKg: 60, reps: 12 },
          { weightKg: 45, reps: 9 },
        ]),
      ],
    });
    const e = s.exercises[0];
    // Drop 1 reached its 10 reps: up; drop 2 fell short of 12: down.
    expect(e.dropSuggestions?.map((d) => d?.kind)).toEqual(['up', 'down']);
    expect(e.sets[2].drops!.map((d) => d.weight)).toEqual(['62.5', '42.5']);
    expect(e.sets[2].drops![0].previous).toBe('60 × 12');
  });

  it('drops are saved as rows next to their set and count in volume', () => {
    let s = build({ ...press, targetSets: 1 });
    s = setField(s, 0, 0, 'weight', '80');
    s = setField(s, 0, 0, 'reps', '8');
    s = setDropField(s, 0, 0, 0, 'weight', '60');
    s = setDropField(s, 0, 0, 0, 'reps', '10');
    s = toggleSet(s, 0, 0, now).session;
    const rows = toRows(s, 'user', { endedAt: now, feeling: null, notes: '' });
    expect(rows.sets.map((r) => [r.set_index, r.drop_index, r.weight_kg, r.reps])).toEqual([
      [0, 0, 80, 8],
      [0, 1, 60, 10],
    ]);
    expect(totals(s, now).volumeKg).toBe(80 * 8 + 60 * 10);
  });

  it('after the last set only: a new set takes the drops over', () => {
    const s = addSet(build(press), 0);
    expect(s.exercises[0].sets.map((x) => x.drops?.length ?? 0)).toEqual([0, 0, 0, 2]);
    const back = removeSet(s, 0, 3);
    expect(back.exercises[0].sets.map((x) => x.drops?.length ?? 0)).toEqual([0, 0, 2]);
  });

  it('after every set: every set has its drops', () => {
    const s = addSet(build({ ...press, drops: { on: 'every', reps: ['10'] } }), 0);
    expect(s.exercises[0].sets.map((x) => x.drops?.length ?? 0)).toEqual([1, 1, 1, 1]);
  });
});
