// Alipay C2C proof helpers for web.
//
// Flow A (Alipay-Crypto): Buyer pays CNY via Alipay → receives USDT.
// Flow B (Alipay-Fiat):   Buyer locks USDT → merchant pays CNY via Alipay → merchant receives USDT.

import { keccak256, toBytes } from 'viem';
import type { Hex, Address } from 'viem';
import {
    computeOrderBindingHash,
    injectOrderBindingHash,
    injectMerchantNameHash,
    injectMerchantIdHash,
    injectPayeeNameHash,
    injectPayeeIdHash,
    buildContractProof,
    type OrderBindingContext,
    type ExtensionProveResponse,
    type ContractTLSNProof,
} from '@/lib/proofTransformer';
import { submitProofToContract } from '@/lib/contractSubmitter';
import { chain, contractConfig } from '@/lib/contractConfig';

export const PLATFORM_ALIPAY = keccak256(toBytes('alipay')) as `0x${string}`;

// ── Context builders (synchronous — caller provides pre-fetched on-chain values) ──

export interface AlipayCryptoBindingParams {
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

/** CRYPTO flow: payee = merchant (buyer pays merchant on Alipay). */
export function makeAlipayCryptoBindingContext(params: AlipayCryptoBindingParams): OrderBindingContext {
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

export interface AlipayFiatBindingParams {
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

/** FIAT flow: payee = buyer (merchant pays CNY to buyer's Alipay account). */
export function makeAlipayFiatBindingContext(params: AlipayFiatBindingParams): OrderBindingContext {
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

/** Run the Alipay plugin (single proof — no separate contacts step). */
export async function runAlipayPlugin(
    pluginCode: string,
    ctx: OrderBindingContext,
): Promise<ExtensionProveResponse> {
    if (!window.tlsn?.execCode) {
        throw new Error('TLSN extension not found. Please install the TLSNotary extension.');
    }

    const bindingHash = computeOrderBindingHash(ctx);
    let code = pluginCode;
    code = injectOrderBindingHash(code, bindingHash);
    code = injectMerchantNameHash(code, ctx.merchantNameHash);
    code = injectMerchantIdHash(code, ctx.merchantIdHash);
    code = injectPayeeNameHash(code, ctx.payeeNameHash);
    code = injectPayeeIdHash(code, ctx.payeeIdHash);

    const resultJson = await window.tlsn.execCode(code);
    return JSON.parse(resultJson) as ExtensionProveResponse;
}

// ── Proof submitters ───────────────────────────────────────────────────────────

/** Buyer submits Alipay proof to receive USDT (CRYPTO flow). */
export async function submitAlipayCryptoProof(params: {
    merchant: Hex;
    productId: bigint;
    orderId: bigint;
    proof: ContractTLSNProof;
    provider?: any;
}): Promise<Hex> {
    const { hash } = await submitProofToContract(
        params.proof,
        {
            type: 'payOrderByAlipay',
            merchant: params.merchant,
            productId: params.productId,
            orderId: params.orderId,
        },
        params.provider,
    );
    return hash;
}

/** Merchant submits Alipay proof to receive USDT after paying buyer (FIAT flow). */
export async function submitAlipayFiatProof(params: {
    productId: bigint;
    orderId: bigint;
    proof: ContractTLSNProof;
    provider?: any;
}): Promise<Hex> {
    const { hash } = await submitProofToContract(
        params.proof,
        {
            type: 'receiveCryptoWithAlipayPayment',
            productId: params.productId,
            orderId: params.orderId,
        },
        params.provider,
    );
    return hash;
}

/** Build ContractTLSNProof from raw ExtensionProveResponse for Alipay. */
export function buildAlipayContractProof(raw: ExtensionProveResponse): ContractTLSNProof {
    return buildContractProof(raw);
}
