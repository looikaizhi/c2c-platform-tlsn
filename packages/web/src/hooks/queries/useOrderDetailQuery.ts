import { useQuery } from '@tanstack/react-query';
import { orderApi } from '@/api/resources/orderApi';
import { queryKeys } from '@/lib/queryKeys';
import type { OrderDetail } from '@/server/db_types';

export function useOrderDetailQuery(orderId: string) {
    return useQuery<OrderDetail | null>({
        queryKey: queryKeys.orderDetail(orderId),
        queryFn: async () => {
            const data = await orderApi.detail(orderId);
            return data ?? null;
        },
        enabled: Boolean(orderId),
        staleTime: 30 * 1000,
    });
}
