import { useQuery } from '@tanstack/react-query';
import { fetchUsersDashboard } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import type { UserDashboard } from '@/server/db_types';

export function useDashboardQuery(walletAddress: string) {
    return useQuery<UserDashboard[]>({
        queryKey: queryKeys.dashboard(walletAddress),
        queryFn: async () => {
            const data = await fetchUsersDashboard({ wallet_address: walletAddress });
            return data ?? [];
        },
        enabled: Boolean(walletAddress),
        staleTime: 30 * 1000,
    });
}
