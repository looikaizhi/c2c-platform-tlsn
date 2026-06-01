import { useQuery } from '@tanstack/react-query';
import { priceApi } from '@/api/resources/priceApi';
import { queryKeys } from '@/lib/queryKeys';
import type { CryptoPair, MoneyPair } from '@/lib/assetRegistry';

interface UseRateQueryParams {
    moneyPair: MoneyPair;
    cryptoPair: CryptoPair;
}

export function useRateQuery({ moneyPair, cryptoPair }: UseRateQueryParams) {
    return useQuery<number | null>({
        queryKey: queryKeys.rate(moneyPair, cryptoPair),
        queryFn: () => priceApi.fetchRate(moneyPair, cryptoPair),
        enabled: moneyPair !== 'All',
        staleTime: 5 * 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
    });
}
