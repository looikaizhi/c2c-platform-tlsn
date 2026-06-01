"use client";
import type { Hex } from 'viem';
import { runWrite } from '@/chain/txRunner.client';
import { NETWORK_REGISTRY } from '@/chain/networkRegistry';
import { C2C_BOND_VAULT_ABI } from '@/lib/contractAbi';

function bondVaultAddress(chainId: number): Hex {
    const net = NETWORK_REGISTRY[chainId];
    if (!net) throw new Error(`Unknown chainId ${chainId}`);
    return net.contracts.c2cBondVault;
}

export const claim = (chainId: number, token: Hex) =>
    runWrite({
        chainId,
        address:      bondVaultAddress(chainId),
        abi:          C2C_BOND_VAULT_ABI,
        functionName: 'claim',
        args:         [token] as const,
    });
