import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthClient } from '@/lib/supabase';
import { useToastStore } from '@/lib/toast-store';
import { connectionsSeenKeyOf, unseenConnections } from './connections';

/**
 * At app start, a notice for every AI app connected since the last start (DECISIONS 99): someone
 * who tricked the user into opening an authorization link would otherwise go unnoticed until the
 * user opened API & MCP. Account state through the auth client (the connections live only on the
 * server); offline or failing: nothing is shown and it is tried again at the next start.
 */
export function useConnectionNotice(userId: string | null, enabled: boolean) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const key = connectionsSeenKeyOf(userId);
        const seenAt = await AsyncStorage.getItem(key);
        const server = getAuthClient() as unknown as SupabaseClient;
        const { data, error } = await server
          .from('api_tokens')
          .select('name, created_at, redirect_host, client_id')
          .not('client_id', 'is', null)
          .is('deleted_at', null);
        if (error || cancelled) return;
        const apps = (data ?? []).map((r) => ({
          app: true,
          name: String(r.name),
          host: (r.redirect_host as string | null) ?? '',
          createdAt: String(r.created_at),
        }));
        const fresh = unseenConnections(apps, seenAt);
        await AsyncStorage.setItem(key, new Date().toISOString());
        if (fresh.length === 0) return;
        const newest = fresh.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
        useToastStore.getState().show({
          message: t('api.connectedNotice', {
            count: fresh.length,
            name: newest.name,
            host: newest.host,
          }),
          actionLabel: t('api.review'),
          onAction: () => router.push('/profile/api'),
          durationMs: 12_000,
        });
      } catch {
        // Best effort: asked again at the next start.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled, t]);
}
