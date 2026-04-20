import type { Address } from 'viem';

export interface SelectedOrderInfo {
    dbOrderId: number;
    merchant: Address;
    productId: bigint;
    minAmount: number;
    maxAmount: number;
}

export interface PlaceOrderSuccessResult {
    orderId: bigint;
    fiatAmount: number;
}

export type PaymentStep = 'select-method' | 'payment-detail' | 'verify' | 'lock-crypto' | 'waiting-merchant';
