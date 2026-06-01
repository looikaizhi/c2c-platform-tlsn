"use client";
import { useCallback, useState } from 'react';
import type { Hex } from 'viem';
import {
    buildContractProof,
    type ExtensionProveResponse,
} from '@/proofs/transformer';
import { isNetworkConfigured } from '@/chain/networkRegistry';
import { useNetwork } from '@/contexts/NetworkContext';
import * as escrow from '@/chain/writers/escrowWriter';

export type ContractStatus = 'idle' | 'building' | 'confirming' | 'pending' | 'success' | 'error';

export interface UseContractReturn {
    status: ContractStatus;
    txHash: Hex | null;
    error:  string | null;
    isConfigured: boolean;
    submitWiseCryptoProof: (
        contactsResponse: ExtensionProveResponse,
        transferResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
    ) => Promise<void>;
    submitWiseFiatProof: (
        transferResponse: ExtensionProveResponse,
        productId: bigint,
        orderId: bigint,
    ) => Promise<void>;
    submitAlipayCryptoProof: (
        proveResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
    ) => Promise<void>;
    submitAlipayFiatProof: (
        proveResponse: ExtensionProveResponse,
        productId: bigint,
        orderId: bigint,
    ) => Promise<void>;
    reset: () => void;
}

/**
 * Legacy hook used by `TlsnVerifyButton`. The actual P2P proof flow runs
 * through `useOrderFlow.submitProof` (Stage P5) — this hook is kept until the
 * verify-button merchant-self-register entry is fully retired.
 */
export function useContract(): UseContractReturn {
    const { network, walletChainId } = useNetwork();
    const [status, setStatus] = useState<ContractStatus>('idle');
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

    const submitWiseCryptoProof = useCallback(async (
        contactsResponse: ExtensionProveResponse, transferResponse: ExtensionProveResponse,
        merchant: Hex, productId: bigint, orderId: bigint,
    ) => {
        try {
            assertChain();
            setError(null);
            setStatus('building');
            const proofs = [buildContractProof(contactsResponse), buildContractProof(transferResponse)];
            setStatus('confirming');
            const { hash } = await escrow.payOrderByPlatform(network.chainId, { merchant, productId, orderId, proofs });
            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, [network, walletChainId]);

    const submitWiseFiatProof = useCallback(async (
        transferResponse: ExtensionProveResponse, productId: bigint, orderId: bigint,
    ) => {
        try {
            assertChain();
            setError(null);
            setStatus('building');
            const proofs = [buildContractProof(transferResponse)];
            setStatus('confirming');
            const { hash } = await escrow.receiveCryptoWithPlatformPayment(network.chainId, { productId, orderId, proofs });
            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, [network, walletChainId]);

    const submitAlipayCryptoProof = useCallback(async (
        proveResponse: ExtensionProveResponse, merchant: Hex, productId: bigint, orderId: bigint,
    ) => {
        try {
            assertChain();
            setError(null);
            setStatus('building');
            const proofs = [buildContractProof(proveResponse)];
            setStatus('confirming');
            const { hash } = await escrow.payOrderByPlatform(network.chainId, { merchant, productId, orderId, proofs });
            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, [network, walletChainId]);

    const submitAlipayFiatProof = useCallback(async (
        proveResponse: ExtensionProveResponse, productId: bigint, orderId: bigint,
    ) => {
        try {
            assertChain();
            setError(null);
            setStatus('building');
            const proofs = [buildContractProof(proveResponse)];
            setStatus('confirming');
            const { hash } = await escrow.receiveCryptoWithPlatformPayment(network.chainId, { productId, orderId, proofs });
            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, [network, walletChainId]);

    return {
        status,
        txHash,
        error,
        isConfigured: isNetworkConfigured(network),
        submitWiseCryptoProof,
        submitWiseFiatProof,
        submitAlipayCryptoProof,
        submitAlipayFiatProof,
        reset,
    };
}
