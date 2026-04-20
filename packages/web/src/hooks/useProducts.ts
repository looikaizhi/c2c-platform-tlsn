"use client";
import { useCallback, useState } from 'react';
import type { Hex, Address } from 'viem';
import { createPublicClient, custom } from 'viem';
import { submitMerchantAction, type MerchantAction } from '@/lib/contractSubmitter';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { contractConfig, chain } from '@/lib/contractConfig';
import { getProvider } from '@/lib/walletDiscovery';

export type ProductStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface SupportedCrypto {
    id: bigint;
    tokenSymbol: string;
    tokenAddress: Address;
    isActive: boolean;
}

export interface SupportedFiat {
    id: bigint;
    fiatName: string;
    isActive: boolean;
}

export interface MerchantInfo {
    isActive: boolean;
    kybVerified: boolean;
    registeredAt: bigint;
    sellCryptoAmount: bigint;
    sellFiatAmount: bigint;
}

export interface UseProductsReturn {
    status: ProductStatus;
    txHash: Hex | null;
    error: string | null;
    listCryptoProduct: (cryptoId: bigint, fiatId: bigint, amount: bigint, isActive: boolean, provider?: any) => Promise<void>;
    listFiatProduct: (fiatId: bigint, cryptoId: bigint, amount: bigint, isActive: boolean, provider?: any) => Promise<void>;
    activateProduct: (id: bigint, assetType: number, provider?: any) => Promise<void>;
    deactivateProduct: (id: bigint, assetType: number, provider?: any) => Promise<void>;
    addCollateral: (id: bigint, assetType: number, amount: bigint, provider?: any) => Promise<void>;
    withdrawCollateral: (id: bigint, assetType: number, amount: bigint, provider?: any) => Promise<void>;
    setFiatAccount: (account: string, provider?: any) => Promise<void>;
    fetchMerchantInfo: (address: Address, provider?: any) => Promise<MerchantInfo | null>;
    fetchSupportedCryptos: (provider?: any) => Promise<SupportedCrypto[]>;
    fetchSupportedFiats: (provider?: any) => Promise<SupportedFiat[]>;
    reset: () => void;
}

export function useProducts(): UseProductsReturn {
    const [status, setStatus] = useState<ProductStatus>('idle');
    const [txHash, setTxHash] = useState<Hex | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reset = useCallback(() => {
        setStatus('idle');
        setTxHash(null);
        setError(null);
    }, []);

    const exec = useCallback(async (action: MerchantAction, provider?: any) => {
        try {
            setError(null);
            setStatus('submitting');
            const { hash } = await submitMerchantAction(action, provider);
            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, []);

    const getPublicClient = useCallback((provider?: any) => {
        const ethereum = provider ?? getProvider();
        return createPublicClient({ chain, transport: custom(ethereum) });
    }, []);

    const listCryptoProduct = useCallback(async (
        cryptoId: bigint, fiatId: bigint, amount: bigint, isActive: boolean, provider?: any,
    ) => {
        await exec({ type: 'listCryptoProduct', cryptoId, fiatId, amount, isActive }, provider);
    }, [exec]);

    const listFiatProduct = useCallback(async (
        fiatId: bigint, cryptoId: bigint, amount: bigint, isActive: boolean, provider?: any,
    ) => {
        await exec({ type: 'listFiatProduct', fiatId, cryptoId, amount, isActive }, provider);
    }, [exec]);

    const activateProduct = useCallback(async (id: bigint, assetType: number, provider?: any) => {
        await exec({ type: 'activeProduct', id, assetType }, provider);
    }, [exec]);

    const deactivateProduct = useCallback(async (id: bigint, assetType: number, provider?: any) => {
        await exec({ type: 'inactiveProduct', id, assetType }, provider);
    }, [exec]);

    const addCollateral = useCallback(async (id: bigint, assetType: number, amount: bigint, provider?: any) => {
        await exec({ type: 'addAmount', id, assetType, amount }, provider);
    }, [exec]);

    const withdrawCollateral = useCallback(async (id: bigint, assetType: number, amount: bigint, provider?: any) => {
        await exec({ type: 'takeAmount', id, assetType, amount }, provider);
    }, [exec]);

    const setFiatAccount = useCallback(async (account: string, provider?: any) => {
        await exec({ type: 'setMerchantFiatAccount', account }, provider);
    }, [exec]);

    const fetchMerchantInfo = useCallback(async (address: Address, provider?: any): Promise<MerchantInfo | null> => {
        try {
            const client = getPublicClient(provider);
            const result = await client.readContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'merchants',
                args: [address],
            });
            const [isActive, kybVerified, registeredAt, sellCryptoAmount, sellFiatAmount] = result as [boolean, boolean, bigint, bigint, bigint];
            return { isActive, kybVerified, registeredAt, sellCryptoAmount, sellFiatAmount };
        } catch {
            return null;
        }
    }, [getPublicClient]);

    const fetchSupportedCryptos = useCallback(async (provider?: any): Promise<SupportedCrypto[]> => {
        try {
            const client = getPublicClient(provider);
            const result = await client.readContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'getSupportCryptoList',
            });
            return (result as any[]).map((c: any) => ({
                id: c.id,
                tokenSymbol: c.tokenSymbol,
                tokenAddress: c.tokenAddress,
                isActive: c.isActive,
            }));
        } catch {
            return [];
        }
    }, [getPublicClient]);

    const fetchSupportedFiats = useCallback(async (provider?: any): Promise<SupportedFiat[]> => {
        try {
            const client = getPublicClient(provider);
            const result = await client.readContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'getSupportFiatList',
            });
            return (result as any[]).map((f: any) => ({
                id: f.id,
                fiatName: f.fiatName,
                isActive: f.isActive,
            }));
        } catch {
            return [];
        }
    }, [getPublicClient]);

    return {
        status,
        txHash,
        error,
        listCryptoProduct,
        listFiatProduct,
        activateProduct,
        deactivateProduct,
        addCollateral,
        withdrawCollateral,
        setFiatAccount,
        fetchMerchantInfo,
        fetchSupportedCryptos,
        fetchSupportedFiats,
        reset,
    };
}
