/**
 * Transforms a ProveResponse from the TLSN extension into an ABI-ready
 * TLSNProof struct that can be submitted to the smart contract.
 */

import { keccak256, encodePacked } from 'viem';
import type { Hex } from 'viem';

// ── Types matching the contract's TLSNProof struct ──

export interface ContractTLSNProof {
    chainId: bigint;
    sessionId: string;
    commitmentsHash: Hex;
    /**
     * keccak256(abi.encodePacked(escrow, chainId, merchant, buyer, productId, orderId, assetType, amount, rate, deadline))
     * Must match the binding hash signed by the TLSN verifier server.
     */
    orderBindingHash: Hex;
    verifierSignature: Hex;
    revealedItems: Array<{
        handlerType: string;
        part: string;
        value: string;
        commitment_index: bigint;
        start_item: bigint;
        end_item: bigint;
        start_value: bigint;
        end_value: bigint;
    }>;
    commitmentOpenings: Array<{ blinderHex: Hex }>;
    commitments: Array<{
        direction: string;
        hashAlg: string;
        hashValue: Hex;
    }>;
    serverName: string;
}

// ── Extension ProveResponse types (subset needed for transformation) ──

export interface ExtensionProveResponse {
    results: Array<{
        type: string;
        part: string;
        value: string;
        commitmentIndex: number;
        start: number;
        end: number;
        startValue: number;
        endValue: number;
    }>;
    transcriptCommitments: Array<{
        kind: string;
        direction?: string;
        hashAlg?: string;
        hashHex?: string;
    }>;
    transcriptCommitOpenings?: Array<{
        blinderHex: string;
    }>;
    verifierSignature?: {
        chainId: number;
        sessionId: string;
        commitmentsHash: string;
        /** Order-binding hash echoed from verifier (0x-prefixed). Present when plugin passed it in sessionData. */
        orderBindingHash?: string;
        signature: string;
        verifierAddress: string;
    };
    serverName?: string;
}

// ── Order binding context ──────────────────────────────────────────────────────

export interface OrderBindingContext {
    escrowAddress: Hex;
    chainId: number;
    merchant: Hex;
    buyer: Hex;
    productId: bigint;
    orderId: bigint;
    /** 0 = CRYPTO, 1 = FIAT */
    assetType: number;
    amount: bigint;
    rate: bigint;
    /** On-chain order deadline (o.deadline), NOT the EIP-712 signing deadline */
    deadline: bigint;
}

/**
 * Compute the orderBindingHash that the TLSN verifier server signs.
 * Must match _computeOrderBindingHash() in C2CEscrow.sol exactly.
 *
 * Encoding: abi.encodePacked(address(escrow), uint64(chainId),
 *           address(merchant), address(buyer),
 *           uint256(productId), uint256(orderId),
 *           uint8(assetType), uint256(amount), uint256(rate), uint256(deadline))
 */
export function computeOrderBindingHash(ctx: OrderBindingContext): Hex {
    return keccak256(
        encodePacked(
            ['address', 'uint64', 'address', 'address', 'uint256', 'uint256', 'uint8', 'uint256', 'uint256', 'uint256'],
            [
                ctx.escrowAddress,
                BigInt(ctx.chainId),
                ctx.merchant,
                ctx.buyer,
                ctx.productId,
                ctx.orderId,
                ctx.assetType,
                ctx.amount,
                ctx.rate,
                ctx.deadline,
            ],
        ),
    );
}

/**
 * Inject the orderBindingHash into a compiled plugin's JS code before execution.
 *
 * Plugins declare a sentinel constant:
 *   const ORDER_BINDING_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
 *
 * This function replaces the sentinel value with the real hash so the plugin
 * passes it to prove() → verifier via sessionData["__tlsn_order_binding_hash"].
 */
export const ORDER_BINDING_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

export function injectOrderBindingHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(ORDER_BINDING_HASH_SENTINEL)) {
        console.warn('[injectOrderBindingHash] sentinel not found in plugin code — orderBindingHash not injected');
        return pluginCode;
    }
    return pluginCode.replaceAll(ORDER_BINDING_HASH_SENTINEL, hash);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureHexPrefix(hex: string): Hex {
    return (hex.startsWith('0x') ? hex : `0x${hex}`) as Hex;
}

function mapDirection(dir: string): string {
    if (dir === 'RECV') return 'Recv';
    if (dir === 'SENT') return 'Sent';
    return dir;
}

export function buildContractProof(response: ExtensionProveResponse): ContractTLSNProof {
    if (!response.verifierSignature) {
        throw new Error(
            'verifierSignature is missing. ' +
            'Ensure transcriptCommitHashAlg is set in proverOptions, ' +
            'and the Verifier server has VERIFIER_PRIVATE_KEY configured.',
        );
    }
    if (!response.transcriptCommitOpenings?.length) {
        throw new Error(
            'transcriptCommitOpenings is empty. ' +
            'Ensure transcriptCommitDebug.exposeOpenings is true in proverOptions.',
        );
    }
    if (!response.verifierSignature.orderBindingHash) {
        throw new Error(
            'verifierSignature.orderBindingHash is missing. ' +
            'Ensure the plugin was executed with injectOrderBindingHash() before calling execCode().',
        );
    }

    const sig = response.verifierSignature;

    return {
        chainId: BigInt(sig.chainId),
        sessionId: sig.sessionId,
        commitmentsHash: ensureHexPrefix(sig.commitmentsHash),
        orderBindingHash: ensureHexPrefix(sig.orderBindingHash),
        verifierSignature: ensureHexPrefix(sig.signature),
        revealedItems: response.results.map((r) => ({
            handlerType: r.type,
            part: r.part,
            value: r.value,
            commitment_index: BigInt(r.commitmentIndex),
            start_item: BigInt(r.start),
            end_item: BigInt(r.end),
            start_value: BigInt(r.startValue),
            end_value: BigInt(r.endValue),
        })),
        commitmentOpenings: response.transcriptCommitOpenings.map((o) => ({
            blinderHex: ensureHexPrefix(o.blinderHex),
        })),
        commitments: response.transcriptCommitments.map((c) => ({
            direction: mapDirection(c.direction ?? 'RECV'),
            hashAlg: c.hashAlg ?? 'Keccak256',
            hashValue: ensureHexPrefix(c.hashHex ?? ''),
        })),
        serverName: response.serverName ?? '',
    };
}
