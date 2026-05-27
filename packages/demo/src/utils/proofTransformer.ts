/**
 * Transforms a ProveResponse from the TLSN extension into an ABI-ready
 * TLSNProof struct that can be submitted to the smart contract.
 */

import { encodePacked, hashMessage, keccak256, recoverAddress, toBytes } from 'viem';
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
    policyVersionHash: Hex;
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
        /** Policy version string used by verifier, e.g. "v1.0.0". */
        policyVersion?: string;
        /** keccak256(policyVersion UTF-8), 0x-prefixed bytes32. */
        policyVersionHash?: string;
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
    /** Rate version snapshot taken at placeOrder time (from getOrder().rateVersion) */
    rateVersion: bigint;
    /** On-chain order deadline (o.deadline) */
    deadline: bigint;
    /** keccak256(normalize(displayName)) — merchant payer */
    merchantNameHash: Hex;
    /** keccak256(normalize(email/handle)) — merchant payer */
    merchantIdHash: Hex;
    /** keccak256(normalize(displayName)) — CRYPTO: merchant; FIAT: buyer */
    payeeNameHash: Hex;
    /** keccak256(normalize(email/handle)) — CRYPTO: merchant; FIAT: buyer */
    payeeIdHash: Hex;
    /** Buyer address (lowercase 0x-hex) — auditor scoping: owner = initiator */
    ownerAddress?: Hex;
    /** Merchant address (lowercase 0x-hex) — auditor scoping: counterparty */
    counterpartyAddress?: Hex;
    /** Platform tenant id: 'wise' | 'alipay' (plaintext, not hashed) */
    tenantId?: 'wise' | 'alipay';
}

/**
 * Compute the orderBindingHash that the TLSN verifier server signs.
 * Must match _computeOrderBindingHash() in C2CEscrow.sol exactly.
 *
 * Encoding: abi.encodePacked(
 *   address(escrow), uint64(chainId),
 *   address(merchant), address(buyer),
 *   uint256(productId), uint256(orderId),
 *   uint8(assetType), uint256(amount), uint256(rate),
 *   uint32(rateVersion),   ← inserted between rate and deadline
 *   uint256(deadline),
 *   bytes32(merchantNameHash), bytes32(merchantIdHash),
 *   bytes32(payeeNameHash),    bytes32(payeeIdHash))
 */
export function computeOrderBindingHash(ctx: OrderBindingContext): Hex {
    return keccak256(
        encodePacked(
            [
                'address', 'uint64',
                'address', 'address',
                'uint256', 'uint256',
                'uint8', 'uint256', 'uint256',
                'uint32',   // rateVersion — between rate and deadline
                'uint256',
                'bytes32', 'bytes32',
                'bytes32', 'bytes32',
            ],
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
                Number(ctx.rateVersion), // uint32 — safe because version is small
                ctx.deadline,
                ctx.merchantNameHash,
                ctx.merchantIdHash,
                ctx.payeeNameHash,
                ctx.payeeIdHash,
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
export const ZERO_HASH_32: Hex =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

export const ORDER_BINDING_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000001';

export const MERCHANT_NAME_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000002';

export const MERCHANT_ID_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000003';

export const PAYEE_NAME_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000004';

export const PAYEE_ID_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000005';

export const TRANSFER_ORDER_BINDING_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000006';

export const OWNER_ADDRESS_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000007';

export const COUNTERPARTY_ADDRESS_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000008';

export const TENANT_ID_SENTINEL = '__TLSN_TENANT_ID_SENTINEL__';

export function injectOrderBindingHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(ORDER_BINDING_HASH_SENTINEL)) {
        console.warn('[injectOrderBindingHash] sentinel not found in plugin code — orderBindingHash not injected');
        return pluginCode;
    }
    return pluginCode.replace(ORDER_BINDING_HASH_SENTINEL, hash);
}

export function injectMerchantNameHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(MERCHANT_NAME_HASH_SENTINEL)) {
        console.warn('[injectMerchantNameHash] sentinel not found in plugin code');
        return pluginCode;
    }
    return pluginCode.replace(MERCHANT_NAME_HASH_SENTINEL, hash);
}

