import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyE1rm } from '@/domain/progress';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { uploadPrivateImage } from '@/features/train/pick-image';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';
import type { Update } from '@/types/db';

export type BfMethod = 'scale' | 'calipers' | 'tape' | 'other';
export type Pose = 'front' | 'side' | 'back';
export const poses: Pose[] = ['front', 'side', 'back'];
export const measureKeys = ['waist', 'hips', 'chest', 'arm', 'thigh'] as const;
export type MeasureKey = (typeof measureKeys)[number];

export type BodyEntry = {
  id: string;
  day: string;
  createdAt: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  method: BfMethod | null;
  measures: Partial<Record<MeasureKey, number>>;
  notes: string | null;
};

type Row = {
  id: string;
  day: string;
  created_at: string;
  weight_kg: number | string | null;
  body_fat_pct: number | string | null;
  bf_method: string | null;
  waist_cm: number | string | null;
  hips_cm: number | string | null;
  chest_cm: number | string | null;
  arm_cm: number | string | null;
  thigh_cm: number | string | null;
  notes: string | null;
};

const n = (v: number | string | null) => (v == null ? null : Number(v));

export function toEntry(r: Row): BodyEntry {
  const measures: BodyEntry['measures'] = {};
  for (const k of measureKeys) {
    const v = n(r[`${k}_cm` as keyof Row] as number | string | null);
    if (v != null) measures[k] = v;
  }
  return {
    id: r.id,
    day: r.day,
    createdAt: r.created_at,
    weightKg: n(r.weight_kg),
    bodyFatPct: n(r.body_fat_pct),
    method: r.bf_method as BfMethod | null,
    measures,
    notes: r.notes,
  };
}

export const progressKeys = {
  body: ['body', 'entries'] as const,
  goal: ['body', 'goal'] as const,
  daily: ['strength', 'daily'] as const,
  photos: ['body', 'photos'] as const,
  all: ['body'] as const,
};

/** Every body entry, oldest first (a lifetime of check-ins is a few hundred rows at most). */
export function useBodyEntries() {
  return useQuery({
    queryKey: progressKeys.body,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('body_metrics')
        .select('*')
        .is('deleted_at', null)
        .order('day', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as Row[]).map(toEntry);
    },
  });
}

export type BodyGoal = {
  id: string;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  /** A goal can be a weight, a body-fat percentage, or both. */
  targetBodyFatPct: number | null;
  validFrom: string;
};

export function useBodyGoal() {
  return useQuery({
    queryKey: progressKeys.goal,
    queryFn: async (): Promise<BodyGoal | null> => {
      const { data, error } = await getSupabase()
        .from('body_goals')
        .select('*')
        .is('deleted_at', null)
        .order('valid_from', { ascending: false })
        .limit(1);
      if (error) throw error;
      const g = data[0];
      return g
        ? {
            id: g.id,
            startWeightKg: n(g.start_weight_kg),
            targetWeightKg: n(g.target_weight_kg),
            targetBodyFatPct: n(g.target_body_fat_pct),
            validFrom: g.valid_from,
          }
        : null;
    },
  });
}

function useInvalidateBody() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: progressKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
  };
}

