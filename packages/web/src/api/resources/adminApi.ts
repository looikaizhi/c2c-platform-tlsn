import type { Address, Hex } from 'viem';
import { apiFetch } from '../http';
import {
    ENDPOINTS,
    type SupportCryptoAsset,
    type SupportFiatAsset,
    type SyncCryptoRequest,
    type SyncFiatRequest,
    type UpdateAssetStatusRequest,
    type AdminMerchantRegisterRequest,
} from '../endpoints';
import { signApiRequest } from '@/lib/walletAuthClient';

export const adminApi = {
    listCrypto: () =>
        apiFetch<SupportCryptoAsset[]>(ENDPOINTS.adminCryptoList),

    listFiat: () =>
        apiFetch<SupportFiatAsset[]>(ENDPOINTS.adminFiatList),

    addCrypto: (body: SyncCryptoRequest) =>
        apiFetch<{ ok: true }>(ENDPOINTS.adminCryptoList, { method: 'POST', body }),

    addFiat: (body: SyncFiatRequest) =>
        apiFetch<{ ok: true }>(ENDPOINTS.adminFiatList, { method: 'POST', body }),

    toggleCrypto: (id: number, body: UpdateAssetStatusRequest) =>
        apiFetch<{ ok: true }>(ENDPOINTS.adminCryptoById(id), { method: 'PATCH', body }),

    toggleFiat: (id: number, body: UpdateAssetStatusRequest) =>
        apiFetch<{ ok: true }>(ENDPOINTS.adminFiatById(id), { method: 'PATCH', body }),

    registerMerchant: (merchant: Address) =>
        apiFetch<{ ok: true }>(ENDPOINTS.adminMerchant, {
            method: 'POST',
            body: { merchant } as AdminMerchantRegisterRequest,
        }),

    /**
     * Sync DB `user_profile.role` for a wallet. The on-chain `registerMerchantByAdmin`
     * only updates contract storage; UI reads role via `useMyRole` → DB. Call this
     * after a successful on-chain register so the DB stays in sync.
     *
     * Server-side requires the caller to be the on-chain admin (signed by EOA).
     */
    grantRole: async (
        adminAddress: Hex,
        target: Address,
        role: 'merchant' | 'both',
        notes?: string,
    ) => {
        const path = ENDPOINTS.adminRoleGrant;
        const body = { wallet: target, role, notes };
        const headers = await signApiRequest({
            domain: 'admin',
            method: 'POST',
            path,
            body,
            address: adminAddress,
        });
        return apiFetch<{ ok: true }>(path, { method: 'POST', headers, body });
    },
};
