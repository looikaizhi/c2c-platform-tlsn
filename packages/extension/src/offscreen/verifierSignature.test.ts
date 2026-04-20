/**
 * Verifier Signature Verification Test
 *
 * Verifies that the secp256k1 signature returned by the Verifier in
 * `verifierSignature` is authentic and covers all transcript commitment hashes.
 *
 * How to run:
 *   cd packages/extension && npx vitest run src/offscreen/verifierSignature.test.ts
 *
 * How to populate FIXTURE:
 *   1. Start Verifier with VERIFIER_PRIVATE_KEY set
 *   2. Run Wise plugin prove() in Chrome
 *   3. Copy the session_completed JSON from Offscreen DevTools console
 *   4. Paste the relevant fields into FIXTURE below
 */

import { describe, it, expect } from 'vitest';
import {
  keccak256,
  concatBytes,
  toBytes,
  toHex,
  recoverAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommitmentEntry {
  hashHex?: string;
}

interface VerifierSignaturePayload {
  chainId: number;
  sessionId: string;
  commitmentsHash: string; // hex without 0x
  signature: string; // 65-byte hex without 0x (r+s+v)
  verifierAddress: string; // 0x-prefixed
}

// ─── Fixture — paste real data from session_completed here ────────────────────

const FIXTURE: {
  transcriptCommitments: CommitmentEntry[];
  verifierSignature: VerifierSignaturePayload;
} = {
  transcriptCommitments: [
    // Example — replace with actual data:
    // { hashHex: 'abc123...' },
    // { hashHex: 'def456...' },
  ],
  verifierSignature: {
    // Example — replace with actual data:
    chainId: 11155111,
    sessionId: 'replace-with-real-session-id',
    commitmentsHash: 'replace-with-real-hash',
    signature: 'replace-with-real-65byte-hex',
    verifierAddress: '0xReplaceWithRealVerifierAddress',
  },
};

// ─── Helpers — must mirror the Rust implementation exactly ───────────────────

function normalizeHex(h: string): `0x${string}` {
  return (h.startsWith('0x') ? h : `0x${h}`) as `0x${string}`;
}

/**
 * commitmentsHash = keccak256(hashHex[0] || hashHex[1] || ...)
 * Each hashHex is a 32-byte keccak256 output → fixed length, no ambiguity.
 */
function computeCommitmentsHash(entries: CommitmentEntry[]): `0x${string}` {
  const parts = entries
    .filter((e) => e.hashHex)
    .map((e) => toBytes(normalizeHex(e.hashHex!)));
  const concatenated = concatBytes(parts);
  return keccak256(concatenated);
}

/**
 * messageHash = keccak256(chainId_u256_be32 || keccak256(sessionId) || commitmentsHash)
 * Matches Rust: abi.encode(uint256, bytes32, bytes32) = 3 × 32-byte words.
 */
function computeMessageHash(
  chainId: bigint,
  sessionId: string,
  commitmentsHash: `0x${string}`,
): `0x${string}` {
  const sessionIdHash = keccak256(
    toHex(new TextEncoder().encode(sessionId)),
  ) as `0x${string}`;

  return keccak256(
    encodeAbiParameters(parseAbiParameters('uint256, bytes32, bytes32'), [
      chainId,
      sessionIdHash,
      commitmentsHash,
    ]),
  );
}

/**
 * ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" || messageHash)
 * Equivalent to viem's hashMessage but operating on a bytes32 directly.
 */
function computeEthSignedHash(messageHash: `0x${string}`): `0x${string}` {
  const prefix = new TextEncoder().encode('\x19Ethereum Signed Message:\n32');
  const msgBytes = toBytes(messageHash);
  return keccak256(concatBytes([prefix, msgBytes]));
}

/**
 * Parse a 65-byte signature hex (r+s+v) into { r, s, v } for recoverAddress.
 */
function parseSig65(sigHex: string): {
  r: `0x${string}`;
  s: `0x${string}`;
  v: bigint;
} {
  const bytes = toBytes(normalizeHex(sigHex));
  if (bytes.length !== 65) {
    throw new Error(`Expected 65-byte signature, got ${bytes.length}`);
  }
  return {
    r: toHex(bytes.slice(0, 32)) as `0x${string}`,
    s: toHex(bytes.slice(32, 64)) as `0x${string}`,
    v: BigInt(bytes[64]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VerifierSignature', () => {
  const { transcriptCommitments, verifierSignature } = FIXTURE;
  const {
    chainId,
    sessionId,
    commitmentsHash,
    signature,
    verifierAddress,
  } = verifierSignature;

  it('FIXTURE is populated (not placeholder)', () => {
    expect(transcriptCommitments.length).toBeGreaterThan(0);
    expect(signature).not.toBe('replace-with-real-65byte-hex');
    expect(verifierAddress).not.toBe('0xReplaceWithRealVerifierAddress');
  });

  it('Test 1 — recomputed commitmentsHash matches verifierSignature.commitmentsHash', () => {
    const computed = computeCommitmentsHash(transcriptCommitments);
    expect(computed.toLowerCase()).toBe(
      normalizeHex(commitmentsHash).toLowerCase(),
    );
  });

  it('Test 2 — ecrecover from signature restores verifierAddress (using recomputed commitmentsHash)', async () => {
    const computedCommitmentsHash = computeCommitmentsHash(transcriptCommitments);
    const messageHash = computeMessageHash(
      BigInt(chainId),
      sessionId,
      computedCommitmentsHash,
    );
    const ethSignedHash = computeEthSignedHash(messageHash);

    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(signature),
    });

    expect(recovered.toLowerCase()).toBe(verifierAddress.toLowerCase());
  });

  it('Test 3 — ecrecover using verifier-provided commitmentsHash also restores verifierAddress', async () => {
    const messageHash = computeMessageHash(
      BigInt(chainId),
      sessionId,
      normalizeHex(commitmentsHash),
    );
    const ethSignedHash = computeEthSignedHash(messageHash);

    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(signature),
    });

    expect(recovered.toLowerCase()).toBe(verifierAddress.toLowerCase());
  });
});
