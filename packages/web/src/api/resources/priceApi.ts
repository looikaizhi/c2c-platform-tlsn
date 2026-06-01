import { apiFetch } from '../http';
import { ApiError } from '../errors';
import { ENDPOINTS, type PriceResponse } from '../endpoints';

export const priceApi = {
    /** Returns the rate, or null if the upstream returned 4xx/5xx (legacy behavior). */
    fetchRate: async (moneyPair: string, cryptoPair: string): Promise<number | null> => {
        try {
            const data = await apiFetch<PriceResponse>(ENDPOINTS.price(moneyPair, cryptoPair));
            return data.rate ?? null;
        } catch (err) {
            if (err instanceof ApiError) return null;
            throw err;
        }
    },
};
