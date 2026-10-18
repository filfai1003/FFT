import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthClient } from '@/lib/supabase';

/**
 * Personal API tokens (Supporter and Premium): they let other apps and AI assistants use the
 * REST API and the MCP server of the api service (server/api.js) as this account. The server
 * makes the token and keeps only its hash, so the app can show it once, right after creating it.
 */

/** The api service. EXPO_PUBLIC_FFT_API_URL overrides it (a local server, for instance). */
export const API_URL = (
  process.env.EXPO_PUBLIC_FFT_API_URL ?? 'https://fft-api.up.railway.app'
).replace(/\/+$/, '');
export const MCP_URL = `${API_URL}/mcp`;
export const REST_URL = `${API_URL}/v1`;

/** read = only the tools that do not change data; write = everything (DECISIONS 59). */
export type ApiTokenScope = 'read' | 'write';

export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  scope: ApiTokenScope;
  /** A connected AI app (OAuth) rather than a personal token (DECISIONS 74). */
  app: boolean;
  /** Where a connected app's sign-in went back to (claude.ai, chatgpt.com, localhost…). */
  redirectHost: string | null;
};

const server = () => getAuthClient() as unknown as SupabaseClient;
const KEY = ['api-tokens'];

export function useApiTokens(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async (): Promise<ApiToken[]> => {
      const { data, error } = await server()
        .from('api_tokens')
        .select('id, name, prefix, created_at, last_used_at, scope, client_id, redirect_host')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        prefix: r.prefix as string,
        createdAt: r.created_at as string,
        lastUsedAt: (r.last_used_at as string | null) ?? null,
        scope: r.scope === 'read' ? 'read' : 'write',
        app: r.client_id != null,
        redirectHost: (r.redirect_host as string | null) ?? null,
      }));
    },
  });
}

/** Creates a token and returns it: the only moment it can be read. */
export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      scope,
    }: {
      name: string;
      scope: ApiTokenScope;
    }): Promise<string> => {
      const { data, error } = await server().rpc('create_api_token', {
        p_name: name,
        p_scope: scope,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Revokes a token (it stops working at once), or brings it back for UNDO. */
export function useSetApiTokenRevoked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, revoked }: { id: string; revoked: boolean }) => {
      const { error } = await server().rpc('set_api_token_revoked', {
        p_id: id,
        p_revoked: revoked,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** The command that adds the MCP server to Claude Code. */
export const claudeCodeCommand = (token: string) =>
  `claude mcp add --transport http fft ${MCP_URL} --header "Authorization: Bearer ${token}"`;
