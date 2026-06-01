"use client";
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { bindingApi } from '@/api/resources/bindingApi';
import type { BindingMeResponse, BindingOnchainStatusResponse } from '@/api/endpoints';

export const bindingMeKey = (address: Hex | null, platformId: Hex | null) =>
    ['binding', 'me', address, platformId] as const;

export const bindingOnchainStatusKey = (address: Hex | null, platformId: Hex | null) =>
    ['binding', 'onchain-status', address, platformId] as const;

export function useMyBindingQuery(address: Hex | null, platformId: Hex | null) {
    const enabled = !!address && !!platformId;
    const qc = useQueryClient();

    const [meQuery, statusQuery] = useQueries({
        queries: [
            {
                queryKey: bindingMeKey(address, platformId),
                enabled,
                staleTime: 30_000,
                queryFn: (): Promise<BindingMeResponse> =>
                    bindingApi.getMe(address as Hex, platformId as Hex),
            },
            {
                queryKey: bindingOnchainStatusKey(address, platformId),
                enabled,
                staleTime: 30_000,
                queryFn: (): Promise<BindingOnchainStatusResponse> =>
                    bindingApi.getOnchainStatus(address as Hex, platformId as Hex),
            },
        ],
    });

    return {
        me:        meQuery,
        status:    statusQuery,
        invalidate: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: bindingMeKey(address, platformId) }),
                qc.invalidateQueries({ queryKey: bindingOnchainStatusKey(address, platformId) }),
            ]);
        },
    };
}
