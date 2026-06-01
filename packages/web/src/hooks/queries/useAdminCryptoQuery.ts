"use client";
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/resources/adminApi';
import type { SupportCryptoAsset } from '@/api/endpoints';

export const ADMIN_CRYPTO_KEY = ['admin', 'crypto'] as const;

export function useAdminCryptoQuery() {
    return useQuery<SupportCryptoAsset[]>({
        queryKey: ADMIN_CRYPTO_KEY,
        queryFn:  () => adminApi.listCrypto(),
        staleTime: 30_000,
    });
}
