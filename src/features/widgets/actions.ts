import { t as translate } from 'i18next';
import { checkAsPlanned } from '@/domain/diet';
import { addDays } from '@/domain/day';
import { storedWeight } from '@/domain/units';
import { fetchFixedChecks, fetchFixedPlan, setFixedCheck } from '@/features/diet/fixed';
import {
  addWater,
  copyEntries,
  fetchDayLog,
  removeWater,
  setLogDeleted,
} from '@/features/diet/log';
import {
  fetchBodyEntries,
  saveCheckIn,
  setEntryDeleted,
  setEntryWeight,
} from '@/features/progress/data';
import {
  nextSetTarget,
  quickSetValues,
  setField,
  toggleInRound,
  undoSetDone,
} from '@/features/session/logic';
import { useSessionStore as useWorkoutStore } from '@/features/session/store';
import { setSupplementTaken } from '@/features/supplements/data';
import type { Translate } from '@/i18n';
import { cancelRestEnd, scheduleRestEnd } from '@/lib/notifications';
import { newId } from '@/lib/uuid';
import { hideRestTimer, showRestTimer } from '../../../modules/rest-timer';
import { whenHydrated } from './build';
import { weightTenths, type WidgetName, type WidgetSnapshot } from './snapshot';
import { UNDO_MS, type UndoAction, type WidgetState } from './state';

// Keys built from values (diet.meal.lunch…): the untyped form.
const t = translate as unknown as Translate;

/**
 * The quick actions of the home screen widgets (DECISIONS 68). Each one writes through the same
 * functions as the app's screens (local database, so the sync's outbox and its "last change
 * wins" apply as usual) and, when it can be undone, returns the Undo the widget shows for a few
 * seconds. Every tap is checked against the data as it is now: a tap on a picture that is out of
 * date (or sent by another app) does nothing.
 */
export const WIDGET_ACTIONS = [
  'MEAL_DONE',
  'MEAL_SKIPPED',
  'WATER',
  'SAME_MEAL',
  'SUPPLEMENT',
  'SET_DONE',
  'WEIGHT_STEP',
  'WEIGHT_SAVE',
  'UNDO',
] as const;
export type WidgetAction = (typeof WIDGET_ACTIONS)[number];

export const isWidgetAction = (v: unknown): v is WidgetAction =>
  typeof v === 'string' && (WIDGET_ACTIONS as readonly string[]).includes(v);

export type ActionResult = {
  state: WidgetState;
  /** Something was written: rebuild the snapshot and refresh the app. */
  wrote: boolean;
};

const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** The widget that shows an action's Undo. */
const UNDO_ON: Record<UndoAction['kind'], WidgetName> = {
  meal: 'Calories',
  water: 'Water',
  foods: 'Calories',
  weight: 'Weight',
  set: 'Workout',
};

function withUndo(
  state: WidgetState,
  action: UndoAction,
  message: string,
  now: number,
  widget: WidgetName = UNDO_ON[action.kind],
): WidgetState {
  return {
    ...state,
    notice: null,
    undo: { id: newId(), widget, message, action, until: now + UNDO_MS },
  };
}

/** Weight limits of the database (body_metrics.weight_kg). */
const MIN_KG = 20;
const MAX_KG = 500;

/** The value − / + start from: the draft, else today's (or the latest) weight. */
function weightBase(snapshot: WidgetSnapshot, state: WidgetState): number | null {
  const d = state.weightDraft;
  if (d && d.userId === snapshot.userId && d.day === snapshot.day) return d.tenths;
  return snapshot.weight.kg != null ? weightTenths(snapshot.weight.kg, snapshot.weightUnit) : null;
}

