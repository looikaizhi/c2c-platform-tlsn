"use client";
import type { Hex } from 'viem';
import { useWallet } from '@/hooks/useWallet';
import { useMyBindingQuery } from '@/hooks/queries/useMyBindingQuery';
import type {
    BindingDbRow,
    OnchainBinding,
} from '@/api/endpoints';

export type { BindingDbRow, OnchainBinding };

export interface UseMyBindingReturn {
    binding:   BindingDbRow | null;
    onchain:   OnchainBinding | null;
    inSync:    boolean;
    isLoading: boolean;
    error:     string | null;
    refetch:   () => Promise<void>;
}

export function useMyBinding(platformId: Hex | null): UseMyBindingReturn {
    const { address } = useWallet();
    const { me, status, invalidate } = useMyBindingQuery(address, platformId);

    return {
        binding:   me.data?.binding ?? null,
        onchain:   status.data?.onchain ?? null,
        inSync:    status.data?.inSync ?? false,
        isLoading: me.isLoading || status.isLoading,
        error:
            (me.error as Error | undefined)?.message ??
            (status.error as Error | undefined)?.message ??
            null,
        refetch: invalidate,
    };
}
