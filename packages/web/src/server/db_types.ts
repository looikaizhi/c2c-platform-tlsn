export interface UserDashboard {
    order_id: number;
    contract_address: string;
    fiat_asset_name: string;
    crypto_asset_name: string;
    fiat_to_crypto: 0 | 1;
    order_create_time: string;
    bank_currency: string;
    bank_name: string;
    account_number_hash: string;
    account_last4: string;
}

export interface UserDashboardRequest {
    wallet_address: string;
}

export interface OrderList{
    order_id: number;
    fiat_asset_name: string;
    crypto_asset_name: string;
    wallet_address: string;
    success_rate: number;
    trading_volume: number;
    user_level: 0 | 1 | 2 | 3 | 4 | 5;
    min_order_amount: number;
    max_order_amount: number;
    supported_methods: string;
}

export interface OrderListRequest{
    wallet_address: string;
    fiat_to_crypto: 0 | 1;
    fiat_asset_name: string;
    crypto_asset_name: string;
}

export interface OrderPayment{
    method_name: string;
    account_holder_name: string;
    account_last4: string;
    currency: string;
    account_number_hash: string;
    icon_url: string | null;
    url: string | null
}

export interface OrderPaymentRequest{
    order_id: number;
}

export interface OrderDetail {
    order_id: number;
    wallet_address: string;
    contract_address: string;
    fiat_to_crypto: 0 | 1;
    fiat_asset_name: string;
    crypto_asset_name: string;
    create_time: string;
    user_level: 0 | 1 | 2 | 3 | 4 | 5;
    close_rate: number;
    trading_volume: number;
    minimum_amount: number;
    maximum_amount: number;
}

export interface OrderDetailRequest {
    order_id: number;
}

// ── Admin Console ─────────────────────────────────────────────────────────

export interface SupportCryptoAsset {
    id: number;
    crypto_id: number;
    token_symbol: string;
    token_address: string;
    is_active: boolean;
    edit_time: string;
    created_time: string;
}

export interface SupportFiatAsset {
    id: number;
    fiat_id: number;
    fiat_name: string;
    is_active: boolean;
    edit_time: string;
    created_time: string;
}

export interface SyncCryptoRequest {
    crypto_id: number;
    token_symbol: string;
    token_address: string;
    is_active: boolean;
}

export interface SyncFiatRequest {
    fiat_id: number;
    fiat_name: string;
    is_active: boolean;
}

export interface UpdateAssetStatusRequest {
    is_active: boolean;
}
