import type { Hex } from 'viem';
import { apiFetch } from '../http';
import {
    ENDPOINTS,
    type BindingMeResponse,
    type BindingOnchainStatusResponse,
    type BindingRegisterRequest,
    type BindingRegisterResponse,
} from '../endpoints';
import { signApiRequest } from '@/lib/walletAuthClient';

export const bindingApi = {
    getMe: async (address: Hex, platformId: Hex) => {
        const path = ENDPOINTS.bindingMe(platformId);
        const headers = await signApiRequest({ domain: 'user', method: 'GET', path, address });
        return apiFetch<BindingMeResponse>(path, { headers });
    },

    getOnchainStatus: async (address: Hex, platformId: Hex) => {
        const path = ENDPOINTS.bindingOnchainStatus(platformId);
        const headers = await signApiRequest({ domain: 'user', method: 'GET', path, address });
        return apiFetch<BindingOnchainStatusResponse>(path, { headers });
    },

    register: async (address: Hex, body: BindingRegisterRequest) => {
        const path = ENDPOINTS.bindingRegister;
        const headers = await signApiRequest({ domain: 'user', method: 'POST', path, body, address });
        return apiFetch<BindingRegisterResponse>(path, { method: 'POST', headers, body });
    },
};
