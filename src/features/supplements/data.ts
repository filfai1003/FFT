import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import { newId } from '@/lib/uuid';

/**
 * Supplements: the user's own list (creatine, vitamin D…) and, per day, which ones were taken.
 * A day is "all" when every supplement of the list was taken, "some" when part of them.
 */

export type Supplement = { id: string; name: string; dose: string | null; position: number };
export type SupplementDay = 'all' | 'some' | 'none';

export const supplementKeys = {
  all: ['supplements'] as const,
  list: ['supplements', 'list'] as const,
  logs: (from: string, to: string) => ['supplements', 'logs', from, to] as const,
};

export async function fetchSupplements(): Promise<Supplement[]> {
  const { data, error } = await getSupabase()
    .from('supplements')
    .select('id, name, dose, position')
    .is('deleted_at', null)
    .order('position')
    .order('created_at');
  if (error) throw error;
  return (data as Supplement[]).map((s) => ({ ...s, position: Number(s.position) }));
}

export function useSupplements() {
  return useQuery({ queryKey: supplementKeys.list, queryFn: fetchSupplements });
}

/** Which supplements were taken on each day of the range: day → set of supplement ids. */
export async function fetchSupplementLogs(
  from: string,
  to: string,
): Promise<Map<string, Set<string>>> {
  const { data, error } = await getSupabase()
    .from('supplement_logs')
    .select('day, supplement_id')
    .gte('day', from)
    .lte('day', to)
    .is('deleted_at', null);
  if (error) throw error;
  const byDay = new Map<string, Set<string>>();
  for (const r of data) {
    byDay.set(r.day, (byDay.get(r.day) ?? new Set()).add(r.supplement_id));
  }
  return byDay;
}

export function useSupplementLogs(from: string, to: string) {
  return useQuery({
    queryKey: supplementKeys.logs(from, to),
    queryFn: () => fetchSupplementLogs(from, to),
  });
}

/** How complete a day is, given the list now (supplements removed since do not count). */
export function supplementDay(
  taken: ReadonlySet<string> | undefined,
  list: readonly Supplement[],
): SupplementDay {
  if (!taken || list.length === 0) return 'none';
  const done = list.filter((s) => taken.has(s.id)).length;
  return done === 0 ? 'none' : done === list.length ? 'all' : 'some';
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: supplementKeys.all });
}

/** Ticks (or unticks) a supplement for a day (the app and the widget). */
export async function setSupplementTaken(
  userId: string,
  v: { day: string; supplementId: string; taken: boolean },
) {
  const db = getSupabase();
  if (v.taken) {
    const { error } = await db.from('supplement_logs').insert({
      id: newId(),
      user_id: userId,
      day: v.day,
      supplement_id: v.supplementId,
    });
    // Already ticked (another device, a double tap): nothing to do.
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await db
      .from('supplement_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('day', v.day)
      .eq('supplement_id', v.supplementId)
      .is('deleted_at', null);
    if (error) throw error;
  }
}

/** Ticks (or unticks) a supplement for a day. */
export function useSetTaken() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { day: string; supplementId: string; taken: boolean }) =>
      setSupplementTaken(userId!, v),
    onSuccess: invalidate,
  });
}

/** Adds a supplement to the list, or renames it / changes its dose. */
export function useSaveSupplement() {
  const userId = useAuth((s) => s.userId);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (s: { id?: string; name: string; dose: string | null; position: number }) => {
      const { error } = await getSupabase()
        .from('supplements')
        .upsert({
          id: s.id ?? newId(),
          user_id: userId!,
          name: s.name.trim(),
          dose: s.dose?.trim() || null,
          position: s.position,
          deleted_at: null,
        });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Removes a supplement from the list (and restores it, for UNDO). Past days keep their ticks. */
export function useSetSupplementDeleted() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, deleted }: { id: string; deleted: boolean }) => {
      const { error } = await getSupabase()
        .from('supplements')
        .update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
