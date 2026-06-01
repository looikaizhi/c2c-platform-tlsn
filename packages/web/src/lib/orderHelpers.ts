/**
 * Order helper utilities for the C2C platform.
 */

import { AssetType, OrderStatus } from './eip712';

export { AssetType, OrderStatus };

/** Generate a random uint256 salt for replay protection. */
export function generateSalt(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return BigInt(`0x${hex}`);
}

/** Calculate deadline as current timestamp + minutes. */
export function calculateDeadline(minutes = 15): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}

/** Format token amount with decimals (default 18 for ERC-20). */
export function toTokenAmount(amount: number, decimals = 18): bigint {
    return BigInt(Math.round(amount * 10 ** decimals));
}

/** Format rate with 18 decimals (fiat price per token). */
export function toRate(rate: number): bigint {
    return BigInt(Math.round(rate * 1e18));
}

/** Convert on-chain rate (18 decimals) back to number. */
export function fromRate(rate: bigint): number {
    return Number(rate) / 1e18;
}

/** Convert on-chain token amount back to number. */
export function fromTokenAmount(amount: bigint, decimals = 18): number {
    return Number(amount) / 10 ** decimals;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'Pending',
    [OrderStatus.EXPIRED]: 'Expired',
    [OrderStatus.COMPLETED]: 'Completed',
    [OrderStatus.WAITING]: 'Awaiting confirmation',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
    [AssetType.CRYPTO]: 'Crypto',
    [AssetType.FIAT]: 'Fiat',
};
