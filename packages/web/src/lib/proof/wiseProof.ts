// Wise C2C proof helpers for web.
//
// Flow A (Wise-Crypto): Buyer pays MYR via Wise → receives USDT.
// Flow B (Wise-Fiat):   Buyer locks USDT → merchant pays MYR via Wise → merchant receives USDT.

import { keccak256, toBytes } from 'viem';
import type { Hex, Address } from 'viem';
import {
    computeOrderBindingHash,
    injectOrderBindingHash,
    injectMerchantNameHash,
    injectMerchantIdHash,
    injectPayeeNameHash,
    injectPayeeIdHash,
    injectTransferOrderBindingHash,
    buildContractProof,
    type OrderBindingContext,
    type ExtensionProveResponse,
    type ContractTLSNProof,
} from '@/lib/proofTransformer';
import { submitProofToContract } from '@/lib/contractSubmitter';
import { chain, contractConfig } from '@/lib/contractConfig';

export const PLATFORM_WISE = keccak256(toBytes('wise')) as `0x${string}`;

// ── Context builders (synchronous — caller provides pre-fetched on-chain values) ──

export interface WiseCryptoBindingParams {
    merchantAddr: Address;
    buyerAddr: Address;
    productId: bigint;
    orderId: bigint;
    amount: bigint;
    rate: bigint;
    rateVersion: bigint;
    deadline: bigint;
    merchantNameHash: Hex;
    merchantIdHash: Hex;
}

/** CRYPTO flow: payee = merchant (buyer pays merchant on Wise). */
export function makeWiseCryptoBindingContext(params: WiseCryptoBindingParams): OrderBindingContext {
    return {
        escrowAddress: contractConfig.c2cEscrow,
        chainId: chain.id,
        merchant: params.merchantAddr,
        buyer: params.buyerAddr,
        productId: params.productId,
        orderId: params.orderId,
        assetType: 0, // CRYPTO
        amount: params.amount,
        rate: params.rate,
        rateVersion: params.rateVersion,
        deadline: params.deadline,
        merchantNameHash: params.merchantNameHash,
        merchantIdHash: params.merchantIdHash,
        payeeNameHash: params.merchantNameHash, // CRYPTO: payee = merchant
        payeeIdHash: params.merchantIdHash,
    };
}

export interface WiseFiatBindingParams {
    merchantAddr: Address;
    buyerAddr: Address;
    productId: bigint;
    orderId: bigint;
    amount: bigint;
    rate: bigint;
    rateVersion: bigint;
    deadline: bigint;
    merchantNameHash: Hex;
    merchantIdHash: Hex;
    buyerNameHash: Hex;
    buyerIdHash: Hex;
}

/** FIAT flow: payee = buyer (merchant pays MYR to buyer's Wise account). */
export function makeWiseFiatBindingContext(params: WiseFiatBindingParams): OrderBindingContext {
    return {
        escrowAddress: contractConfig.c2cEscrow,
        chainId: chain.id,
        merchant: params.merchantAddr,
        buyer: params.buyerAddr,
        productId: params.productId,
        orderId: params.orderId,
        assetType: 1, // FIAT
        amount: params.amount,
        rate: params.rate,
        rateVersion: params.rateVersion,
        deadline: params.deadline,
        merchantNameHash: params.merchantNameHash,
        merchantIdHash: params.merchantIdHash,
        payeeNameHash: params.buyerNameHash, // FIAT: payee = buyer
        payeeIdHash: params.buyerIdHash,
    };
}

// ── Plugin runner ──────────────────────────────────────────────────────────────

export interface WiseProofResult {
    contacts: ExtensionProveResponse;
    transfer: ExtensionProveResponse;
}

/** Run the Wise plugin and return both contacts + transfer proofs. */
export async function runWisePlugin(
    pluginCode: string,
    contactsCtx: OrderBindingContext,
    transferCtx: OrderBindingContext,
): Promise<WiseProofResult> {
    if (!window.tlsn?.execCode) {
        throw new Error('TLSN extension not found. Please install the TLSNotary extension.');
    }

    const contactsBindingHash = computeOrderBindingHash(contactsCtx);
    const transferBindingHash = computeOrderBindingHash(transferCtx);

    let code = pluginCode;
    code = injectOrderBindingHash(code, contactsBindingHash);
    code = injectMerchantNameHash(code, contactsCtx.merchantNameHash);
    code = injectMerchantIdHash(code, contactsCtx.merchantIdHash);
    code = injectPayeeNameHash(code, contactsCtx.payeeNameHash);
    code = injectPayeeIdHash(code, contactsCtx.payeeIdHash);
    code = injectTransferOrderBindingHash(code, transferBindingHash);

    const resultJson = await window.tlsn.execCode(code);
    const parsed = JSON.parse(resultJson) as {
        proofs: { contacts: ExtensionProveResponse; transfer: ExtensionProveResponse };
    };

    return parsed.proofs;
}

// ── Proof submitters ───────────────────────────────────────────────────────────

/** Buyer submits contacts + transfer proofs to receive USDT (CRYPTO flow). */
export async function submitWiseCryptoProof(params: {
    merchant: Hex;
    productId: bigint;
    orderId: bigint;
    contactsProof: ContractTLSNProof;
    transferProof: ContractTLSNProof;
    provider?: any;
}): Promise<Hex> {
    const { hash } = await submitProofToContract(
        params.transferProof,
        {
            type: 'payOrderByWise',
            merchant: params.merchant,
            productId: params.productId,
            orderId: params.orderId,
            contactsProof: params.contactsProof,
        },
        params.provider,
    );
    return hash;
}

/** Merchant submits transfer proof to receive USDT after paying buyer (FIAT flow). */
export async function submitWiseFiatProof(params: {
    productId: bigint;
    orderId: bigint;
    transferProof: ContractTLSNProof;
    provider?: any;
}): Promise<Hex> {
    const { hash } = await submitProofToContract(
        params.transferProof,
        {
            type: 'receiveCryptoWithPayment',
            productId: params.productId,
            orderId: params.orderId,
        },
        params.provider,
    );
    return hash;
}

/** Build ContractTLSNProof from raw ExtensionProveResponse for Wise dual proofs. */
export function buildWiseContractProofs(raw: WiseProofResult): {
    contacts: ContractTLSNProof;
    transfer: ContractTLSNProof;
} {
    return {
        contacts: buildContractProof(raw.contacts),
        transfer: buildContractProof(raw.transfer),
    };
}
