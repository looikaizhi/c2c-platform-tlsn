import type { Hex } from 'viem';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex;
const ZERO_HASH_32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

function asBigInt(value: unknown, fallback: bigint = 0n): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asHex(value: unknown, fallback: Hex): Hex {
  if (typeof value === 'string' && value.startsWith('0x')) return value as Hex;
  return fallback;
}

export interface OrderView {
  buyer: Hex;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
  platformTxId: Hex;
  // V4 fields
  bondAmount: bigint;
  bondBpsSnapshot: number;
}

type RawOrder = Partial<{
  buyer: Hex;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
  platformTxId: Hex;
  bondAmount: bigint;
  bondBpsSnapshot: number;
}> & unknown[];

/**
 * Normalize getOrder() response from viem.
 * Some viem versions return tuple arrays without named fields.
 */
export function normalizeOrder(rawOrder: unknown): OrderView {
  const raw = (rawOrder ?? []) as RawOrder;

  return {
    buyer:           asHex(raw.buyer           ?? raw[0], ZERO_ADDRESS),
    amount:          asBigInt(raw.amount        ?? raw[1]),
    rate:            asBigInt(raw.rate          ?? raw[2]),
    deadline:        asBigInt(raw.deadline      ?? raw[3]),
    status:          asNumber(raw.status        ?? raw[4]),
    rateVersion:     asNumber(raw.rateVersion   ?? raw[5]),
    platformTxId:    asHex(raw.platformTxId    ?? raw[6], ZERO_HASH_32),
    bondAmount:      asBigInt(raw.bondAmount    ?? raw[7]),
    bondBpsSnapshot: asNumber(raw.bondBpsSnapshot ?? raw[8]),
  };
}

