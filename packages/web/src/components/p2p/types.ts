import type { Address, Hex } from 'viem';

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
    /** Buyer-side deadline (unix seconds) returned by placeOrder. */
    deadline: bigint;
    /** keccak256("wise" | "alipay") — fixed on-chain via product.platformId. */
    platformId: Hex;
}
