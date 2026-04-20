import { useQuery } from '@tanstack/react-query';
import { fetchOrderPayment } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import type { OrderPayment } from '@/server/db_types';

export function useOrderPaymentQuery(orderId: number) {
    return useQuery<OrderPayment[]>({
        queryKey: queryKeys.orderPayment(orderId),
        queryFn: async () => {
            const data = await fetchOrderPayment({ order_id: orderId });
            return data ?? [];
        },
        enabled: Number.isFinite(orderId) && orderId > 0,
        staleTime: 60 * 1000,
    });
}
