"use client";
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/resources/adminApi';
import type { SupportFiatAsset } from '@/api/endpoints';

export const ADMIN_FIAT_KEY = ['admin', 'fiat'] as const;

export function useAdminFiatQuery() {
    return useQuery<SupportFiatAsset[]>({
        queryKey: ADMIN_FIAT_KEY,
        queryFn:  () => adminApi.listFiat(),
        staleTime: 30_000,
    });
}
