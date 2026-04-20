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
    | { type: 'registerMerchant' }
    | { type: 'payOrderByFiat'; merchant: Hex; productId: bigint; orderId: bigint }
    | {
          type: 'payOrderByWise';
          merchant: Hex;
          productId: bigint;
          orderId: bigint;
          contactsProof: ContractTLSNProof;
      }
    | { type: 'payOrderByAlipay'; merchant: Hex; productId: bigint; orderId: bigint }
    | { type: 'receiveCryptoWithPayment'; productId: bigint; orderId: bigint }
    | { type: 'receiveCryptoWithAlipayPayment'; productId: bigint; orderId: bigint };

export async function submitProofToContract(
    proof: ContractTLSNProof,
    action: SubmitAction,
    provider?: any,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
    const ethereum = provider ?? getProvider();

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
                args: [proof] as any,
                account,
            });
            break;

        case 'payOrderByFiat':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'payOrderByFiat',
                args: [action.merchant, action.productId, action.orderId, proof] as any,
                account,
            });
            break;

        case 'payOrderByWise':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'payOrderByWise',
                args: [
                    action.merchant,
                    action.productId,
                    action.orderId,
                    action.contactsProof,
                    proof,
                ] as any,
                account,
            });
            break;

        case 'payOrderByAlipay':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'payOrderByAlipay',
                args: [action.merchant, action.productId, action.orderId, proof] as any,
                account,
            });
            break;

        case 'receiveCryptoWithPayment':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'receiveCryptoWithPayment',
                args: [action.productId, action.orderId, proof] as any,
                account,
            });
            break;

        case 'receiveCryptoWithAlipayPayment':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'receiveCryptoWithAlipayPayment',
                args: [action.productId, action.orderId, proof] as any,
                account,
            });
            break;
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { hash, receipt };
}
