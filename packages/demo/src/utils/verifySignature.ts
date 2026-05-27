// packages/demo/src/utils/verifySignature.ts
// Local re-verification of the verifier's ECDSA signature over a TLSN proof.
// Algorithm matches verifier/src/signing.rs and contract on-chain recovery.
//
// Pre-image (136 bytes):
//   chainId(uint64 BE, 8B)
//   || keccak256(sessionId UTF-8)         32B
//   || commitmentsHash                    32B
//   || orderBindingHash (or zeros)        32B
//   || keccak256(policyVersion) (or zeros)32B
//
// Hashing:
//   messageHash   = keccak256(preimage)
//   ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" || messageHash)
//   recover(ethSignedHash, verifierSignature) ?= verifierAddress

import {
    keccak256,
    concat,
    stringToHex,
    hashMessage,
    recoverAddress,
    numberToHex,
    type Hex,
} from 'viem';
import type { ProofExportResponse } from './proofsApi';

const ZERO32: Hex = `0x${'00'.repeat(32)}`;

function hex0x(h: string | null | undefined): Hex {
    if (!h) return ZERO32;
    return (h.startsWith('0x') ? h : `0x${h}`) as Hex;
}

export interface VerifyResult {
    /** keccak256(concat(transcriptCommitments[*].hashHex)) === proof.commitmentsHash */
    commitmentsHashMatch: boolean;
    /** Address recovered from verifierSignature (lowercase 0x). */
    recovered: Hex;
    /** recovered === proof.verifierAddress (case-insensitive). */
    addressMatch: boolean;
}

export async function verifyVerifierSignature(
    proof: ProofExportResponse,
): Promise<VerifyResult> {
    // 1. Recompute commitmentsHash from per-commitment hashHex list
    const tcs = proof.transcriptCommitments ?? [];
    const computedCH = tcs.length
        ? keccak256(concat(tcs.map((t) => hex0x(t.hashHex))))
        : ZERO32;
    const commitmentsHashMatch =
        computedCH.toLowerCase() === hex0x(proof.commitmentsHash).toLowerCase();

    // 2. Build 136-byte preimage
    const chainIdHex = numberToHex(BigInt(proof.chainId ?? 0), { size: 8 });
    const sidHash = keccak256(stringToHex(proof.attestationId));
    const obh = hex0x(proof.orderBindingHash);
    const pvh = proof.policyVersion
        ? keccak256(stringToHex(proof.policyVersion))
        : ZERO32;
    const preimage = concat([
        chainIdHex,
        sidHash,
        hex0x(proof.commitmentsHash),
        obh,
        pvh,
    ]);

    // 3. preimage → keccak256 → 32B → EIP-191 (\n32)
    //    viem.hashMessage({ raw }) prepends "\x19Ethereum Signed Message:\n<len>"
    //    where <len> = raw.length. We MUST pass a 32-byte raw so it becomes "...\n32".
    const messageHash = keccak256(preimage);
    const ethSignedHash = hashMessage({ raw: messageHash });

    // 4. ecrecover
    const recovered = await recoverAddress({
        hash: ethSignedHash,
        signature: hex0x(proof.verifierSignature),
    });

    return {
        commitmentsHashMatch,
        recovered: recovered.toLowerCase() as Hex,
        addressMatch:
            recovered.toLowerCase() === (proof.verifierAddress ?? '').toLowerCase(),
    };
}
