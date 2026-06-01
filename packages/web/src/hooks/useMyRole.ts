"use client";
import type { Hex } from 'viem';
import { useMyRoleQuery } from '@/hooks/queries/useMyRoleQuery';

export type UserRole = 'buyer' | 'merchant' | 'both';

export interface UseMyRoleReturn {
    role:       UserRole | null;
    grantedAt:  number | null;
    isMerchant: boolean;
    isLoading:  boolean;
    error:      string | null;
    refetch:    () => void;
}

export function useMyRole(wallet: Hex | null): UseMyRoleReturn {
    const query = useMyRoleQuery(wallet);
    const role = (query.data?.role as UserRole | null) ?? null;
    return {
        role,
        grantedAt:  query.data?.grantedAt ?? null,
        isMerchant: role === 'merchant' || role === 'both',
        isLoading:  query.isLoading,
        error:      (query.error as Error | undefined)?.message ?? null,
        refetch:    query.refetch as unknown as () => void,
    };
}
