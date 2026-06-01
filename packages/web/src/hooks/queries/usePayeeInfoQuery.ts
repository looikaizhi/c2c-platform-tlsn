"use client";
import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';
import { paymentInfoApi } from '@/api/resources/paymentInfoApi';
import type { PayeeInfoResponse, PayeeInfoRole } from '@/api/endpoints';

export interface UsePayeeInfoQueryArgs {
    address:   Hex | null;
    role:      PayeeInfoRole;
    merchant:  Address;
    productId: bigint;
    /** Required when role === 'payee'; ignored for 'payer'. */
    assetType: 0 | 1;
    orderId:   bigint;
    enabled?:  boolean;
}

export const payeeInfoKey = (a: UsePayeeInfoQueryArgs) => [
    'payee-info',
    a.role,
    a.address?.toLowerCase() ?? null,
    a.merchant.toLowerCase(),
    a.productId.toString(),
    a.assetType,
    a.orderId.toString(),
] as const;

export function usePayeeInfoQuery(a: UsePayeeInfoQueryArgs) {
    const enabled = !!a.enabled && !!a.address && !!a.merchant;
    return useQuery<PayeeInfoResponse>({
        queryKey: payeeInfoKey(a),
        enabled,
        staleTime: 60_000,
        queryFn:  () => {
            if (a.role === 'payee') {
                return paymentInfoApi.payee(a.address as Hex, {
                    merchant:  a.merchant,
                    productId: a.productId.toString(),
                    assetType: a.assetType,
                    orderId:   a.orderId.toString(),
                });
            }
            return paymentInfoApi.payer(a.address as Hex, {
                merchant:  a.merchant,
                productId: a.productId.toString(),
                orderId:   a.orderId.toString(),
            });
        },
    });
}
