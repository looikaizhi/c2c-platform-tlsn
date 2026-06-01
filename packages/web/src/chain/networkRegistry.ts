import { hardhat, sepolia, arbitrumSepolia, arbitrum, type Chain } from 'viem/chains';
import type { Hex } from 'viem';

export interface ContractAddresses {
    c2cAdmin:       Hex;
    c2cEscrow:      Hex;
    c2cBondVault:   Hex;
    c2cRiskManager: Hex;
    usdtToken:      Hex;
    usdcToken:      Hex;
    daiToken:       Hex;
}

export interface NetworkConfig {
    chainId:        number;
    name:           string;
    chain:          Chain;
    contracts:      ContractAddresses;
    isTestnet:      boolean;
    blockExplorer?: string;
}

export const NETWORK_REGISTRY: Record<number, NetworkConfig> = {
    31337: {
        chainId: 31337,
        name: 'Hardhat Local',
        chain: hardhat,
        isTestnet: true,
        contracts: {
            c2cAdmin:       (process.env.NEXT_PUBLIC_C2C_ADMIN_ADDRESS        || '') as Hex,
            c2cEscrow:      (process.env.NEXT_PUBLIC_C2C_ESCROW_ADDRESS       || '') as Hex,
            c2cBondVault:   (process.env.NEXT_PUBLIC_C2C_BOND_VAULT_ADDRESS   || '') as Hex,
            c2cRiskManager: (process.env.NEXT_PUBLIC_C2C_RISK_MANAGER_ADDRESS || '') as Hex,
            usdtToken:      (process.env.NEXT_PUBLIC_USDT_ADDRESS             || '') as Hex,
            usdcToken:      (process.env.NEXT_PUBLIC_USDC_ADDRESS             || '') as Hex,
            daiToken:       (process.env.NEXT_PUBLIC_DAI_ADDRESS              || '') as Hex,
        },
    },
    11155111: {
        chainId: 11155111,
        name: 'Sepolia',
        chain: sepolia,
        isTestnet: true,
        blockExplorer: 'https://sepolia.etherscan.io',
        contracts: {
            c2cAdmin:       (process.env.NEXT_PUBLIC_SEPOLIA_C2C_ADMIN_ADDRESS        || '') as Hex,
            c2cEscrow:      (process.env.NEXT_PUBLIC_SEPOLIA_C2C_ESCROW_ADDRESS       || '') as Hex,
            c2cBondVault:   (process.env.NEXT_PUBLIC_SEPOLIA_C2C_BOND_VAULT_ADDRESS   || '') as Hex,
            c2cRiskManager: (process.env.NEXT_PUBLIC_SEPOLIA_C2C_RISK_MANAGER_ADDRESS || '') as Hex,
            usdtToken:      '' as Hex,
            usdcToken:      '' as Hex,
            daiToken:       '' as Hex,
        },
    },
    421614: {
        chainId: 421614,
        name: 'Arbitrum Sepolia',
        chain: arbitrumSepolia,
        isTestnet: true,
        blockExplorer: 'https://sepolia.arbiscan.io',
        contracts: {
            c2cAdmin:       (process.env.NEXT_PUBLIC_ARBSEPOLIA_C2C_ADMIN_ADDRESS        || '') as Hex,
            c2cEscrow:      (process.env.NEXT_PUBLIC_ARBSEPOLIA_C2C_ESCROW_ADDRESS       || '') as Hex,
            c2cBondVault:   (process.env.NEXT_PUBLIC_ARBSEPOLIA_C2C_BOND_VAULT_ADDRESS   || '') as Hex,
            c2cRiskManager: (process.env.NEXT_PUBLIC_ARBSEPOLIA_C2C_RISK_MANAGER_ADDRESS || '') as Hex,
            usdtToken:      '' as Hex,
            usdcToken:      '' as Hex,
            daiToken:       '' as Hex,
        },
    },
    42161: {
        chainId: 42161,
        name: 'Arbitrum One',
        chain: arbitrum,
        isTestnet: false,
        blockExplorer: 'https://arbiscan.io',
        contracts: {
            c2cAdmin:       (process.env.NEXT_PUBLIC_ARB_C2C_ADMIN_ADDRESS        || '') as Hex,
            c2cEscrow:      (process.env.NEXT_PUBLIC_ARB_C2C_ESCROW_ADDRESS       || '') as Hex,
            c2cBondVault:   (process.env.NEXT_PUBLIC_ARB_C2C_BOND_VAULT_ADDRESS   || '') as Hex,
            c2cRiskManager: (process.env.NEXT_PUBLIC_ARB_C2C_RISK_MANAGER_ADDRESS || '') as Hex,
            usdtToken:      '' as Hex,
            usdcToken:      '' as Hex,
            daiToken:       '' as Hex,
        },
    },
};

export const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');
export const DEFAULT_NETWORK = NETWORK_REGISTRY[DEFAULT_CHAIN_ID] ?? NETWORK_REGISTRY[31337];

const ETH_RE = /^0x[a-fA-F0-9]{40}$/;

export function isNetworkConfigured(n: NetworkConfig): boolean {
    return ETH_RE.test(n.contracts.c2cAdmin) && ETH_RE.test(n.contracts.c2cEscrow);
}
