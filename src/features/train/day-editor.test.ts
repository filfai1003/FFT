import {
  addExercisesToDay,
  moveInDay,
  openDay,
  openNewDay,
  removeFromDay,
  summaryLine,
  updateInDay,
  moveInDayTo,
} from './day-editor';
import type { Exercise } from './exercises';
import type { PlanDayView } from './plans';

const ex = (id: string, logType: Exercise['logType'] = 'weight_reps'): Exercise => ({
  id,
  ownerId: null,
  name: id,
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  indirectMuscles: [],
  equipment: 'barbell',
  logType,
  imagePath: null,
});

const day: PlanDayView = {
  id: 'd1',
  position: 1,
  name: 'Push A',
  exercises: [
    {
      id: 'pe1',
      exerciseId: 'bench',
      position: 0,
      targetSets: 4,
      targetReps: '6-8',
      restS: 150,
      notes: null,
      supersetWithNext: true,
      drops: { on: 'last', reps: ['10', '12'] },
      exercise: ex('bench'),
    },
    {
      id: 'pe2',
      exerciseId: 'fly',
      position: 1,
      targetSets: 3,
      targetReps: '12',
      restS: 60,
      notes: 'slow',
      supersetWithNext: false,
      drops: null,
      exercise: ex('fly'),
    },
  ],
};

describe('day editor', () => {
  it('opens an existing day with its exercises', () => {
    const s = openDay('p1', day, 1);
    expect(s.exercises.map((e) => e.id)).toEqual(['pe1', 'pe2']);
    expect(s.exercises[1].notes).toBe('slow');
    expect(s.isNew).toBe(false);
  });

  it('adds exercises once, with sensible defaults, and opens a single new one', () => {
    let s = openDay('p1', day, 1);
    s = addExercisesToDay(s, [ex('bench'), ex('dips', 'reps')]);
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'fly', 'dips']);
    const added = s.exercises[2];
    expect(added).toMatchObject({ targetSets: 3, targetReps: '8-12', restS: 60, notes: '' });
    expect(s.expandedId).toBe(added.id);
  });

  it('remembers which stored rows were removed, but not rows added and removed again', () => {
    let s = openDay('p1', day, 1);
    s = addExercisesToDay(s, [ex('dips')]);
    const newId = s.exercises[2].id;
    s = removeFromDay(s, 'pe1');
    s = removeFromDay(s, newId);
    expect(s.removedIds).toEqual(['pe1']);
    expect(s.exercises.map((e) => e.id)).toEqual(['pe2']);
  });

  it('reorders without leaving the list', () => {
    let s = openDay('p1', day, 1);
    s = moveInDay(s, 'pe1', 1);
    expect(s.exercises.map((e) => e.id)).toEqual(['pe2', 'pe1']);
    expect(moveInDay(s, 'pe2', -1).exercises.map((e) => e.id)).toEqual(['pe2', 'pe1']);
  });

  it('updates the targets of one exercise', () => {
    const s = updateInDay(openDay('p1', day, 1), 'pe2', { targetSets: 5, restS: 90 });
    expect(s.exercises[1]).toMatchObject({ targetSets: 5, restS: 90, targetReps: '12' });
    expect(s.exercises[0].targetSets).toBe(4);
  });

  it('a new day starts empty', () => {
    expect(openNewDay('p1', 3, 'Day 4')).toMatchObject({ isNew: true, exercises: [], position: 3 });
  });

  it('summary line like the mockup: 4 × 6–8 · REST 2:30', () => {
    expect(summaryLine({ targetSets: 4, targetReps: '6-8', restS: 150 })).toEqual({
      sets: 4,
      reps: '6–8',
      rest: '2:30',
    });
  });
});

describe('supersets in the day editor', () => {
  it('opening a day keeps the links and they can be changed', () => {
    const s = openDay('p1', day, 1);
    expect(s.exercises.map((e) => e.supersetWithNext)).toEqual([true, false]);
    const off = updateInDay(s, 'pe1', { supersetWithNext: false });
    expect(off.exercises[0].supersetWithNext).toBe(false);
  });
});

describe('drag and drop in the day editor', () => {
  it('moves an exercise several places at once', () => {
    const s = openDay('p1', day, 1);
    const moved = moveInDayTo(s, 0, 1);
    expect(moved.exercises.map((e) => e.id)).toEqual(['pe2', 'pe1']);
    expect(moveInDayTo(s, 0, 5)).toBe(s);
  });
});
