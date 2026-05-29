// packages/demo/src/utils/hooks.ts
//
// React Query plumbing: single QueryClient, query-key factory, helper hooks
// used by the post-Phase-5 panels.
//
// Phase 5 ships the minimum needed to wire <QueryClientProvider> in App.tsx
// and to let Phase 6.X panels invalidate keys after a write. Per-panel
// use*Data hooks (useUserData, useMerchantData, useAdminData, useProducts)
// are added incrementally by each Phase 6.X panel refactor — they need
// matching loader functions in services.ts which are also added on demand,
// keeping every commit small and verifiable.

import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { getAllUserBindings } from './services';

// ─── Single QueryClient ─────────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:      10_000,
      refetchInterval: 15_000,
      retry: 1,
    },
  },
});

// ─── Query-key factory (single source of truth, prevents typo drift) ────────

export const qk = {
  user:     (addr: string)     => ['user',     addr.toLowerCase()] as const,
  merchant: (addr: string)     => ['merchant', addr.toLowerCase()] as const,
  admin:    ()                 => ['admin']                       as const,
  products: ()                 => ['products']                    as const,
  bindings: (addr: string)     => ['bindings', addr.toLowerCase()] as const,
  proofs:   (filters: unknown) => ['proofs', filters]             as const,
} as const;

// ─── Hooks (subset for Phase 5; rest added per panel in Phase 6) ────────────

export function useBindings(addr: Hex) {
  return useQuery({
    queryKey: qk.bindings(addr),
    queryFn:  () => getAllUserBindings(addr),
  });
}

// ─── Helper: invalidate-after-write ─────────────────────────────────────────

/**
 * Returns a fn that invalidates an array of query keys. Used by panel write
 * handlers to make UI reflect on-chain state within 1s (instead of waiting up
 * to refetchInterval).
 */
export function useInvalidateAfterTx() {
  const qc = useQueryClient();
  return (keys: ReadonlyArray<readonly unknown[]>) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k as any }));
  };
}
