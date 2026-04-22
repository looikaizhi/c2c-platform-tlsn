import type { Hex } from 'viem';
import { c2cConfig } from './c2cContractConfig';

/**
 * Canonical demo user list shared by UserPanel and TradingHall.
 * Source of truth is the 5 user addresses written to .env by deployment.
 */
export function getDemoUserAddresses(): Hex[] {
  return [
    c2cConfig.user1Address,
    c2cConfig.user2Address,
    c2cConfig.user3Address,
    c2cConfig.user4Address,
    c2cConfig.user5Address,
  ].filter((a): a is Hex => a.length > 2);
}