export function injectMerchantIdHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(MERCHANT_ID_HASH_SENTINEL)) {
        console.warn('[injectMerchantIdHash] sentinel not found in plugin code');
        return pluginCode;
    }
    return pluginCode.replace(MERCHANT_ID_HASH_SENTINEL, hash);
}

export function injectPayeeNameHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(PAYEE_NAME_HASH_SENTINEL)) {
        console.warn('[injectPayeeNameHash] sentinel not found in plugin code');
        return pluginCode;
    }
    return pluginCode.replace(PAYEE_NAME_HASH_SENTINEL, hash);
}

export function injectPayeeIdHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(PAYEE_ID_HASH_SENTINEL)) {
        console.warn('[injectPayeeIdHash] sentinel not found in plugin code');
        return pluginCode;
    }
    return pluginCode.replace(PAYEE_ID_HASH_SENTINEL, hash);
}

export function injectTransferOrderBindingHash(pluginCode: string, hash: Hex): string {
    if (!pluginCode.includes(TRANSFER_ORDER_BINDING_HASH_SENTINEL)) {
        console.warn('[injectTransferOrderBindingHash] sentinel not found in plugin code');
        return pluginCode;
    }
    return pluginCode.replace(TRANSFER_ORDER_BINDING_HASH_SENTINEL, hash);
}

export function injectOwnerAddress(pluginCode: string, owner: Hex): string {
    return pluginCode.includes(OWNER_ADDRESS_SENTINEL)
        ? pluginCode.replace(OWNER_ADDRESS_SENTINEL, owner.toLowerCase())
        : pluginCode;
}

export function injectCounterpartyAddress(pluginCode: string, addr: Hex): string {
    return pluginCode.includes(COUNTERPARTY_ADDRESS_SENTINEL)
        ? pluginCode.replace(COUNTERPARTY_ADDRESS_SENTINEL, addr.toLowerCase())
        : pluginCode;
}

