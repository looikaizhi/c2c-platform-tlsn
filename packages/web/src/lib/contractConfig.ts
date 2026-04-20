import type { Hex } from 'viem';
import { hardhat, sepolia } from 'viem/chains';

export const contractConfig = {
    c2cAdmin: (process.env.NEXT_PUBLIC_C2C_ADMIN_ADDRESS || '') as Hex,
    c2cEscrow: (process.env.NEXT_PUBLIC_C2C_ESCROW_ADDRESS || '') as Hex,
};

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');

export const chain = chainId === 11155111 ? sepolia : hardhat;

export function isContractConfigured(): boolean {
    return contractConfig.c2cAdmin.length > 2 && contractConfig.c2cEscrow.length > 2;
}
