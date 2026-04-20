import { useQuery } from '@tanstack/react-query';
import { fetchRate } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';

interface UseRateQueryParams {
    moneyPair: MoneyPair;
    cryptoPair: CryptoPair;
}

export function useRateQuery({ moneyPair, cryptoPair }: UseRateQueryParams) {
    return useQuery<number | null>({
        queryKey: queryKeys.rate(moneyPair, cryptoPair),
        queryFn: () => fetchRate(moneyPair, cryptoPair),
        staleTime: 5 * 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
    });
}
