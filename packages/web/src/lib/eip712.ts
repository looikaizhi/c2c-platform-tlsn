/**
 * EIP-712 typed data signing for C2CEscrow orders.
 * Merchants sign order quotes off-chain; buyers submit signed orders on-chain.
 */

import {
    type Hex,
    type Address,
    type WalletClient,
    type Transport,
    type Chain,
    type Account,
} from 'viem';
import { contractConfig, chain } from './contractConfig';

export enum AssetType {
    CRYPTO = 0,
    FIAT = 1,
}

export enum OrderStatus {
    PENDING = 0,
    CANCELLED = 1,
    EXPIRED = 2,
    COMPLETED = 3,
    WAITING = 4,
}

export interface SignedOrderInput {
    merchant: Address;
    buyer: Address;
    productID: bigint;
    assetType: AssetType;
    amount: bigint;
    rate: bigint;
    salt: bigint;
    deadline: bigint;
}

const EIP712_DOMAIN = {
    name: 'C2CEscrow',
    version: '1',
} as const;

const SIGNED_ORDER_TYPES = {
    SignedOrder: [
        { name: 'merchant', type: 'address' },
        { name: 'buyer', type: 'address' },
        { name: 'productID', type: 'uint256' },
        { name: 'assetType', type: 'uint8' },
        { name: 'amount', type: 'uint256' },
        { name: 'rate', type: 'uint256' },
        { name: 'salt', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
    ],
} as const;

function getDomain(chainId?: number) {
    return {
        ...EIP712_DOMAIN,
        chainId: chainId ?? chain.id,
        verifyingContract: contractConfig.c2cEscrow,
    };
}

/**
 * Merchant signs an order quote using EIP-712.
 */
export async function signOrder(
    walletClient: WalletClient<Transport, Chain, Account>,
    order: SignedOrderInput,
    chainId?: number,
): Promise<Hex> {
    const signature = await walletClient.signTypedData({
        domain: getDomain(chainId),
        types: SIGNED_ORDER_TYPES,
        primaryType: 'SignedOrder',
        message: {
            merchant: order.merchant,
            buyer: order.buyer,
            productID: order.productID,
            assetType: order.assetType,
            amount: order.amount,
            rate: order.rate,
            salt: order.salt,
            deadline: order.deadline,
        },
    });
    return signature;
}

/**
 * Build the SignedOrder tuple for contract submission.
 */
export function toContractSignedOrder(order: SignedOrderInput) {
    return {
        merchant: order.merchant,
        buyer: order.buyer,
        productID: order.productID,
        assetType: order.assetType,
        amount: order.amount,
        rate: order.rate,
        salt: order.salt,
        deadline: order.deadline,
    };
}
