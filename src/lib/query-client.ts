import { QueryClient } from '@tanstack/react-query';

/**
 * Server state lives in TanStack Query. The workout session itself is local-first and does NOT
 * depend on this cache (see Phase 2); this is for lists, history and progress.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
        // Keep showing cached data and retry later instead of failing when offline.
        networkMode: 'offlineFirst',
      },
      mutations: { networkMode: 'offlineFirst' },
    },
  });
}
