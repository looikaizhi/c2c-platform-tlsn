/**
 * Display formatters. Centralised here so `truncateAddr` etc. don't get
 * reimplemented per component. Pure functions — safe in client & server.
 */
import type { Hex } from 'viem';

/** `0x1234…abcd` for any 0x-prefixed string ≥ 10 chars; passthrough otherwise. */
export function truncateAddr(addr: string | null | undefined): string {
    if (!addr || addr.length < 10) return addr ?? '';
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Same shape as `truncateAddr` but with a different default — middle of a 32-byte hash. */
export function shortHash(hash: Hex | string | null | undefined): string {
    if (!hash || hash.length < 14) return hash ?? '';
    return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/** On-chain rate uses RATE_PRECISION_EXP = 8 — convert to 4-decimal string. */
export function formatOnChainRate(rate: bigint): string {
    return (Number(rate) / 1e8).toFixed(4);
}

/** Format an on-chain token amount given its decimals; 2 decimal places. */
export function formatAvailableAmount(amount: bigint, decimals: number): string {
    return (Number(amount) / 10 ** decimals).toFixed(2);
}

/** Format a token amount with arbitrary decimal display count. */
export function formatTokenAmount(amount: bigint, decimals: number, displayDecimals = 4): string {
    return (Number(amount) / 10 ** decimals).toFixed(displayDecimals);
}
