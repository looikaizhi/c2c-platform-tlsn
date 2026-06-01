/**
 * Path constants + request/response types for internal Next.js API routes.
 * The request/response shapes live alongside the path so callers can import
 * one symbol and get the full contract.
 *
 * External APIs (CoinGecko, verifier WS/HTTP) live elsewhere — not here.
 */
import type { Address, Hex } from 'viem';
import type {
    OrderDetail,
    OrderList,
    OrderListRequest,
    OrderPayment,
    OrderPaymentRequest,
    SupportCryptoAsset,
    SupportFiatAsset,
    SyncCryptoRequest,
    SyncFiatRequest,
    UpdateAssetStatusRequest,
} from '@/server/db_types';

export const ENDPOINTS = {
    // ── Admin ─────────────────────────────────────────────────────────────
    adminCryptoList:        '/api/admin/crypto',
    adminCryptoById:        (id: number) => `/api/admin/crypto/${id}`,
    adminFiatList:          '/api/admin/fiat',
    adminFiatById:          (id: number) => `/api/admin/fiat/${id}`,
    adminMerchant:          '/api/admin/merchant',
    adminRoleGrant:         '/api/admin/role/grant',
    adminRoleRevoke:        '/api/admin/role/revoke',
    // ── Binding ───────────────────────────────────────────────────────────
    bindingMe:              (platformId: Hex) => `/api/binding/me?platformId=${platformId}`,
    bindingOnchainStatus:   (platformId: Hex) => `/api/binding/onchain-status?platformId=${platformId}`,
    bindingRegister:        '/api/binding/register',
    bindingRevoke:          '/api/binding/revoke',
    // ── Order (legacy MySQL-backed) ──────────────────────────────────────
    orderList:              '/api/order/allOrder',
    orderPayment:           '/api/order/orderPayment',
    orderDetail:            (orderId: string) => `/api/order/detail?orderId=${encodeURIComponent(orderId)}`,
    // ── Payment Info ─────────────────────────────────────────────────────
    paymentInfoPayee:       '/api/payment-info/payee',
    paymentInfoPayer:       '/api/payment-info/payer',
    paymentInfoVerify:      '/api/payment-info/verify-counterparty',
    // ── Price ────────────────────────────────────────────────────────────
    price:                  (money: string, crypto: string) => `/api/price?money=${money}&crypto=${crypto}`,
    // ── User ─────────────────────────────────────────────────────────────
    userRole:               (wallet: string) => `/api/user/role?wallet=${wallet}`,
} as const;

// ── Binding ──────────────────────────────────────────────────────────────────
export interface BindingDbRow {
    id:              number;
    platformId:      Hex;
    plaintextName:   string;
    plaintextHandle: string;
    nameCommit:      Hex;
    idCommit:        Hex;
    createdAt:       number;
}
export interface BindingMeResponse { binding: BindingDbRow | null; }

export interface OnchainBinding { nameHash: Hex; idHash: Hex; isSet: boolean; }
export interface BindingOnchainStatusResponse {
    inSync:  boolean;
    db:      { nameCommit: Hex; idCommit: Hex } | null;
    onchain: OnchainBinding;
}

export interface BindingRegisterRequest {
    platformId: Hex;
    name:       string;
    handle:     string;
}
export interface BindingRegisterResponse {
    bindingId:    number;
    supersededId: number | null;
    nameCommit:   Hex;
    idCommit:     Hex;
}

// ── Payment Info ─────────────────────────────────────────────────────────────
export type PayeeInfoRole = 'payee' | 'payer';

export interface PayeeInfoBaseRequest {
    merchant:  Address;
    productId: string;
    orderId:   string;
}
export interface PayeeInfoPayeeRequest extends PayeeInfoBaseRequest {
    assetType: 0 | 1;
}
export type PayeeInfoPayerRequest = PayeeInfoBaseRequest;

export interface PayeeInfoResponse {
    plaintextName:   string;
    plaintextHandle: string;
    platformId:      Hex;
    bindingStatus:   'active' | 'superseded';
    anchor:          { nameHash: Hex; idHash: Hex };
}

// ── User Role ────────────────────────────────────────────────────────────────
export interface UserRoleResponse {
    wallet:    string;
    role:      'buyer' | 'merchant' | 'both' | null;
    grantedAt: number | null;
}

// ── Admin: Merchant register ─────────────────────────────────────────────────
export interface AdminMerchantRegisterRequest { merchant: Address; }

// ── Price ────────────────────────────────────────────────────────────────────
export interface PriceResponse { rate: number | null; }

// Re-exports for convenience
export type {
    OrderDetail,
    OrderList,
    OrderListRequest,
    OrderPayment,
    OrderPaymentRequest,
    SupportCryptoAsset,
    SupportFiatAsset,
    SyncCryptoRequest,
    SyncFiatRequest,
    UpdateAssetStatusRequest,
};
