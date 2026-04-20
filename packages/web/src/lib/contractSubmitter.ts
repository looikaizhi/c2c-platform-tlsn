/**
 * Submits transactions to the C2C platform contracts.
 */

import {
    createWalletClient,
    createPublicClient,
    custom,
    type Hex,
    type Address,
    type TransactionReceipt,
} from 'viem';
import type { ContractTLSNProof } from './proofTransformer';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI } from './contractAbi';
import { contractConfig, chain } from './contractConfig';
import { getProvider } from './walletDiscovery';
import type { SignedOrderInput } from './eip712';
import { toContractSignedOrder } from './eip712';

// ── Action types ──────────────────────────────────────────────

export type ProofAction =
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

export type OrderAction =
    | { type: 'placeOrder'; order: SignedOrderInput; signature: Hex }
    | { type: 'cancelOrder'; merchant: Address; productId: bigint; assetType: number; orderId: bigint }
    | { type: 'payOrderByCrypto'; merchant: Address; productId: bigint; orderId: bigint }
    | { type: 'claimRefundAfterTimeout'; merchant: Address; productId: bigint; orderId: bigint };

export type MerchantAction =
    | { type: 'listCryptoProduct'; cryptoId: bigint; fiatId: bigint; amount: bigint; isActive: boolean }
    | { type: 'listFiatProduct'; fiatId: bigint; cryptoId: bigint; amount: bigint; isActive: boolean }
    | { type: 'activeProduct'; id: bigint; assetType: number }
    | { type: 'inactiveProduct'; id: bigint; assetType: number }
    | { type: 'addAmount'; id: bigint; assetType: number; amount: bigint }
    | { type: 'takeAmount'; id: bigint; assetType: number; amount: bigint }
    | { type: 'setMerchantFiatAccount'; account: string };

export type SubmitAction = ProofAction | OrderAction | MerchantAction;

// ── Helpers ───────────────────────────────────────────────────

function getClients(provider?: any) {
    const ethereum = provider ?? getProvider();
    const walletClient = createWalletClient({ chain, transport: custom(ethereum) });
    const publicClient = createPublicClient({ chain, transport: custom(ethereum) });
    return { walletClient, publicClient };
}

// ── Proof submission ──────────────────────────────────────────

export async function submitProofToContract(
    proof: ContractTLSNProof,
    action: ProofAction,
    provider?: any,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
    const { walletClient, publicClient } = getClients(provider);
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

// ── Order operations ──────────────────────────────────────────

export async function submitOrderAction(
    action: OrderAction,
    provider?: any,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
    const { walletClient, publicClient } = getClients(provider);
    const [account] = await walletClient.requestAddresses();

    let hash: Hex;

    switch (action.type) {
        case 'placeOrder':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'placeOrder',
                args: [toContractSignedOrder(action.order), action.signature] as any,
                account,
            });
            break;

        case 'cancelOrder':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'cancelOrder',
                args: [action.merchant, action.productId, action.assetType, action.orderId] as any,
                account,
            });
            break;

        case 'payOrderByCrypto':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'payOrderByCrypto',
                args: [action.merchant, action.productId, action.orderId] as any,
                account,
            });
            break;

        case 'claimRefundAfterTimeout':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'claimRefundAfterTimeout',
                args: [action.merchant, action.productId, action.orderId] as any,
                account,
            });
            break;
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { hash, receipt };
}

// ── Merchant operations ───────────────────────────────────────

export async function submitMerchantAction(
    action: MerchantAction,
    provider?: any,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
    const { walletClient, publicClient } = getClients(provider);
    const [account] = await walletClient.requestAddresses();

    let hash: Hex;

    switch (action.type) {
        case 'listCryptoProduct':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'listCryptoProduct',
                args: [action.cryptoId, action.fiatId, action.amount, action.isActive] as any,
                account,
            });
            break;

        case 'listFiatProduct':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'listFiatProduct',
                args: [action.fiatId, action.cryptoId, action.amount, action.isActive] as any,
                account,
            });
            break;

        case 'activeProduct':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'activeProduct',
                args: [action.id, action.assetType] as any,
                account,
            });
            break;

        case 'inactiveProduct':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'inactiveProduct',
                args: [action.id, action.assetType] as any,
                account,
            });
            break;

        case 'addAmount':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'addAmount',
                args: [action.id, action.assetType, action.amount] as any,
                account,
            });
            break;

        case 'takeAmount':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'takeAmount',
                args: [action.id, action.assetType, action.amount] as any,
                account,
            });
            break;

        case 'setMerchantFiatAccount':
            hash = await walletClient.writeContract({
                address: contractConfig.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'setMerchantFiatAccount',
                args: [action.account] as any,
                account,
            });
            break;
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { hash, receipt };
}
