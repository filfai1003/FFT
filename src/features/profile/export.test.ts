import { toCsv } from '@/domain/csv';
import { workoutColumns, workoutRows, type ExportData } from './export';

// babel-jest hoists these above the imports
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));

describe('workouts export', () => {
  const data = {
    workout_sessions: [
      { id: 's1', started_at: '2026-10-01T10:00:00Z', day_name: 'Push A', deleted_at: null },
      {
        id: 's2',
        started_at: '2026-10-05T10:00:00Z',
        day_name: 'Pull A',
        deleted_at: '2026-10-06',
      },
    ],
    session_sets: [
      {
        session_id: 's1',
        exercise_id: 'e1',
        set_index: 1,
        weight_kg: 80,
        reps: 5,
        completed_at: 'x',
        deleted_at: null,
      },
      {
        session_id: 's1',
        exercise_id: 'e1',
        set_index: 0,
        weight_kg: 80,
        reps: 6,
        completed_at: 'x',
        deleted_at: null,
      },
      {
        session_id: 's1',
        exercise_id: 'e1',
        set_index: 2,
        weight_kg: 90,
        reps: 1,
        completed_at: null,
        deleted_at: null,
      },
      {
        session_id: 's2',
        exercise_id: 'e1',
        set_index: 0,
        weight_kg: 50,
        reps: 5,
        completed_at: 'x',
        deleted_at: null,
      },
    ],
    exercises: [],
  } as unknown as Pick<ExportData, 'workout_sessions' | 'session_sets' | 'exercises'>;

  it('one line per completed set, of sessions that still exist, in order', () => {
    const rows = workoutRows(data, new Map([['e1', 'Barbell bench press']]));
    expect(rows.map((r) => [r.set, r.weight_kg, r.reps])).toEqual([
      [1, 80, 6],
      [2, 80, 5],
    ]);
    const csv = toCsv(rows, workoutColumns);
    expect(csv.split('\r\n')[0]).toBe(
      'date,workout,exercise,set,weight_kg,reps,duration_s,distance_m',
    );
    expect(csv).toContain('Push A,Barbell bench press,1,80,6');
  });
});
