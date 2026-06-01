/**
 * Shared enums for C2C platform contract types.
 * EIP-712 signing removed in V4 — placeOrder is now called directly by buyer.
 */

export enum AssetType {
    CRYPTO = 0,
    FIAT = 1,
}

export enum OrderStatus {
    PENDING   = 0,
    EXPIRED   = 1,
    COMPLETED = 2,
    WAITING   = 3,
}
