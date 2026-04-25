"use client";
import { useCallback, useState } from 'react';
import type { Hex } from 'viem';
import {
    submitProofToContract,
    type ProofAction,
} from '@/lib/contractSubmitter';
import {
    buildContractProof,
    type ExtensionProveResponse,
} from '@/lib/proofTransformer';
import { isContractConfigured } from '@/lib/contractConfig';

export type { ProofAction as SubmitAction } from '@/lib/contractSubmitter';

export type ContractStatus = 'idle' | 'building' | 'confirming' | 'pending' | 'success' | 'error';

export interface UseContractReturn {
    status: ContractStatus;
    txHash: Hex | null;
    error: string | null;
    isConfigured: boolean;
    submitProof: (
        proveResponse: ExtensionProveResponse,
        action: ProofAction,
        provider?: any,
    ) => Promise<void>;
    submitWiseProofs: (
        contactsResponse: ExtensionProveResponse,
        transferResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => Promise<void>;
    submitWiseCryptoProof: (
        contactsResponse: ExtensionProveResponse,
        transferResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => Promise<void>;
    submitWiseFiatProof: (
        transferResponse: ExtensionProveResponse,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => Promise<void>;
    submitAlipayCryptoProof: (
        proveResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => Promise<void>;
    submitAlipayFiatProof: (
        proveResponse: ExtensionProveResponse,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => Promise<void>;
    reset: () => void;
}

export function useContract(): UseContractReturn {
    const [status, setStatus] = useState<ContractStatus>('idle');
    const [txHash, setTxHash] = useState<Hex | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reset = useCallback(() => {
        setStatus('idle');
        setTxHash(null);
        setError(null);
    }, []);

    const submitProof = useCallback(async (
        proveResponse: ExtensionProveResponse,
        action: ProofAction,
        provider?: any,
    ) => {
        try {
            setError(null);
            setStatus('building');

            const contractProof = buildContractProof(proveResponse);

            setStatus('confirming');
            const { hash } = await submitProofToContract(contractProof, action, provider);

            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, []);

    const submitWiseProofs = useCallback(async (
        contactsResponse: ExtensionProveResponse,
        transferResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => {
        try {
            setError(null);
            setStatus('building');

            const contactsProof = buildContractProof(contactsResponse);
            const transferProof = buildContractProof(transferResponse);

            setStatus('confirming');
            const action: ProofAction = {
                type: 'payOrderByWise',
                merchant,
                productId,
                orderId,
                contactsProof,
            };
            const { hash } = await submitProofToContract(transferProof, action, provider);

            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, []);

    const submitWiseCryptoProof = useCallback(async (
        contactsResponse: ExtensionProveResponse,
        transferResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => {
        return submitWiseProofs(contactsResponse, transferResponse, merchant, productId, orderId, provider);
    }, [submitWiseProofs]);

    const submitWiseFiatProof = useCallback(async (
        transferResponse: ExtensionProveResponse,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => {
        try {
            setError(null);
            setStatus('building');
            const transferProof = buildContractProof(transferResponse);
            setStatus('confirming');
            const { hash } = await submitProofToContract(
                transferProof,
                { type: 'receiveCryptoWithPayment', productId, orderId },
                provider,
            );
            setTxHash(hash);
            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
            setStatus('error');
        }
    }, []);

    const submitAlipayCryptoProof = useCallback(async (
        proveResponse: ExtensionProveResponse,
        merchant: Hex,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => {
        return submitProof(proveResponse, { type: 'payOrderByAlipay', merchant, productId, orderId }, provider);
    }, [submitProof]);

    const submitAlipayFiatProof = useCallback(async (
        proveResponse: ExtensionProveResponse,
        productId: bigint,
        orderId: bigint,
        provider?: any,
    ) => {
        return submitProof(proveResponse, { type: 'receiveCryptoWithAlipayPayment', productId, orderId }, provider);
    }, [submitProof]);

    return {
        status,
        txHash,
        error,
        isConfigured: isContractConfigured(),
        submitProof,
        submitWiseProofs,
        submitWiseCryptoProof,
        submitWiseFiatProof,
        submitAlipayCryptoProof,
        submitAlipayFiatProof,
        reset,
    };
}
