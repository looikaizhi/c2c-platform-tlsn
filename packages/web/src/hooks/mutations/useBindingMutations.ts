"use client";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { bindingApi } from '@/api/resources/bindingApi';
import type { BindingRegisterRequest } from '@/api/endpoints';
import { bindingMeKey, bindingOnchainStatusKey } from '@/hooks/queries/useMyBindingQuery';

export function useBindingMutations(address: Hex | null) {
    const qc = useQueryClient();

    return {
        register: useMutation({
            mutationFn: (body: BindingRegisterRequest) => {
                if (!address) throw new Error('Wallet not connected');
                return bindingApi.register(address, body);
            },
            onSuccess: async (_data, vars) => {
                await Promise.all([
                    qc.invalidateQueries({ queryKey: bindingMeKey(address, vars.platformId) }),
                    qc.invalidateQueries({ queryKey: bindingOnchainStatusKey(address, vars.platformId) }),
                ]);
            },
        }),
    };
}
