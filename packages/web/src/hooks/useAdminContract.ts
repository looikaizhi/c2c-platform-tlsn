"use client";
import { useState, useCallback } from 'react';
import type { Hex } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient, getWalletClient } from '@/chain/clients';
import { useImperativeTx } from '@/hooks/core/useImperativeTx';
import * as admin from '@/chain/writers/adminWriter';
import { adminApi } from '@/api/resources/adminApi';

export const AssetType = { CRYPTO: 0, FIAT: 1 } as const;

export type AdminStatus = 'idle' | 'confirming' | 'syncing' | 'success' | 'error';

export interface AdminOpState {
    status: AdminStatus;
    txHash: Hex | null;
    error:  string | null;
}

/**
 * Domain hook for C2CAdmin write paths. Now implemented on top of
 * `chain/writers/adminWriter` + the unified `useImperativeTx` state machine.
 * External API unchanged so existing callers keep working.
 */
export function useAdminContract() {
    const { network } = useNetwork();
    const tx = useImperativeTx();
    // sub-phase: on-chain confirm vs server-side DB sync
    const [phase, setPhase] = useState<'confirming' | 'syncing' | null>(null);

    const state: AdminOpState = {
        status:
            tx.status === 'idle'    ? 'idle'   :
            tx.status === 'success' ? 'success':
            tx.status === 'error'   ? 'error'  :
            (phase === 'syncing' ? 'syncing' : 'confirming'),
        txHash: tx.txHash,
        error:  tx.error,
    };

    const reset = useCallback(() => { tx.reset(); setPhase(null); }, [tx]);

    // ── Add Crypto ────────────────────────────────────────────────────────
    const addCrypto = useCallback(async (tokenAddress: Hex, isActive: boolean) => {
        setPhase('confirming');
        await tx.run(async () => {
            const { hash } = await admin.addCryptoInfo(network.chainId, tokenAddress, isActive);
            tx.setHash(hash);

            const publicClient = getPublicClient(network.chainId);
            const info = await publicClient.readContract({
                address:      network.contracts.c2cAdmin,
                abi:          C2C_ADMIN_ABI,
                functionName: 'getSupportCryptoList',
            }) as any[];
            if (!info.length) throw new Error('Crypto list is empty after addCryptoInfo — cannot read new asset ID');
            const last = info[info.length - 1];
            if (last?.id == null || !last?.tokenSymbol) throw new Error('Invalid crypto asset data returned from contract');
            const cryptoId    = Number(last.id);
            const tokenSymbol: string = last.tokenSymbol;

            setPhase('syncing');
            await adminApi.addCrypto({
                crypto_id:     cryptoId,
                token_symbol:  tokenSymbol,
                token_address: tokenAddress,
                is_active:     isActive,
            });
        });
        setPhase(null);
    }, [network, tx]);

    // ── Add Fiat ──────────────────────────────────────────────────────────
    const addFiat = useCallback(async (fiatName: string, isActive: boolean) => {
        setPhase('confirming');
        await tx.run(async () => {
            const { hash } = await admin.addFiatInfo(network.chainId, fiatName, isActive);
            tx.setHash(hash);

            const publicClient = getPublicClient(network.chainId);
            const fiatList = await publicClient.readContract({
                address:      network.contracts.c2cAdmin,
                abi:          C2C_ADMIN_ABI,
                functionName: 'getSupportFiatList',
            }) as any[];
            if (!fiatList.length) throw new Error('Fiat list is empty after addFiatInfo — cannot read new asset ID');
            const fiatLast = fiatList[fiatList.length - 1];
            if (fiatLast?.id == null) throw new Error('Invalid fiat asset data returned from contract');
            const fiatId = Number(fiatLast.id);

            setPhase('syncing');
            await adminApi.addFiat({ fiat_id: fiatId, fiat_name: fiatName, is_active: isActive });
        });
        setPhase(null);
    }, [network, tx]);

    // ── Toggle Asset ──────────────────────────────────────────────────────
    const toggleAsset = useCallback(async (
        assetId: number, assetType: 0 | 1, newActive: boolean,
    ) => {
        setPhase('confirming');
        await tx.run(async () => {
            const { hash } = await (newActive
                ? admin.activateAsset(network.chainId, BigInt(assetId), assetType)
                : admin.deactivateAsset(network.chainId, BigInt(assetId), assetType));
            tx.setHash(hash);

            setPhase('syncing');
            if (assetType === AssetType.CRYPTO) {
                await adminApi.toggleCrypto(assetId, { is_active: newActive });
            } else {
                await adminApi.toggleFiat(assetId, { is_active: newActive });
            }
        });
        setPhase(null);
    }, [network, tx]);

    // ── Register Merchant by Admin ────────────────────────────────────────
    const registerMerchant = useCallback(async (merchantAddress: Hex) => {
        setPhase('confirming');
        await tx.run(async () => {
            const { hash } = await admin.registerMerchantByAdmin(network.chainId, merchantAddress);
            tx.setHash(hash);

            await adminApi.registerMerchant(merchantAddress);

            setPhase('syncing');
            const wc = await getWalletClient(network.chainId);
            const adminAddr = wc.account?.address;
            if (!adminAddr) throw new Error('Wallet not connected');
            try {
                await adminApi.grantRole(adminAddr, merchantAddress, 'merchant');
            } catch (grantErr: any) {
                throw new Error(
                    `On-chain register succeeded but DB role sync failed: ${grantErr.message || grantErr}. ` +
                    'The wallet has merchant rights on-chain; re-run to retry the DB sync.',
                );
            }
        });
        setPhase(null);
    }, [network, tx]);

    // ── Misc admin writes ─────────────────────────────────────────────────
    const wrapWrite = (fn: () => Promise<{ hash: Hex }>) => async () => {
        setPhase('confirming');
        await tx.run(async () => {
            const { hash } = await fn();
            tx.setHash(hash);
        });
        setPhase(null);
    };

    const setMaxOrderAmount    = useCallback((newAmount: bigint)             => wrapWrite(() => admin.setMaxOrderAmount(network.chainId, newAmount))(), [network, tx]);
    const setAuthorizedCaller  = useCallback((caller: Hex, granted: boolean) => wrapWrite(() => admin.setAuthorizedCaller(network.chainId, caller, granted))(), [network, tx]);
    const proposeAdminTransfer = useCallback((newAdmin: Hex)                 => wrapWrite(() => admin.proposeAdminTransfer(network.chainId, newAdmin))(), [network, tx]);
    const acceptAdmin          = useCallback(()                               => wrapWrite(() => admin.acceptAdmin(network.chainId))(), [network, tx]);

    return {
        state,
        reset,
        addCrypto,
        addFiat,
        toggleAsset,
        registerMerchant,
        setMaxOrderAmount,
        setAuthorizedCaller,
        proposeAdminTransfer,
        acceptAdmin,
    };
}
