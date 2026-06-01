"use client";
import type { Address, Hex } from 'viem';
import { useWallet } from '@/hooks/useWallet';
import { usePayeeInfoQuery } from '@/hooks/queries/usePayeeInfoQuery';
import type { PayeeInfoResponse } from '@/api/endpoints';

export type PayeeInfoRole = 'payee' | 'payer';
export type { PayeeInfoResponse };

export interface UsePayeeInfoArgs {
    role:      PayeeInfoRole;
    merchant:  Address;
    productId: bigint;
    /** Required for role='payee'. role='payer' is FIAT-only and ignores it. */
    assetType: 0 | 1;
    orderId:   bigint;
    /** Hook only fetches when enabled is true (e.g. modal open). */
    enabled?:  boolean;
}

export interface UsePayeeInfoReturn {
    info:      PayeeInfoResponse | null;
    isLoading: boolean;
    error:     string | null;
    refetch:   () => void;
}

export function usePayeeInfo(args: UsePayeeInfoArgs): UsePayeeInfoReturn {
    const { address } = useWallet();
    const query = usePayeeInfoQuery({
        address: (address ?? null) as Hex | null,
        role:      args.role,
        merchant:  args.merchant,
        productId: args.productId,
        assetType: args.assetType,
        orderId:   args.orderId,
        enabled:   args.enabled,
    });
    return {
        info:      query.data ?? null,
        isLoading: query.isLoading,
        error:     (query.error as Error | undefined)?.message ?? null,
        refetch:   query.refetch as unknown as () => void,
    };
}
