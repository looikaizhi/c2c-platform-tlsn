"use client";
import type { Address, Hex } from 'viem';
import { runWrite } from '@/chain/txRunner.client';
import { NETWORK_REGISTRY } from '@/chain/networkRegistry';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import type { ContractTLSNProof } from '@/proofs/transformer';

function adminAddress(chainId: number): Hex {
    const net = NETWORK_REGISTRY[chainId];
    if (!net) throw new Error(`Unknown chainId ${chainId}`);
    return net.contracts.c2cAdmin;
}

// ── Asset registry ──────────────────────────────────────────────────────────
export const addCryptoInfo = (chainId: number, tokenAddress: Hex, isActive: boolean) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'addCryptoInfo',
        args:         [tokenAddress, isActive] as const,
    });

export const addFiatInfo = (chainId: number, fiatName: string, isActive: boolean) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'addFiatInfo',
        args:         [fiatName, isActive] as const,
    });

export const activateAsset = (chainId: number, assetId: bigint, assetType: 0 | 1) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'activateAsset',
        args:         [assetId, assetType] as const,
    });

export const deactivateAsset = (chainId: number, assetId: bigint, assetType: 0 | 1) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'deactivateAsset',
        args:         [assetId, assetType] as const,
    });

// ── Access control / governance ─────────────────────────────────────────────
export const registerMerchantByAdmin = (chainId: number, merchant: Address) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'registerMerchantByAdmin',
        args:         [merchant] as const,
    });

export const setMaxOrderAmount = (chainId: number, newAmount: bigint) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'setMaxOrderAmount',
        args:         [newAmount] as const,
    });

export const setAuthorizedCaller = (chainId: number, caller: Hex, granted: boolean) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'setAuthorizedCaller',
        args:         [caller, granted] as const,
    });

export const proposeAdminTransfer = (chainId: number, newAdmin: Hex) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'proposeAdminTransfer',
        args:         [newAdmin] as const,
    });

export const acceptAdmin = (chainId: number) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'acceptAdmin',
        args:         [] as const,
    });

// ── Merchant operations (still gated by Admin contract) ─────────────────────
export const setMerchantFiatAccount = (chainId: number, account: string) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'setMerchantFiatAccount',
        args:         [account] as const,
    });

export const setPlatformBinding = (
    chainId: number,
    platformId: Hex,
    nameHash:   Hex,
    idHash:     Hex,
) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'setPlatformBinding',
        args:         [platformId, nameHash, idHash] as const,
    });

export const publishRate = (
    chainId: number,
    productId: bigint,
    assetType: number,
    rate:      bigint,
    expiresAt: bigint,
) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'publishRate',
        args:         [productId, assetType, rate, expiresAt] as const,
    });

export const setBusinessHours = (
    chainId: number,
    productId:   bigint,
    assetType:   number,
    openSecond:  number,
    closeSecond: number,
    activeDays:  number,
) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'setBusinessHours',
        args:         [productId, assetType, openSecond, closeSecond, activeDays] as const,
    });

export const openNow = (chainId: number, productId: bigint, assetType: number) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'openNow',
        args:         [productId, assetType] as const,
    });

export const closeNow = (chainId: number, productId: bigint, assetType: number) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'closeNow',
        args:         [productId, assetType] as const,
    });

export const clearManualOverride = (chainId: number, productId: bigint, assetType: number) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'clearManualOverride',
        args:         [productId, assetType] as const,
    });

// ── Merchant self-registration (TLSN proof) ─────────────────────────────────
export const registerMerchant = (chainId: number, proof: ContractTLSNProof) =>
    runWrite({
        chainId,
        address:      adminAddress(chainId),
        abi:          C2C_ADMIN_ABI,
        functionName: 'registerMerchant',
        args:         [proof] as const,
    });
