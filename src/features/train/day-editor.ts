import { create } from 'zustand';
import { newId } from '@/lib/uuid';
import type { Exercise } from './exercises';
import type { DayDraftExercise, PlanDayView } from './plans';

export type DayEditorState = {
  planId: string;
  dayId: string;
  position: number;
  isNew: boolean;
  name: string;
  exercises: DayDraftExercise[];
  /** plan_exercises ids that existed when the editor opened and were removed since. */
  removedIds: string[];
  /** The exercise whose settings are open (one at a time). */
  expandedId: string | null;
  /** Ids that came from the database, to know what to soft-delete on save. */
  originalIds: string[];
};

export function defaultsFor(exercise: Exercise) {
  return {
    targetSets: exercise.logType === 'weight_reps' ? 3 : 3,
    targetReps: exercise.logType === 'time' ? '' : '8-12',
    restS: exercise.logType === 'weight_reps' ? 90 : 60,
  };
}

export function draftFromExercise(exercise: Exercise): DayDraftExercise {
  return { id: newId(), exerciseId: exercise.id, exercise, notes: '', ...defaultsFor(exercise) };
}

export function openDay(planId: string, day: PlanDayView, position: number): DayEditorState {
  const exercises = day.exercises.map<DayDraftExercise>((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    exercise: e.exercise,
    targetSets: e.targetSets,
    targetReps: e.targetReps,
    restS: e.restS,
    notes: e.notes ?? '',
  }));
  return {
    planId,
    dayId: day.id,
    position,
    isNew: false,
    name: day.name,
    exercises,
    removedIds: [],
    expandedId: null,
    originalIds: exercises.map((e) => e.id),
  };
}

export function openNewDay(planId: string, position: number, name: string): DayEditorState {
  return {
    planId,
    dayId: newId(),
    position,
    isNew: true,
    name,
    exercises: [],
    removedIds: [],
    expandedId: null,
    originalIds: [],
  };
}

export function addExercisesToDay(s: DayEditorState, added: Exercise[]): DayEditorState {
  const present = new Set(s.exercises.map((e) => e.exerciseId));
  const fresh = added.filter((e) => !present.has(e.id)).map(draftFromExercise);
  return {
    ...s,
    exercises: [...s.exercises, ...fresh],
    expandedId: fresh.length === 1 ? fresh[0].id : s.expandedId,
  };
}

export function removeFromDay(s: DayEditorState, id: string): DayEditorState {
  return {
    ...s,
    exercises: s.exercises.filter((e) => e.id !== id),
    removedIds: s.originalIds.includes(id) ? [...s.removedIds, id] : s.removedIds,
    expandedId: s.expandedId === id ? null : s.expandedId,
  };
}

export function moveInDay(s: DayEditorState, id: string, delta: -1 | 1): DayEditorState {
  const from = s.exercises.findIndex((e) => e.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= s.exercises.length) return s;
  const exercises = [...s.exercises];
  [exercises[from], exercises[to]] = [exercises[to], exercises[from]];
  return { ...s, exercises };
}

export function updateInDay(
  s: DayEditorState,
  id: string,
  patch: Partial<Pick<DayDraftExercise, 'targetSets' | 'targetReps' | 'restS' | 'notes'>>,
): DayEditorState {
  return { ...s, exercises: s.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/** "4 × 6–8 · REST 2:30" shown under a collapsed exercise. */
export function summaryLine(e: Pick<DayDraftExercise, 'targetSets' | 'targetReps' | 'restS'>): {
  sets: number;
  reps: string;
  rest: string;
} {
  const m = Math.floor(e.restS / 60);
  const s = String(e.restS % 60).padStart(2, '0');
  return { sets: e.targetSets, reps: e.targetReps.replace('-', '–'), rest: `${m}:${s}` };
}

type Store = {
  state: DayEditorState | null;
  set: (s: DayEditorState | null) => void;
  patch: (fn: (s: DayEditorState) => DayEditorState) => void;
};

export const useDayEditorStore = create<Store>((set, get) => ({
  state: null,
  set: (state) => set({ state }),
  patch: (fn) => {
    const s = get().state;
    if (s) set({ state: fn(s) });
  },
}));