export function injectTenantId(pluginCode: string, tenantId?: string): string {
    if (tenantId) {
        return pluginCode.replace(TENANT_ID_SENTINEL, tenantId);
    }
    // D-2: 没值时把整行从 sessionData 删掉,避免哨兵字面值入库
    return pluginCode.replace(
        /^\s*__tlsn_tenant_id:\s*['"]__TLSN_TENANT_ID_SENTINEL__['"],?\s*\n/m,
        '',
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureHexPrefix(hex: string): Hex {
    return (hex.startsWith('0x') ? hex : `0x${hex}`) as Hex;
}

function isBytes32Hex(value: string): value is Hex {
    return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function resolvePolicyVersionHash(sig: NonNullable<ExtensionProveResponse['verifierSignature']>): {
    policyVersionHash: Hex;
    policyVersion?: string;
} {
    const policyVersion = sig.policyVersion?.trim();
    const rawPolicyHash = sig.policyVersionHash?.trim();

    let providedHash: Hex | undefined;
    if (rawPolicyHash) {
        const normalized = ensureHexPrefix(rawPolicyHash);
        if (!isBytes32Hex(normalized)) {
            throw new Error(
                `verifierSignature.policyVersionHash must be a valid bytes32 hex string, got: ${rawPolicyHash}`,
            );
        }
        providedHash = normalized.toLowerCase() as Hex;
    }

    if (providedHash && policyVersion) {
        const computed = keccak256(toBytes(policyVersion)).toLowerCase() as Hex;
        if (computed !== providedHash) {
            throw new Error(
                [
                    'Policy version signature mismatch.',
                    `policyVersion=${policyVersion}`,
                    `computedHash=${computed}`,
                    `providedHash=${providedHash}`,
                ].join(' '),
            );
        }
        return { policyVersionHash: providedHash, policyVersion };
    }

    if (providedHash) {
        return { policyVersionHash: providedHash, policyVersion };
    }

    if (policyVersion) {
        return {
            policyVersionHash: keccak256(toBytes(policyVersion)).toLowerCase() as Hex,
            policyVersion,
        };
    }

    throw new Error(
        'Missing verifier policy metadata: neither verifierSignature.policyVersionHash nor verifierSignature.policyVersion is present.',
    );
}

function mapDirection(dir: string): string {
    // Extension outputs "SENT"/"RECV", contract tests use "Sent"/"Recv"
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
    const { policyVersionHash } = resolvePolicyVersionHash(sig);

    const revealedItems = response.results.map((r) => ({
        handlerType: r.type,
        part: r.part,
        value: r.value,
        commitment_index: BigInt(r.commitmentIndex ?? 0),
        start_item: BigInt(r.start ?? 0),
        end_item: BigInt(r.end ?? 0),
        start_value: BigInt(r.startValue ?? 0),
        end_value: BigInt(r.endValue ?? r.value?.length ?? 0),
    }));

    const commitmentOpenings = response.transcriptCommitOpenings.map((o) => ({
        blinderHex: ensureHexPrefix(o.blinderHex),
    }));

    const commitments = response.transcriptCommitments.map((c) => ({
        direction: mapDirection(c.direction ?? 'RECV'),
        hashAlg: c.hashAlg ?? 'Keccak256',
        hashValue: ensureHexPrefix(c.hashHex ?? ''),
    }));

    return {
        chainId: BigInt(sig.chainId ?? 0),
        sessionId: sig.sessionId,
        commitmentsHash: ensureHexPrefix(sig.commitmentsHash),
        orderBindingHash: ensureHexPrefix(sig.orderBindingHash ?? ''),
        policyVersionHash,
        verifierSignature: ensureHexPrefix(sig.signature),
        revealedItems,
        commitmentOpenings,
        commitments,
        serverName: response.serverName ?? '',
    };
}

export interface ProofDebugSnapshot {
    sessionId: string;
    chainId: string;
    orderBindingHash: Hex;
    policyVersion?: string;
    policyVersionHash: Hex;
    recoveredSigner?: Hex;
    recoveryError?: string;
}

export async function recoverVerifierSignerFromProof(proof: ContractTLSNProof): Promise<Hex> {
    const sessionIdHash = keccak256(toBytes(proof.sessionId));
    const messageHash = keccak256(
        encodePacked(
            ['uint64', 'bytes32', 'bytes32', 'bytes32', 'bytes32'],
            [
                proof.chainId,
                sessionIdHash,
                proof.commitmentsHash,
                proof.orderBindingHash,
                proof.policyVersionHash,
            ],
        ),
    );
    const ethSignedMessageHash = hashMessage({ raw: messageHash });
    const recovered = await recoverAddress({
        hash: ethSignedMessageHash,
        signature: proof.verifierSignature,
    });
    return recovered.toLowerCase() as Hex;
}

export async function buildProofDebugSnapshot(response: ExtensionProveResponse): Promise<ProofDebugSnapshot> {
    const sig = response.verifierSignature;
    if (!sig) {
        throw new Error('Cannot build proof diagnostics: verifierSignature is missing.');
    }
    const contractProof = buildContractProof(response);
    const snapshot: ProofDebugSnapshot = {
        sessionId: contractProof.sessionId,
        chainId: contractProof.chainId.toString(),
        orderBindingHash: contractProof.orderBindingHash,
        policyVersion: sig.policyVersion,
        policyVersionHash: contractProof.policyVersionHash,
    };
    try {
        snapshot.recoveredSigner = await recoverVerifierSignerFromProof(contractProof);
    } catch (err) {
        snapshot.recoveryError = (err as any)?.message ?? String(err);
    }
    return snapshot;
}
