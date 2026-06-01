"use client";
import { useCallback } from 'react';
import type { Hex, Address } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { getPublicClient as chainGetPublicClient } from '@/chain/clients';
import { useNetwork } from '@/contexts/NetworkContext';
import { useImperativeTx } from '@/hooks/core/useImperativeTx';
import * as escrow from '@/chain/writers/escrowWriter';
import * as admin  from '@/chain/writers/adminWriter';

export type ProductStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface SupportedCrypto {
    id:           bigint;
    tokenSymbol:  string;
    tokenAddress: Address;
    isActive:     boolean;
}

export interface SupportedFiat {
    id:       bigint;
    fiatName: string;
    isActive: boolean;
}

export interface MerchantInfo {
    isActive:         boolean;
    kybVerified:      boolean;
    registeredAt:     bigint;
    sellCryptoAmount: bigint;
    sellFiatAmount:   bigint;
}

export interface UseProductsReturn {
    status: ProductStatus;
    txHash: Hex | null;
    error:  string | null;
    listCryptoProduct: (cryptoId: bigint, fiatId: bigint, amount: bigint, isActive: boolean, platformId: Hex) => Promise<void>;
    listFiatProduct:   (fiatId: bigint, cryptoId: bigint, amount: bigint, isActive: boolean, platformId: Hex) => Promise<void>;
    activateProduct:   (id: bigint, assetType: number) => Promise<void>;
    deactivateProduct: (id: bigint, assetType: number) => Promise<void>;
    addCollateral:     (id: bigint, assetType: number, amount: bigint) => Promise<void>;
    withdrawCollateral:(id: bigint, assetType: number, amount: bigint) => Promise<void>;
    setFiatAccount:    (account: string) => Promise<void>;
    publishRate:       (productId: bigint, assetType: number, rate: bigint, expiresAt: bigint) => Promise<void>;
    setBusinessHours:  (productId: bigint, assetType: number, openSecond: number, closeSecond: number, activeDays: number) => Promise<void>;
    openNow:           (productId: bigint, assetType: number) => Promise<void>;
    closeNow:          (productId: bigint, assetType: number) => Promise<void>;
    clearManualOverride:        (productId: bigint, assetType: number) => Promise<void>;
    setPaymentInfoForPlatform:  (platformId: Hex, nameHash: Hex, idHash: Hex) => Promise<void>;
    fetchMerchantInfo:     (address: Address) => Promise<MerchantInfo | null>;
    fetchSupportedCryptos: () => Promise<SupportedCrypto[]>;
    fetchSupportedFiats:   () => Promise<SupportedFiat[]>;
    reset:                 () => void;
}

