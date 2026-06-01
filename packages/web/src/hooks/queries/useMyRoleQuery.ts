"use client";
import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { userApi } from '@/api/resources/userApi';
import type { UserRoleResponse } from '@/api/endpoints';

export const myRoleKey = (wallet: Hex | null) =>
    ['user', 'role', wallet?.toLowerCase() ?? null] as const;

export function useMyRoleQuery(wallet: Hex | null) {
    return useQuery<UserRoleResponse>({
        queryKey: myRoleKey(wallet),
        enabled:  !!wallet,
        staleTime: 60_000,
        queryFn:  () => userApi.role(wallet as string),
    });
}
