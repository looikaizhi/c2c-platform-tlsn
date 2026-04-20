"use client";
import { useCallback, useState } from 'react';
import type { Hex, Address } from 'viem';
import {
    submitOrderAction,
    type OrderAction,
} from '@/lib/contractSubmitter';
import { type SignedOrderInput } from '@/lib/eip712';
import { createWalletClient, custom } from 'viem';
import { chain, contractConfig } from '@/lib/contractConfig';

export type OrderFlowStatus =
    | 'idle'
    | 'signing'
    | 'placing'
    | 'paying-crypto'
    | 'claiming'
    | 'cancelling'
    | 'pending'
    | 'success'
    | 'error';

export interface OrderFlowActionResult {
    ok: boolean;
    txHash?: Hex;
    error?: string;
}

export interface UseOrderFlowReturn {
    status: OrderFlowStatus;
    txHash: Hex | null;
    error: string | null;
    /** Full flow: merchant signs → buyer places order on-chain */
    placeOrder: (order: SignedOrderInput, provider?: any) => Promise<OrderFlowActionResult>;
    /** Cancel a pending order */
    cancelOrder: (merchant: Address, productId: bigint, assetType: number, orderId: bigint, provider?: any) => Promise<OrderFlowActionResult>;
    /** Buyer escrows crypto for FIAT product (Flow B step) */
    payByCrypto: (merchant: Address, productId: bigint, orderId: bigint, provider?: any) => Promise<OrderFlowActionResult>;
    /** Buyer claims 2x refund after merchant timeout */
    claimRefund: (merchant: Address, productId: bigint, orderId: bigint, provider?: any) => Promise<OrderFlowActionResult>;
    reset: () => void;
}

export function useOrderFlow(): UseOrderFlowReturn {
    const [status, setStatus] = useState<OrderFlowStatus>('idle');
    const [txHash, setTxHash] = useState<Hex | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reset = useCallback(() => {
        setStatus('idle');
        setTxHash(null);
        setError(null);
    }, []);

    const exec = useCallback(async (
        statusLabel: OrderFlowStatus,
        action: OrderAction,
        provider?: any,
    ): Promise<OrderFlowActionResult> => {
        try {
            setError(null);
            setStatus(statusLabel);
            const { hash } = await submitOrderAction(action, provider);
            setTxHash(hash);
            setStatus('success');
            return { ok: true, txHash: hash };
        } catch (err: any) {
            const errorMessage = err.shortMessage || err.message || String(err);
            setError(errorMessage);
            setStatus('error');
            return { ok: false, error: errorMessage };
        }
    }, []);

    const placeOrder = useCallback(async (order: SignedOrderInput, provider?: any) => {
        try {
            setError(null);

            // Step 1: Sign the order (merchant signs)
            setStatus('signing');
            const ethereum = provider ?? (typeof window !== 'undefined' ? (window as any).ethereum : undefined);
            const walletClient = createWalletClient({
                chain,
                transport: custom(ethereum),
            });
            const [account] = await walletClient.requestAddresses();

            const signature = await walletClient.signTypedData({
                account,
                domain: {
                    name: 'C2CEscrow',
                    version: '1',
                    chainId: chain.id,
                    verifyingContract: contractConfig.c2cEscrow,
                },
                types: {
                    SignedOrder: [
                        { name: 'merchant', type: 'address' },
                        { name: 'buyer', type: 'address' },
                        { name: 'productID', type: 'uint256' },
                        { name: 'assetType', type: 'uint8' },
                        { name: 'amount', type: 'uint256' },
                        { name: 'rate', type: 'uint256' },
                        { name: 'salt', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' },
                    ],
                },
                primaryType: 'SignedOrder',
                message: {
                    merchant: order.merchant,
                    buyer: order.buyer,
                    productID: order.productID,
                    assetType: order.assetType,
                    amount: order.amount,
                    rate: order.rate,
                    salt: order.salt,
                    deadline: order.deadline,
                },
            });

            // Step 2: Submit on-chain
            setStatus('placing');
            const { hash } = await submitOrderAction(
                { type: 'placeOrder', order, signature },
                provider,
            );
            setTxHash(hash);
            setStatus('success');
            return { ok: true, txHash: hash };
        } catch (err: any) {
            const errorMessage = err.shortMessage || err.message || String(err);
            setError(errorMessage);
            setStatus('error');
            return { ok: false, error: errorMessage };
        }
    }, []);

    const cancelOrder = useCallback((
        merchant: Address, productId: bigint, assetType: number, orderId: bigint, provider?: any,
    ) => {
        return exec('cancelling', { type: 'cancelOrder', merchant, productId, assetType, orderId }, provider);
    }, [exec]);

    const payByCrypto = useCallback((
        merchant: Address, productId: bigint, orderId: bigint, provider?: any,
    ) => {
        return exec('paying-crypto', { type: 'payOrderByCrypto', merchant, productId, orderId }, provider);
    }, [exec]);

    const claimRefund = useCallback((
        merchant: Address, productId: bigint, orderId: bigint, provider?: any,
    ) => {
        return exec('claiming', { type: 'claimRefundAfterTimeout', merchant, productId, orderId }, provider);
    }, [exec]);

    return {
        status,
        txHash,
        error,
        placeOrder,
        cancelOrder,
        payByCrypto,
        claimRefund,
        reset,
    };
}