export function useProducts(): UseProductsReturn {
    const { network } = useNetwork();
    const tx = useImperativeTx();

    const status: ProductStatus =
        tx.status === 'pending' ? 'submitting' : tx.status;

    const runTx = useCallback(async (fn: () => Promise<{ hash: Hex }>) => {
        await tx.run(async () => {
            const { hash } = await fn();
            tx.setHash(hash);
        });
    }, [tx]);

    const listCryptoProduct = useCallback(
        async (cryptoId: bigint, fiatId: bigint, amount: bigint, isActive: boolean, platformId: Hex) => {
            await runTx(() => escrow.listCryptoProduct(network.chainId, { cryptoId, fiatId, amount, isActive, platformId }));
        },
    [network.chainId, runTx]);

    const listFiatProduct = useCallback(
        async (fiatId: bigint, cryptoId: bigint, amount: bigint, isActive: boolean, platformId: Hex) => {
            await runTx(() => escrow.listFiatProduct(network.chainId, { fiatId, cryptoId, amount, isActive, platformId }));
        },
    [network.chainId, runTx]);

    const activateProduct    = useCallback(async (id: bigint, t: number) => { await runTx(() => escrow.activeProduct(network.chainId, id, t)); },   [network.chainId, runTx]);
    const deactivateProduct  = useCallback(async (id: bigint, t: number) => { await runTx(() => escrow.inactiveProduct(network.chainId, id, t)); }, [network.chainId, runTx]);
    const addCollateral      = useCallback(async (id: bigint, t: number, amount: bigint) => { await runTx(() => escrow.addAmount(network.chainId, id, t, amount)); },  [network.chainId, runTx]);
    const withdrawCollateral = useCallback(async (id: bigint, t: number, amount: bigint) => { await runTx(() => escrow.takeAmount(network.chainId, id, t, amount)); }, [network.chainId, runTx]);

    const setFiatAccount     = useCallback(async (account: string) => { await runTx(() => admin.setMerchantFiatAccount(network.chainId, account)); }, [network.chainId, runTx]);
    const publishRate        = useCallback(
        async (pid: bigint, t: number, rate: bigint, exp: bigint) => { await runTx(() => admin.publishRate(network.chainId, pid, t, rate, exp)); },
    [network.chainId, runTx]);
    const setBusinessHours   = useCallback(
        async (pid: bigint, t: number, o: number, c: number, days: number) => {
            await runTx(() => admin.setBusinessHours(network.chainId, pid, t, o, c, days));
        },
    [network.chainId, runTx]);
    const openNow              = useCallback(async (pid: bigint, t: number) => { await runTx(() => admin.openNow(network.chainId, pid, t)); },  [network.chainId, runTx]);
    const closeNow             = useCallback(async (pid: bigint, t: number) => { await runTx(() => admin.closeNow(network.chainId, pid, t)); }, [network.chainId, runTx]);
    const clearManualOverride  = useCallback(async (pid: bigint, t: number) => { await runTx(() => admin.clearManualOverride(network.chainId, pid, t)); }, [network.chainId, runTx]);
    const setPaymentInfoForPlatform = useCallback(
        async (platformId: Hex, nameHash: Hex, idHash: Hex) => {
            await runTx(() => admin.setPlatformBinding(network.chainId, platformId, nameHash, idHash));
        },
    [network.chainId, runTx]);

    // ── Read paths (no tx state) ──────────────────────────────────────────
    const fetchMerchantInfo = useCallback(async (address: Address, _p?: any): Promise<MerchantInfo | null> => {
        try {
            const client = chainGetPublicClient(network.chainId);
            const result = await client.readContract({
                address:      network.contracts.c2cAdmin,
                abi:          C2C_ADMIN_ABI,
                functionName: 'merchants',
                args:         [address],
            });
            const [isActive, kybVerified, registeredAt, sellCryptoAmount, sellFiatAmount] =
                result as [boolean, boolean, bigint, bigint, bigint];
            return { isActive, kybVerified, registeredAt, sellCryptoAmount, sellFiatAmount };
        } catch {
            return null;
        }
    }, [network]);

    const fetchSupportedCryptos = useCallback(async (_p?: any): Promise<SupportedCrypto[]> => {
        try {
            const client = chainGetPublicClient(network.chainId);
            const result = await client.readContract({
                address:      network.contracts.c2cAdmin,
                abi:          C2C_ADMIN_ABI,
                functionName: 'getSupportCryptoList',
            });
            return (result as any[]).map((c: any) => ({
                id:           c.id,
                tokenSymbol:  c.tokenSymbol,
                tokenAddress: c.tokenAddress,
                isActive:     c.isActive,
            }));
        } catch {
            return [];
        }
    }, [network]);

    const fetchSupportedFiats = useCallback(async (_p?: any): Promise<SupportedFiat[]> => {
        try {
            const client = chainGetPublicClient(network.chainId);
            const result = await client.readContract({
                address:      network.contracts.c2cAdmin,
                abi:          C2C_ADMIN_ABI,
                functionName: 'getSupportFiatList',
            });
            return (result as any[]).map((f: any) => ({
                id:       f.id,
                fiatName: f.fiatName,
                isActive: f.isActive,
            }));
        } catch {
            return [];
        }
    }, [network]);

    return {
        status,
        txHash: tx.txHash,
        error:  tx.error,
        listCryptoProduct,
        listFiatProduct,
        activateProduct,
        deactivateProduct,
        addCollateral,
        withdrawCollateral,
        setFiatAccount,
        publishRate,
        setBusinessHours,
        openNow,
        closeNow,
        clearManualOverride,
        setPaymentInfoForPlatform,
        fetchMerchantInfo,
        fetchSupportedCryptos,
        fetchSupportedFiats,
        reset: tx.reset,
    };
}
