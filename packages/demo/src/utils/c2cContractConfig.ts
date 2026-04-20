// packages/demo/src/utils/c2cContractConfig.ts
// Reads contract addresses from Vite env vars written by deployDemoState.ts.

import type { Hex } from 'viem';

const env = (import.meta as any).env as Record<string, string>;

function addr(key: string): Hex {
  return (env[key] || '') as Hex;
}

export const c2cConfig = {
  // Core contracts
  adminAddress:          addr('VITE_C2C_ADMIN_ADDRESS'),
  escrowAddress:         addr('VITE_C2C_ESCROW_ADDRESS'),
  verifierSignerAddress: addr('VITE_VERIFIER_SIGNER_ADDRESS'),

  // Token addresses
  usdtAddress: addr('VITE_USDT_ADDRESS'),
  usdcAddress: addr('VITE_USDC_ADDRESS'),
  daiAddress:  addr('VITE_DAI_ADDRESS'),

  // Merchant addresses
  merchant1Address: addr('VITE_MERCHANT1_ADDRESS'),
  merchant2Address: addr('VITE_MERCHANT2_ADDRESS'),
  merchant3Address: addr('VITE_MERCHANT3_ADDRESS'),

  // User addresses
  user1Address: addr('VITE_USER1_ADDRESS'),
  user2Address: addr('VITE_USER2_ADDRESS'),
  user3Address: addr('VITE_USER3_ADDRESS'),
  user4Address: addr('VITE_USER4_ADDRESS'),
  user5Address: addr('VITE_USER5_ADDRESS'),

  // Legacy single-merchant / single-buyer aliases (backward compat)
  merchantAddress: addr('VITE_MERCHANT1_ADDRESS') || addr('VITE_MERCHANT_ADDRESS'),
  buyerAddress:    addr('VITE_USER1_ADDRESS')     || addr('VITE_BUYER_ADDRESS'),
  usdtAddressLegacy: addr('VITE_USDT_ADDRESS'),
};

export function isC2CConfigured(): boolean {
  return c2cConfig.adminAddress.length > 2 && c2cConfig.escrowAddress.length > 2;
}
