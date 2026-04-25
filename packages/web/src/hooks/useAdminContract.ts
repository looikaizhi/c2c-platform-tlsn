"use client";
import { useState, useCallback } from 'react';
import { createWalletClient, createPublicClient, custom, parseAbiItem } from 'viem';
import type { Hex } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { contractConfig, chain } from '@/lib/contractConfig';
import { getProvider } from '@/lib/walletDiscovery';

// AssetType enum mirrors the Solidity enum: CRYPTO = 0, FIAT = 1
export const AssetType = { CRYPTO: 0, FIAT: 1 } as const;

export type AdminStatus = 'idle' | 'confirming' | 'syncing' | 'success' | 'error';

export interface AdminOpState {
    status: AdminStatus;
    txHash: Hex | null;
    error: string | null;
}

function getClients() {
    const provider = getProvider();
    const walletClient = createWalletClient({ chain, transport: custom(provider) });
    const publicClient = createPublicClient({ chain, transport: custom(provider) });
    return { walletClient, publicClient };
}

export function useAdminContract() {
    const [state, setState] = useState<AdminOpState>({
        status: 'idle',
        txHash: null,
        error: null,
    });

    const reset = useCallback(() => {
        setState({ status: 'idle', txHash: null, error: null });
    }, []);

    // ── Add Crypto ────────────────────────────────────────────────────────────
    const addCrypto = useCallback(async (tokenAddress: Hex, isActive: boolean) => {
        setState({ status: 'confirming', txHash: null, error: null });
        try {
            const { walletClient, publicClient } = getClients();
            const [account] = await walletClient.requestAddresses();

            const hash = await walletClient.writeContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'addCryptoInfo',
                args: [tokenAddress, isActive],
                account,
            });

            setState((s) => ({ ...s, txHash: hash }));
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Parse SupportCryptoAdded event to get crypto_id and token_symbol
            const eventAbi = parseAbiItem(
                'event SupportCryptoAdded(uint256 indexed cryptoId, address indexed tokenAddress, string tokenSymbol, bool isActive)',
            );
            const logs = receipt.logs.filter(
                (l) => l.address.toLowerCase() === contractConfig.c2cAdmin.toLowerCase(),
            );

            let cryptoId = 0;
            let tokenSymbol = '';
            for (const log of logs) {
                try {
                    const decoded = (publicClient as any).decode?.({ abi: [eventAbi], log });
                    if (decoded) {
                        cryptoId = Number((decoded as any).args.cryptoId);
                        tokenSymbol = (decoded as any).args.tokenSymbol;
                    }
                } catch { /* skip non-matching */ }
            }

            // Fallback: read from contract if event parse fails
            if (!tokenSymbol) {
                const info = await publicClient.readContract({
                    address: contractConfig.c2cAdmin,
                    abi: C2C_ADMIN_ABI,
                    functionName: 'getSupportCryptoList',
                }) as any[];
                const last = info[info.length - 1];
                cryptoId = Number(last.id);
                tokenSymbol = last.tokenSymbol;
            }

            setState((s) => ({ ...s, status: 'syncing' }));
            await fetch('/api/admin/crypto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crypto_id: cryptoId, token_symbol: tokenSymbol, token_address: tokenAddress, is_active: isActive }),
            });

            setState((s) => ({ ...s, status: 'success' }));
        } catch (err: any) {
            setState((s) => ({ ...s, status: 'error', error: err.shortMessage || err.message || String(err) }));
        }
    }, []);

    // ── Add Fiat ──────────────────────────────────────────────────────────────
    const addFiat = useCallback(async (fiatName: string, isActive: boolean) => {
        setState({ status: 'confirming', txHash: null, error: null });
        try {
            const { walletClient, publicClient } = getClients();
            const [account] = await walletClient.requestAddresses();

            const hash = await walletClient.writeContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'addFiatInfo',
                args: [fiatName, isActive],
                account,
            });

            setState((s) => ({ ...s, txHash: hash }));
            await publicClient.waitForTransactionReceipt({ hash });

            // Read fiatId from contract (last element of the list)
            const fiatList = await publicClient.readContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'getSupportFiatList',
            }) as any[];
            const fiatId = Number(fiatList[fiatList.length - 1].id);

            setState((s) => ({ ...s, status: 'syncing' }));
            await fetch('/api/admin/fiat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fiat_id: fiatId, fiat_name: fiatName, is_active: isActive }),
            });

            setState((s) => ({ ...s, status: 'success' }));
        } catch (err: any) {
            setState((s) => ({ ...s, status: 'error', error: err.shortMessage || err.message || String(err) }));
        }
    }, []);

    // ── Toggle Asset (activate / deactivate) ─────────────────────────────────
    const toggleAsset = useCallback(async (
        assetId: number,
        assetType: 0 | 1,
        newActive: boolean,
    ) => {
        setState({ status: 'confirming', txHash: null, error: null });
        try {
            const { walletClient, publicClient } = getClients();
            const [account] = await walletClient.requestAddresses();

            const functionName = newActive ? 'activateAsset' : 'deactivateAsset';
            const hash = await walletClient.writeContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName,
                args: [BigInt(assetId), assetType],
                account,
            });

            setState((s) => ({ ...s, txHash: hash }));
            await publicClient.waitForTransactionReceipt({ hash });

            setState((s) => ({ ...s, status: 'syncing' }));
            const endpoint = assetType === AssetType.CRYPTO
                ? `/api/admin/crypto/${assetId}`
                : `/api/admin/fiat/${assetId}`;

            await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: newActive }),
            });

            setState((s) => ({ ...s, status: 'success' }));
        } catch (err: any) {
            setState((s) => ({ ...s, status: 'error', error: err.shortMessage || err.message || String(err) }));
        }
    }, []);

    // ── Register Merchant by Admin ────────────────────────────────────────────
    const registerMerchant = useCallback(async (merchantAddress: Hex) => {
        setState({ status: 'confirming', txHash: null, error: null });
        try {
            const { walletClient, publicClient } = getClients();
            const [account] = await walletClient.requestAddresses();

            const hash = await walletClient.writeContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'registerMerchantByAdmin',
                args: [merchantAddress],
                account,
            });

            setState((s) => ({ ...s, txHash: hash }));
            await publicClient.waitForTransactionReceipt({ hash });

            await fetch('/api/admin/merchant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ merchant: merchantAddress }),
            });

            setState((s) => ({ ...s, status: 'success' }));
        } catch (err: any) {
            setState((s) => ({ ...s, status: 'error', error: err.shortMessage || err.message || String(err) }));
        }
    }, []);

    return { state, reset, addCrypto, addFiat, toggleAsset, registerMerchant };
}
