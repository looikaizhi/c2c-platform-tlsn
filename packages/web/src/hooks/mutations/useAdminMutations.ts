"use client";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import { adminApi } from '@/api/resources/adminApi';
import type {
    SyncCryptoRequest,
    SyncFiatRequest,
    UpdateAssetStatusRequest,
} from '@/api/endpoints';
import { ADMIN_CRYPTO_KEY } from '@/hooks/queries/useAdminCryptoQuery';
import { ADMIN_FIAT_KEY } from '@/hooks/queries/useAdminFiatQuery';

export function useAdminMutations() {
    const qc = useQueryClient();
    const invalidateCrypto = () => qc.invalidateQueries({ queryKey: ADMIN_CRYPTO_KEY });
    const invalidateFiat   = () => qc.invalidateQueries({ queryKey: ADMIN_FIAT_KEY });

    return {
        addCrypto: useMutation({
            mutationFn: (body: SyncCryptoRequest) => adminApi.addCrypto(body),
            onSuccess:  invalidateCrypto,
        }),
        addFiat: useMutation({
            mutationFn: (body: SyncFiatRequest) => adminApi.addFiat(body),
            onSuccess:  invalidateFiat,
        }),
        toggleCrypto: useMutation({
            mutationFn: ({ id, body }: { id: number; body: UpdateAssetStatusRequest }) =>
                adminApi.toggleCrypto(id, body),
            onSuccess: invalidateCrypto,
        }),
        toggleFiat: useMutation({
            mutationFn: ({ id, body }: { id: number; body: UpdateAssetStatusRequest }) =>
                adminApi.toggleFiat(id, body),
            onSuccess: invalidateFiat,
        }),
        registerMerchant: useMutation({
            mutationFn: (merchant: Address) => adminApi.registerMerchant(merchant),
        }),
    };
}
