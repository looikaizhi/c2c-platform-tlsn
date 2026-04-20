import { useQuery } from '@tanstack/react-query';
import { fetchOrderList } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import type { OrderList } from '@/server/db_types';

interface UseOrderListQueryParams {
    walletAddress: string;
    isBuy: boolean;
    moneyPair: MoneyPair;
    cryptoPair: CryptoPair;
}

export function useOrderListQuery({
    walletAddress,
    isBuy,
    moneyPair,
    cryptoPair,
}: UseOrderListQueryParams) {
    return useQuery<OrderList[]>({
        queryKey: queryKeys.orderList({ walletAddress, isBuy, moneyPair, cryptoPair }),
        queryFn: async () => {
            const data = await fetchOrderList({
                wallet_address: walletAddress,
                fiat_to_crypto: isBuy ? 1 : 0,
                fiat_asset_name: moneyPair,
                crypto_asset_name: cryptoPair,
            });
            return data ?? [];
        },
        enabled: Boolean(walletAddress),
        staleTime: 30 * 1000,
    });
}