export function useSetBodyGoal() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: async (g: {
      day: string;
      startWeightKg: number | null;
      targetWeightKg: number | null;
      targetBodyFatPct: number | null;
    }) => {
      if (g.targetWeightKg == null && g.targetBodyFatPct == null) throw new Error('empty goal');
      const { error } = await getSupabase().from('body_goals').insert({
        id: newId(),
        user_id: userId!,
        valid_from: g.day,
        start_weight_kg: g.startWeightKg,
        target_weight_kg: g.targetWeightKg,
        target_body_fat_pct: g.targetBodyFatPct,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type CheckInInput = {
  day: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  method?: BfMethod | null;
  measures?: Partial<Record<MeasureKey, number>>;
  notes?: string;
  /** Local image URIs by pose; uploaded to the private bucket. */
  photos?: Partial<Record<Pose, string>>;
};

/**
 * One check-in per day: fields left empty keep what is already saved for that day, so logging
 * the weight in the morning and the waist at night ends up in the same entry.
 */
export function useSaveCheckIn() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: async (c: CheckInInput) => {
      const supabase = getSupabase();
      const existing = await supabase
        .from('body_metrics')
        .select('id')
        .eq('day', c.day)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (existing.error) throw existing.error;

      const fields: Record<string, number | string> = {};
      if (c.weightKg != null) fields.weight_kg = c.weightKg;
      if (c.bodyFatPct != null) fields.body_fat_pct = c.bodyFatPct;
      if (c.method) fields.bf_method = c.method;
      for (const k of measureKeys) {
        const v = c.measures?.[k];
        if (v != null) fields[`${k}_cm`] = v;
      }
      if (c.notes && c.notes.trim()) fields.notes = c.notes.trim();

      if (Object.keys(fields).length > 0) {
        const res = existing.data[0]
          ? await supabase
              .from('body_metrics')
              .update(fields as Update<'body_metrics'>)
              .eq('id', existing.data[0].id)
          : await supabase.from('body_metrics').insert({
              id: newId(),
              user_id: userId!,
              day: c.day,
              ...(fields as Update<'body_metrics'>),
            });
        if (res.error) throw res.error;
      }

      for (const pose of poses) {
        const uri = c.photos?.[pose];
        if (!uri) continue;
        const path = await uploadPrivateImage(
          'progress-photos',
          userId!,
          `${c.day}-${pose}-${newId().slice(0, 8)}.jpg`,
          uri,
        );
        const old = await supabase
          .from('progress_photos')
          .select('id')
          .eq('day', c.day)
          .eq('pose', pose)
          .is('deleted_at', null);
        if (old.data?.length) {
          await supabase
            .from('progress_photos')
            .update({ deleted_at: new Date().toISOString() })
            .in(
              'id',
              old.data.map((o) => o.id),
            );
        }
        const res = await supabase
          .from('progress_photos')
          .insert({ id: newId(), user_id: userId!, day: c.day, pose, storage_path: path });
        if (res.error) throw res.error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEntry() {
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: async ({ id, deleted }: { id: string; deleted: boolean }) => {
      const { error } = await getSupabase()
        .from('body_metrics')
        .update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// --- photos ------------------------------------------------------------------------------------

export type Photo = { id: string; day: string; pose: Pose; path: string };

export function usePhotos() {
  return useQuery({
    queryKey: progressKeys.photos,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('progress_photos')
        .select('id, day, pose, storage_path')
        .is('deleted_at', null)
        .order('day', { ascending: false });
      if (error) throw error;
      return (data as { id: string; day: string; pose: Pose; storage_path: string }[]).map<Photo>(
        (p) => ({
          id: p.id,
          day: p.day,
          pose: p.pose,
          path: p.storage_path,
        }),
      );
    },
  });
}

/** Photos are private: shown through short-lived signed URLs. */
export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['body', 'photo-url', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .storage.from('progress-photos')
        .createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// --- strength rows -----------------------------------------------------------------------------

type DailyRow = {
  exercise_id: string;
  day: string;
  best_e1rm_kg: number | string | null;
  sets: number | string;
  volume_kg: number | string | null;
};

/** Best estimated 1RM per exercise per day, for the strength score (computed on the device). */
export function useDailyE1rm() {
  return useQuery({
    queryKey: progressKeys.daily,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('exercise_e1rm_daily')
        .select('exercise_id, day, best_e1rm_kg, sets, volume_kg')
        .order('day', { ascending: true });
      if (error) throw error;
      return (data as unknown as DailyRow[]).map<DailyE1rm>((r) => ({
        exerciseId: r.exercise_id,
        day: r.day,
        bestE1rmKg: r.best_e1rm_kg != null ? Number(r.best_e1rm_kg) : null,
        sets: Number(r.sets),
        volumeKg: Number(r.volume_kg ?? 0),
      }));
    },
  });
}
