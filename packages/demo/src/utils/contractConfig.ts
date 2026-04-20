/**
 * Contract addresses and chain configuration.
 * Values are read from Vite environment variables.
 *
 * To configure, create a .env file in packages/demo/:
 *   VITE_C2C_ADMIN_ADDRESS=0x...
 *   VITE_C2C_ESCROW_ADDRESS=0x...
 *   VITE_CHAIN_ID=31337
 */

import type { Hex } from 'viem';
import { hardhat, sepolia } from 'viem/chains';

const env = (import.meta as any).env;

export const contractConfig = {
    c2cAdmin: (env.VITE_C2C_ADMIN_ADDRESS || '') as Hex,
    c2cEscrow: (env.VITE_C2C_ESCROW_ADDRESS || '') as Hex,
};

const chainId = Number(env.VITE_CHAIN_ID || '31337');

export const chain = chainId === 11155111 ? sepolia : hardhat;

export function isContractConfigured(): boolean {
    return contractConfig.c2cAdmin.length > 2 && contractConfig.c2cEscrow.length > 2;
}
