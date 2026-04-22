/**
 * Connects to a wallet and submits TLSNProof(s) to the C2C platform contracts.
 * Uses EIP-6963 provider if supplied, otherwise falls back to window.ethereum.
 */

import {
    createWalletClient,
    createPublicClient,
    custom,
    type Hex,
    type TransactionReceipt,
} from 'viem';
import type { ContractTLSNProof } from './proofTransformer';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI } from './contractAbi';
import { contractConfig, chain } from './contractConfig';
import { getProvider } from './walletDiscovery';

export type SubmitAction =
    | { type: 'registerMerchant'; proof: ContractTLSNProof }
    | { type: 'payOrderByPlatform'; merchant: Hex; productId: bigint; orderId: bigint; proofs: ContractTLSNProof[] }
    | { type: 'receiveCryptoWithPlatformPayment'; productId: bigint; orderId: bigint; proofs: ContractTLSNProof[] };

export async function submitProofToContract(
    action: SubmitAction,
    provider?: any,
): Promise<{ hash: Hex; waitForReceipt: () => Promise<TransactionReceipt> }> {
    const ethereum = provider ?? getProvider();
    if (!ethereum) {
        throw new Error('No wallet provider found (EIP-6963 / window.ethereum).');
    }

    const walletClient = createWalletClient({
        chain,
        transport: custom(ethereum),
    });
    const publicClient = createPublicClient({
        chain,
        transport: custom(ethereum),
    });

    const [account] = await walletClient.requestAddresses();

    let hash: Hex;

    switch (action.type) {
        case 'registerMerchant':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'registerMerchant',
                args: [action.proof] as any,
                account,
            });
            break;

        case 'payOrderByPlatform':
            if (!action.proofs.length) {
                throw new Error('payOrderByPlatform requires at least one proof.');
            }
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'payOrderByPlatform',
                args: [action.merchant, action.productId, action.orderId, action.proofs] as any,
                account,
            });
            break;

        case 'receiveCryptoWithPlatformPayment':
            if (!action.proofs.length) {
                throw new Error('receiveCryptoWithPlatformPayment requires at least one proof.');
            }
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'receiveCryptoWithPlatformPayment',
                args: [action.productId, action.orderId, action.proofs] as any,
                account,
            });
            break;
    }

    return {
        hash,
        waitForReceipt: () => publicClient.waitForTransactionReceipt({ hash }),
    };
}
