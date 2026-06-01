"use client";
import { useCallback, useState } from 'react';
import type { Hex, Address } from 'viem';
import { getPublicClient } from '@/chain/clients';
import * as escrow     from '@/chain/writers/escrowWriter';
import * as bondVault  from '@/chain/writers/bondVaultWriter';
import * as erc20      from '@/chain/writers/erc20Writer';
import type { PluginResult } from '@/platforms/types';
import { platformByKey } from '@/platforms/registry';
import { submitProof as submitProofPipeline } from '@/proofs/submitter';
import { C2C_RISK_MANAGER_ABI, ERC20_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';

const MAX_UINT256 = (2n ** 256n) - 1n;
const ZERO_HASH = ('0x' + '0'.repeat(64)) as Hex;

export type Platform       = 'wise' | 'alipay';
export type OrderDirection = 'crypto' | 'fiat';

export type OrderFlowStatus =
    | 'idle'
    | 'placing'
    | 'claiming'
    | 'cancelling'
    | 'pending'
    | 'success'
    | 'error';

export interface OrderFlowActionResult {
    ok:        boolean;
    txHash?:   Hex;
    orderId?:  bigint;
    deadline?: bigint;
    error?:    string;
}

export interface SubmitProofParams {
    platform:  Platform;
    direction: OrderDirection;
    merchant?: Address;
    productId: bigint;
    orderId:   bigint;
    proof:     PluginResult;
}

export interface PlaceOrderParams {
    merchant:         Address;
    productId:        bigint;
    assetType:        number;
    amount:           bigint;
    bondTokenAddress: Address;
    buyerInfo?:       { nameHash: Hex; idHash: Hex };
}

export interface UseOrderFlowReturn {
    status: OrderFlowStatus;
    txHash: Hex | null;
    error:  string | null;
    placeOrder:  (params: PlaceOrderParams) => Promise<OrderFlowActionResult>;
    /** V4: disabled — orders expire automatically. */
    cancelOrder: (merchant: Address, productId: bigint, assetType: number, orderId: bigint) => Promise<OrderFlowActionResult>;
    claimRefund: (tokenAddress: Address) => Promise<OrderFlowActionResult>;
    submitProof: (params: SubmitProofParams) => Promise<OrderFlowActionResult>;
    reset:       () => void;
}

export function useOrderFlow(): UseOrderFlowReturn {
    const { network, walletChainId } = useNetwork();
    const [status, setStatus] = useState<OrderFlowStatus>('idle');
    const [txHash, setTxHash] = useState<Hex | null>(null);
    const [error,  setError]  = useState<string | null>(null);

    const reset = useCallback(() => {
        setStatus('idle');
        setTxHash(null);
        setError(null);
    }, []);

    function assertChain() {
        if (walletChainId !== null && walletChainId !== network.chainId) {
            throw new Error(`Please switch your wallet to ${network.name} (current chain ID: ${walletChainId})`);
        }
    }

    const placeOrder = useCallback(async (params: PlaceOrderParams): Promise<OrderFlowActionResult> => {
        try {
            assertChain();
            setError(null);
            setStatus('placing');

            const publicClient = getPublicClient(network.chainId);

            // Resolve the active wallet account once — used both for allowance
            // reads and writer calls.
            const walletAccount = (await (await import('@/chain/clients')).getWalletClient(network.chainId)).account;
            if (!walletAccount) throw new Error('Wallet not connected');

            // Approve routing: CRYPTO pulls bond into BondVault; FIAT locks amount in Escrow.
            if (params.assetType === 0) {
                const bondBps = (await publicClient.readContract({
                    address:      network.contracts.c2cRiskManager,
                    abi:          C2C_RISK_MANAGER_ABI,
                    functionName: 'requiredBondBps',
                    args:         [walletAccount.address],
                })) as number;
                const estimatedBond = (params.amount * BigInt(bondBps)) / 10000n;
                if (estimatedBond > 0n) {
                    const allowance = (await publicClient.readContract({
                        address:      params.bondTokenAddress,
                        abi:          ERC20_ABI,
                        functionName: 'allowance',
                        args:         [walletAccount.address, network.contracts.c2cBondVault],
                    })) as bigint;
                    if (allowance < estimatedBond) {
                        await erc20.approve(network.chainId, params.bondTokenAddress, network.contracts.c2cBondVault, MAX_UINT256);
                    }
                }
            } else {
                await erc20.approve(network.chainId, params.bondTokenAddress, network.contracts.c2cEscrow, params.amount);
            }

            const { hash, event } = await escrow.placeOrder(network.chainId, {
                merchant:  params.merchant,
                productId: params.productId,
                assetType: params.assetType,
                amount:    params.amount,
                buyerInfo: params.buyerInfo ?? { nameHash: ZERO_HASH, idHash: ZERO_HASH },
            });

            setTxHash(hash);
            setStatus('success');
            return { ok: true, txHash: hash, orderId: event?.orderId ?? 0n, deadline: event?.deadline ?? 0n };
        } catch (err: any) {
            const msg = err.shortMessage || err.message || String(err);
            setError(msg);
            setStatus('error');
            return { ok: false, error: msg };
        }
    }, [network, walletChainId]);

    const cancelOrder = useCallback(async (
        _merchant: Address, _productId: bigint, _assetType: number, _orderId: bigint,
    ): Promise<OrderFlowActionResult> => {
        return { ok: false, error: 'Order cancellation is disabled in V4. Orders expire automatically after 15 minutes.' };
    }, []);

    const claimRefund = useCallback(async (
        tokenAddress: Address,
    ): Promise<OrderFlowActionResult> => {
        try {
            assertChain();
            setError(null);
            setStatus('claiming');
            const { hash } = await bondVault.claim(network.chainId, tokenAddress);
            setTxHash(hash);
            setStatus('success');
            return { ok: true, txHash: hash };
        } catch (err: any) {
            const msg = err.shortMessage || err.message || String(err);
            setError(msg);
            setStatus('error');
            return { ok: false, error: msg };
        }
    }, [network, walletChainId]);

    const submitProof = useCallback(async (params: SubmitProofParams): Promise<OrderFlowActionResult> => {
        const { platform, direction, merchant, productId, orderId, proof } = params;
        try {
            setError(null);
            setStatus('pending');

            const { hash } = await submitProofPipeline({
                platform:  platformByKey(platform),
                direction,
                merchant,
                productId,
                orderId,
                proof,
                network,
            });
            setTxHash(hash);
            setStatus('success');
            return { ok: true, txHash: hash };
        } catch (err: any) {
            const errorMessage = err.shortMessage || err.message || String(err);
            setError(errorMessage);
            setStatus('error');
            return { ok: false, error: errorMessage };
        }
    }, [network]);

    return {
        status,
        txHash,
        error,
        placeOrder,
        cancelOrder,
        claimRefund,
        submitProof,
        reset,
    };
}
