import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { reportError } from './error-report';

/**
 * Server state lives in TanStack Query. The workout session itself is local-first and does NOT
 * depend on this cache (see Phase 2); this is for lists, history and progress.
 */
export function createQueryClient() {
  return new QueryClient({
    // Failures nobody expected end up in the admin panel (Errors), with the query that failed.
    queryCache: new QueryCache({
      onError: (error, query) => reportError(error, 'query', { key: String(query.queryKey[0]) }),
    }),
    mutationCache: new MutationCache({
      onError: (error, _v, _c, mutation) =>
        reportError(error, 'mutation', { key: String(mutation.options.mutationKey?.[0] ?? '') }),
    }),
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
