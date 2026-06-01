import type { Hex } from 'viem';
import { apiFetch } from '../http';
import {
    ENDPOINTS,
    type PayeeInfoPayeeRequest,
    type PayeeInfoPayerRequest,
    type PayeeInfoResponse,
} from '../endpoints';
import { signApiRequest } from '@/lib/walletAuthClient';

export const paymentInfoApi = {
    payee: async (address: Hex, body: PayeeInfoPayeeRequest) => {
        const path = ENDPOINTS.paymentInfoPayee;
        const headers = await signApiRequest({ domain: 'user', method: 'POST', path, body, address });
        return apiFetch<PayeeInfoResponse>(path, { method: 'POST', headers, body });
    },

    payer: async (address: Hex, body: PayeeInfoPayerRequest) => {
        const path = ENDPOINTS.paymentInfoPayer;
        const headers = await signApiRequest({ domain: 'user', method: 'POST', path, body, address });
        return apiFetch<PayeeInfoResponse>(path, { method: 'POST', headers, body });
    },
};
