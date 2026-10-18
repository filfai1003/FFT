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
export async function fetchBodyEntries(): Promise<BodyEntry[]> {
  const { data, error } = await getSupabase()
    .from('body_metrics')
    .select('*')
    .is('deleted_at', null)
    .order('day', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as Row[]).map(toEntry);
}

export function useBodyEntries() {
  return useQuery({ queryKey: progressKeys.body, queryFn: fetchBodyEntries });
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
        // Several changes on the same day: the last one counts.
        .order('created_at', { ascending: false })
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
      // One goal per day: changing it again the same day replaces it (the earlier one did not
      // count); goals of earlier days stay as history. Both empty = no goal from today.
      const supabase = getSupabase();
      const fields = {
        start_weight_kg: g.startWeightKg,
        target_weight_kg: g.targetWeightKg,
        target_body_fat_pct: g.targetBodyFatPct,
      };
      const same = await supabase
        .from('body_goals')
        .select('id')
        .eq('valid_from', g.day)
        .is('deleted_at', null);
      if (same.error) throw same.error;
      const [keep, ...extra] = same.data.map((r) => r.id);
      if (keep) {
        const { error } = await supabase.from('body_goals').update(fields).eq('id', keep);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('body_goals')
          .insert({ id: newId(), user_id: userId!, valid_from: g.day, ...fields });
        if (error) throw error;
      }
      // Rows saved twice the same day before this rule: keep only one.
      if (extra.length > 0) {
        const { error } = await supabase
          .from('body_goals')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', extra);
        if (error) throw error;
      }
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
/**
 * Saves a check-in (the app's check-in screen and the Weight widget). Returns the day's entry:
 * its id, null when nothing was written, and whether it was created now (else updated).
 */
export async function saveCheckIn(
  userId: string,
  c: CheckInInput,
): Promise<{ id: string | null; created: boolean }> {
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

  let entry: { id: string | null; created: boolean } = {
    id: existing.data[0]?.id ?? null,
    created: false,
  };
  if (Object.keys(fields).length > 0) {
    if (existing.data[0]) {
      const res = await supabase
        .from('body_metrics')
        .update(fields as Update<'body_metrics'>)
        .eq('id', existing.data[0].id);
      if (res.error) throw res.error;
    } else {
      const id = newId();
      const res = await supabase.from('body_metrics').insert({
        id,
        user_id: userId,
        day: c.day,
        ...(fields as Update<'body_metrics'>),
      });
      if (res.error) throw res.error;
      entry = { id, created: true };
    }
  }

  for (const pose of poses) {
    const uri = c.photos?.[pose];
    if (!uri) continue;
    const path = await uploadPrivateImage(
      'progress-photos',
      userId,
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
      .insert({ id: newId(), user_id: userId, day: c.day, pose, storage_path: path });
    if (res.error) throw res.error;
  }
  return entry;
}

export function useSaveCheckIn() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: async (c: CheckInInput) => {
      await saveCheckIn(userId!, c);
    },
    onSuccess: invalidate,
  });
}

/** Soft delete of a body entry (and restore, for UNDO). */
export async function setEntryDeleted(id: string, deleted: boolean) {
  const { error } = await getSupabase()
    .from('body_metrics')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/** Puts back the weight an entry had before (UNDO of a weight saved from the widget). */
export async function setEntryWeight(id: string, weightKg: number | null) {
  const { error } = await getSupabase()
    .from('body_metrics')
    .update({ weight_kg: weightKg })
    .eq('id', id);
  if (error) throw error;
}

export function useDeleteEntry() {
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: ({ id, deleted }: { id: string; deleted: boolean }) => setEntryDeleted(id, deleted),
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

/**
 * Deletes one progress photo (or brings it back, for UNDO). The row is marked now; the photo
 * itself (file, row, copies on the server) goes for good a week later (DECISIONS 79).
 */
export async function setPhotoDeleted(id: string, deleted: boolean) {
  const { error } = await getSupabase()
    .from('progress_photos')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export function useDeletePhoto() {
  const invalidate = useInvalidateBody();
  return useMutation({
    mutationFn: ({ id, deleted }: { id: string; deleted: boolean }) => setPhotoDeleted(id, deleted),
    onSuccess: invalidate,
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
