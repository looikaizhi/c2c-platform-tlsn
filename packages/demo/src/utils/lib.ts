// packages/demo/src/utils/lib.ts
//
// Plain function utilities shared across panels.
//
// Phase 5 scope: minimum needed for upcoming Phase 6 panel refactors —
// truncateAddr / fmt4 / formatUserFacingError / env. Additional helpers
// (fiatEstimate, etc.) are added incrementally by each Phase 6.X commit
// when the consuming panel actually needs them.

import { formatContractAwareError } from './chain';

// ─── Format ─────────────────────────────────────────────────────────────────

/**
 * Truncate a 0x address (or any hex string) to the conventional
 * `0x1234…abcd` form for compact UI display. `front` / `back` adjust the
 * kept prefix/suffix length when the default 6/4 is too short or too long.
 */
export function truncateAddr(addr: string, front = 6, back = 4): string {
  if (!addr) return '';
  if (addr.length <= front + back + 1) return addr;
  return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

/**
 * Format a token balance to exactly 4 fractional digits.
 *
 * `decimals` is the ERC-20 decimals of the token (6 for USDT/USDC, 18 for DAI).
 * No rounding — we slice the fractional part so display matches the raw value.
 */
export function fmt4(balance: bigint, decimals: number): string {
  const denom    = 10n ** BigInt(decimals);
  const whole    = balance / denom;
  const fracStr  = (balance % denom).toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toString()}.${fracStr}`;
}

/**
 * Estimate the fiat equivalent of a USDT amount given an on-chain rate
 * (8-decimal fixed-point). Used by TradingHall product cards and the order
 * preview form. Returns "—" for non-positive inputs.
 */
export function fiatEstimate(
  rate: bigint,
  // `assetType` kept in the signature for caller-side symmetry with on-chain
  // (CRYPTO/FIAT direction); same formula either way.
  _assetType: 0 | 1,
  usdtAmount: number,
  curr: string,
): string {
  if (!usdtAmount || usdtAmount <= 0) return '—';
  const fiat = usdtAmount * (Number(rate) / 1e8);
  return `≈ ${fiat.toFixed(2)} ${curr}`;
}

// ─── Error formatting (single source of truth) ──────────────────────────────

/**
 * Produce a user-facing error message from anything thrown by viem / fetch /
 * application code. Delegates to formatContractAwareError() which knows the
 * demo's custom on-chain error selectors (UntrustedVerifier,
 * OrderBindingHashMismatch, SessionAlreadyUsed, WrongChainId).
 */
export function formatUserFacingError(err: unknown): string {
  return formatContractAwareError(err);
}

// ─── Env reader ─────────────────────────────────────────────────────────────

export const env = (import.meta as any).env as Record<string, string>;
