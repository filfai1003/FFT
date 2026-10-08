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
