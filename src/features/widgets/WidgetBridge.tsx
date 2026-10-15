import { useEffect } from 'react';
import { addDays, deviceTimeZone, localDay } from '@/domain/day';
import { useDayTarget } from '@/features/diet/day-hooks';
import { useDayTotals, useWater } from '@/features/diet/log';
import { useProfile } from '@/features/profile/api';
import { useToday } from '@/features/profile/use-today';
import { useBodyEntries } from '@/features/progress/data';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { useSupplementLogs, useSupplements } from '@/features/supplements/data';
import { useMonthSessions } from '@/features/train/history';
import { useActivePlan, useRotation } from '@/features/train/plans';
import type { WidgetSnapshot } from './snapshot';
import { updateWidgets } from './update';

/**
 * Keeps the home screen widgets up to date (Android): builds the snapshot from the same data as
 * the Today widgets and, whenever it changes, saves it and redraws the widgets. Renders nothing.
 */
export function WidgetBridge() {
  const today = useToday();
  const profile = useProfile();
  const totals = useDayTotals(today);
  const target = useDayTarget(today);
  const water = useWater(today);
  const glassMl = usePreferencesStore((s) => s.waterGlassMl);
  const { plan } = useActivePlan();
  const rotation = useRotation(plan);
  const monthSessions = useMonthSessions(today.slice(0, 7));
  const entries = useBodyEntries();
  const supplements = useSupplements();
  const taken = useSupplementLogs(today, today).data?.get(today);

  const tz = profile.data?.timezone ?? deviceTimeZone();
  const doneToday = (monthSessions.data ?? []).filter(
    (s) => localDay(new Date(s.startedAt), tz) === today,
  );
  const upNext = plan?.days.find((d) => d.id === rotation?.state.upNextDayId) ?? plan?.days[0];
  const weights = (entries.data ?? []).filter((e) => e.weightKg != null);
  const latest = weights[0];
  const weekAgo = weights.find((e) => e.day <= addDays(today, -7));
  const eaten = totals.data ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  const ready = totals.isSuccess && water.isSuccess && entries.isSuccess && supplements.isSuccess;
  const snapshot: WidgetSnapshot | null = ready
    ? {
        day: today,
        calories: {
          eaten: eaten.kcal,
          target: target?.kcal ?? null,
          macros: (['protein', 'carbs', 'fat'] as const).map((key) => ({
            key,
            eaten: eaten[key],
            target: target ? target[key] : null,
          })),
        },
        water: {
          ml: water.data?.totalMl ?? 0,
          glassMl,
          goalGlasses: Math.max(1, Math.round(2000 / glassMl)),
        },
        workout:
          doneToday.length > 0
            ? {
                kind: 'done',
                name:
                  doneToday
                    .map((s) => s.name)
                    .filter(Boolean)
                    .join(', ') || null,
                exercises: 0,
              }
            : upNext
              ? { kind: 'next', name: upNext.name, exercises: upNext.exercises.length }
              : { kind: 'none', name: null, exercises: 0 },
        weight: {
          kg: latest?.weightKg ?? null,
          change7:
            latest?.weightKg != null && weekAgo?.weightKg != null
              ? latest.weightKg - weekAgo.weightKg
              : null,
          day: latest?.day ?? null,
        },
        supplements: (supplements.data ?? []).map((x) => ({
          name: x.name,
          taken: taken?.has(x.id) ?? false,
        })),
      }
    : null;

  // Redrawn only when something shown changes (the key is the snapshot itself).
  const key = snapshot ? JSON.stringify(snapshot) : null;
  useEffect(() => {
    if (key) void updateWidgets(JSON.parse(key) as WidgetSnapshot);
  }, [key]);

  return null;
}
