import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '@/features/auth/session-store';
import { getSupabase } from '@/lib/supabase';
import type { Row, Update } from '@/types/db';

export type Profile = Row<'profiles'>;

export const profileKey = (userId: string | null) => ['profile', userId] as const;

export function useProfile() {
  const userId = useSessionStore((s) => s.userId);
  return useQuery({
    queryKey: profileKey(userId),
    enabled: userId != null,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const userId = useSessionStore((s) => s.userId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Update<'profiles'>) => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .update(patch)
        .eq('id', userId!)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(profileKey(userId), data),
  });
}

export function isOnboarded(profile: Profile | undefined): boolean {
  return profile?.onboarding_completed_at != null;
}

/** The most recent weight (kg) the user logged, or null. */
export function useLatestWeight() {
  const userId = useSessionStore((s) => s.userId);
  return useQuery({
    queryKey: ['body', 'latest-weight', userId],
    enabled: userId != null,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('body_metrics')
        .select('weight_kg, day')
        .not('weight_kg', 'is', null)
        .is('deleted_at', null)
        .order('day', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0] ? { weightKg: Number(data[0].weight_kg), day: data[0].day as string } : null;
    },
  });
}