export async function runWidgetAction(
  action: WidgetAction,
  data: Record<string, unknown>,
  snapshot: WidgetSnapshot,
  state: WidgetState,
  now: Date,
): Promise<ActionResult> {
  const { userId, day } = snapshot;
  const at = now.getTime();
  const same: ActionResult = { state, wrote: false };

  switch (action) {
    case 'MEAL_DONE':
    case 'MEAL_SKIPPED': {
      // Only the meal the widget shows as next (a second tap on an old picture does nothing).
      const mealId = str(data.mealId);
      if (!mealId || snapshot.diet.nextMeal?.id !== mealId) return same;
      const plan = await fetchFixedPlan();
      const meal = plan?.meals.find((m) => m.id === mealId);
      if (!meal) return same;
      const before = (await fetchFixedChecks(day)).find((c) => c.fixedMealId === mealId);
      const check =
        action === 'MEAL_DONE'
          ? checkAsPlanned(meal)
          : { status: 'skipped' as const, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
      await setFixedCheck(userId, { day, mealId, check });
      return {
        wrote: true,
        state: withUndo(
          state,
          {
            kind: 'meal',
            day,
            mealId,
            before: before
              ? {
                  status: before.status,
                  kcal: before.kcal,
                  proteinG: before.proteinG,
                  carbsG: before.carbsG,
                  fatG: before.fatG,
                }
              : null,
          },
          t(action === 'MEAL_DONE' ? 'widgets.meal.followed' : 'widgets.meal.wasSkipped', {
            name: meal.name,
          }),
          at,
        ),
      };
    }

    case 'WATER': {
      const ml = snapshot.water.glassMl;
      const id = await addWater(userId, { day, ml });
      return {
        wrote: true,
        state: withUndo(
          state,
          { kind: 'water', id },
          t('widgets.glassAdded', { ml }),
          at,
          data.from === 'Calories' ? 'Calories' : 'Water',
        ),
      };
    }

    case 'SAME_MEAL': {
      const meal = snapshot.diet.meal;
      if (data.meal !== meal || !snapshot.diet.mealEmpty) return same;
      const entries = (await fetchDayLog(addDays(day, -1))).filter((e) => e.meal === meal);
      if (entries.length === 0) return same;
      const ids = await copyEntries(userId, { entries, day, meal });
      return {
        wrote: true,
        state: withUndo(
          state,
          { kind: 'foods', ids },
          t('diet.copiedMeal', { meal: t(`diet.meal.${meal}`), count: ids.length }),
          at,
        ),
      };
    }

    case 'SUPPLEMENT': {
      // Tap to tick, tap again to untick: the tap itself is the undo.
      const item = snapshot.supplements.find((x) => x.id === str(data.id));
      if (!item) return same;
      await setSupplementTaken(userId, { day, supplementId: item.id, taken: !item.taken });
      return { wrote: true, state: { ...state, notice: null } };
    }

    case 'WEIGHT_STEP': {
      const step = data.delta === -1 ? -1 : data.delta === 1 ? 1 : 0;
      const base = weightBase(snapshot, state);
      if (!step || base == null) return same;
      const unit = snapshot.weightUnit;
      const min = weightTenths(MIN_KG, unit);
      const max = weightTenths(MAX_KG, unit);
      const tenths = Math.min(max, Math.max(min, base + step));
      return {
        wrote: false,
        state: { ...state, notice: null, weightDraft: { userId, day, tenths } },
      };
    }

    case 'WEIGHT_SAVE': {
      const tenths = weightBase(snapshot, state);
      if (tenths == null) return same;
      const unit = snapshot.weightUnit;
      const kg = storedWeight(tenths / 10, unit);
      if (kg < MIN_KG || kg > MAX_KG) return same;
      const todays = (await fetchBodyEntries()).filter((e) => e.day === day);
      const beforeKg = todays[todays.length - 1]?.weightKg ?? null;
      const entry = await saveCheckIn(userId, { day, weightKg: kg });
      if (!entry.id) return same;
      return {
        wrote: true,
        state: withUndo(
          { ...state, weightDraft: null },
          { kind: 'weight', entryId: entry.id, created: entry.created, beforeKg },
          t('widgets.weightSaved', { value: (tenths / 10).toFixed(1), unit }),
          at,
        ),
      };
    }

    case 'SET_DONE': {
      await whenHydrated(useWorkoutStore);
      const active = useWorkoutStore.getState().active;
      const target = active ? nextSetTarget(active) : null;
      if (!active || !target || active.id !== str(data.sessionId)) return same;
      const e = active.exercises[target.exercise];
      const set = e.sets[target.set];
      const values = quickSetValues(e, target.set);
      if (set.id !== str(data.setId) || !values) return same;
      let next = active;
      if (e.logType === 'weight_reps')
        next = setField(next, target.exercise, target.set, 'weight', values.weight);
      next = setField(next, target.exercise, target.set, 'reps', values.reps);
      next = toggleInRound(next, target.exercise, target.set, now).next;
      useWorkoutStore.getState().update(() => next);
      if (next.rest && snapshot.restAlerts) await showRest(next.rest.endsAt, at);
      return {
        wrote: true,
        state: withUndo(
          state,
          { kind: 'set', sessionId: active.id, setId: set.id },
          t('widgets.setSaved', { n: target.set + 1, name: e.name }),
          at,
        ),
      };
    }

    case 'UNDO': {
      const undo = state.undo;
      if (!undo || undo.id !== str(data.id)) return same;
      await runUndo(userId, undo.action);
      return { wrote: true, state: { ...state, undo: null } };
    }
  }
}

/** The rest countdown in the notification (and its end alert), as the workout screen shows it. */
async function showRest(endsAt: number, now: number) {
  showRestTimer(
    endsAt,
    t('session.restLiveTitle'),
    t('session.restLiveBody'),
    t('session.restChannel'),
  );
  await scheduleRestEnd((endsAt - now) / 1000, {
    title: t('session.restDoneTitle'),
    body: t('session.restDoneBody'),
  });
}

async function runUndo(userId: string, a: UndoAction) {
  switch (a.kind) {
    case 'meal':
      // Back to what the meal had before (nothing, or the earlier check).
      await setFixedCheck(userId, { day: a.day, mealId: a.mealId, check: a.before });
      return;
    case 'water':
      await removeWater(a.id);
      return;
    case 'foods':
      for (const id of a.ids) await setLogDeleted(id, true);
      return;
    case 'weight':
      if (a.created) await setEntryDeleted(a.entryId, true);
      else await setEntryWeight(a.entryId, a.beforeKg);
      return;
    case 'set': {
      await whenHydrated(useWorkoutStore);
      useWorkoutStore
        .getState()
        .update((s) => (s.id === a.sessionId ? undoSetDone(s, a.setId) : s));
      await cancelRestEnd();
      hideRestTimer();
      return;
    }
  }
}
