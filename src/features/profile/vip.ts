import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSessionStore } from '@/features/auth/session-store';
import { getMode } from '@/lib/mode';
import { getAuthClient } from '@/lib/supabase';

/**
 * Whether the admin made this account VIP (premium on, whatever the plan). It lives on the server
 * next to the account (table `vip_users`, readable only by its owner and written only by the admin
 * panel). It is account information, not user data, so it is read with the account client. Premium
 * features will check this; today it only shows as a badge.
 */
export function useIsVip(): boolean {
  const userId = useSessionStore((s) => s.userId);
  const enabled = getMode() === 'cloud' && userId != null;
  const vip = useQuery({
    queryKey: ['vip', userId],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const supabase: SupabaseClient = getAuthClient();
      const { data, error } = await supabase.from('vip_users').select('user_id').maybeSingle();
      if (error) return false;
      return data != null;
    },
  });
  return enabled && vip.data === true;
}
