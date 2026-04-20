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
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommitmentEntry {
  hashHex?: string;
}

interface VerifierSignaturePayload {
  chainId: number;
  sessionId: string;
  commitmentsHash: string;    // hex without 0x
  signature: string;          // 65-byte hex without 0x (r+s+v)
  verifierAddress: string;    // 0x-prefixed
  orderBindingHash?: string;  // 0x-prefixed 32-byte hex, optional
  policyVersion?: string;     // e.g. "v1.0.0", optional
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
 * messageHash = keccak256(preimage)
 *
 * preimage = chainId(8 BE) || keccak256(sessionId)(32)
 *          || commitmentsHash(32) || orderBindingHash(32) || policyVersionHash(32)
 *          = 136 bytes total
 *
 * Mirrors the updated Rust sign_commitments() exactly:
 *   - chainId is encoded as 8 big-endian bytes (u64), NOT ABI-padded to 32
 *   - orderBindingHash defaults to [0u8;32] when absent
 *   - policyVersionHash = keccak256(policyVersion UTF-8), or [0u8;32] when absent
 */
function computeMessageHash(
  chainId: bigint,
  sessionId: string,
  commitmentsHash: `0x${string}`,
  orderBindingHash?: string | null,
  policyVersion?: string | null,
): `0x${string}` {
  // chainId as 8-byte big-endian (u64)
  const chainIdBytes = new Uint8Array(8);
  const view = new DataView(chainIdBytes.buffer);
  view.setBigUint64(0, chainId, false);

  // keccak256(sessionId as UTF-8)
  const sessionIdHash = toBytes(
    keccak256(toHex(new TextEncoder().encode(sessionId))) as `0x${string}`,
  );

  // commitmentsHash as raw 32 bytes
  const commitmentsHashBytes = toBytes(commitmentsHash);

  // orderBindingHash: 32 bytes or all-zeros
  const orderBindingBytes = orderBindingHash
    ? toBytes(normalizeHex(orderBindingHash))
    : new Uint8Array(32);

  // policyVersionHash: keccak256(policyVersion UTF-8) or all-zeros
  const policyVersionBytes = policyVersion
    ? toBytes(
        keccak256(toHex(new TextEncoder().encode(policyVersion))) as `0x${string}`,
      )
    : new Uint8Array(32);

  // Concatenate: 8 + 32 + 32 + 32 + 32 = 136 bytes
  const preimage = concatBytes([
    chainIdBytes,
    sessionIdHash,
    commitmentsHashBytes,
    orderBindingBytes,
    policyVersionBytes,
  ]);

  return keccak256(preimage);
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

  const isPlaceholder =
    transcriptCommitments.length === 0 ||
    signature === 'replace-with-real-65byte-hex' ||
    verifierAddress === '0xReplaceWithRealVerifierAddress';

  it.skipIf(isPlaceholder)('FIXTURE is populated (not placeholder)', () => {
    expect(transcriptCommitments.length).toBeGreaterThan(0);
    expect(signature).not.toBe('replace-with-real-65byte-hex');
    expect(verifierAddress).not.toBe('0xReplaceWithRealVerifierAddress');
  });

  it.skipIf(isPlaceholder)('Test 1 — recomputed commitmentsHash matches verifierSignature.commitmentsHash', () => {
    const computed = computeCommitmentsHash(transcriptCommitments);
    expect(computed.toLowerCase()).toBe(
      normalizeHex(commitmentsHash).toLowerCase(),
    );
  });

  it.skipIf(isPlaceholder)('Test 2 — ecrecover from signature restores verifierAddress (using recomputed commitmentsHash)', async () => {
    const computedCommitmentsHash = computeCommitmentsHash(transcriptCommitments);
    const messageHash = computeMessageHash(
      BigInt(chainId),
      sessionId,
      computedCommitmentsHash,
      verifierSignature.orderBindingHash,
      verifierSignature.policyVersion,
    );
    const ethSignedHash = computeEthSignedHash(messageHash);

    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(signature),
    });

    expect(recovered.toLowerCase()).toBe(verifierAddress.toLowerCase());
  });

  it.skipIf(isPlaceholder)('Test 3 — ecrecover using verifier-provided commitmentsHash also restores verifierAddress', async () => {
    const messageHash = computeMessageHash(
      BigInt(chainId),
      sessionId,
      normalizeHex(commitmentsHash),
      verifierSignature.orderBindingHash,
      verifierSignature.policyVersion,
    );
    const ethSignedHash = computeEthSignedHash(messageHash);

    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(signature),
    });

    expect(recovered.toLowerCase()).toBe(verifierAddress.toLowerCase());
  });
});

// ─── Synthetic Tests — algorithm correctness (no real session needed) ─────────

// Well-known Hardhat/Foundry test private key #0 — never use in production.
const SYNTHETIC_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
// Corresponding address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

const SYNTHETIC_COMMITMENTS: CommitmentEntry[] = [
  { hashHex: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  { hashHex: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
];

describe('Synthetic — algorithm correctness', () => {
  const account = privateKeyToAccount(SYNTHETIC_PRIVATE_KEY);

  it('Synth-1 — commitmentsHash is deterministic for fixed inputs', () => {
    const h1 = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    const h2 = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    expect(h1).toBe(h2);
    // Must be a 32-byte keccak hex
    expect(h1).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it('Synth-2 — messageHash changes when any input changes', () => {
    const base = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    const h1 = computeMessageHash(11155111n, 'session-A', base, null, 'v1.0.0');
    const h2 = computeMessageHash(11155111n, 'session-B', base, null, 'v1.0.0');
    const h3 = computeMessageHash(11155111n, 'session-A', base, null, 'v2.0.0');
    const h4 = computeMessageHash(1n,        'session-A', base, null, 'v1.0.0');
    expect(h1).not.toBe(h2); // different sessionId
    expect(h1).not.toBe(h3); // different policyVersion
    expect(h1).not.toBe(h4); // different chainId
  });

  it('Synth-3 — ecrecover restores signer address (no orderBindingHash, no policyVersion)', async () => {
    const commitmentsHash = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    const messageHash = computeMessageHash(11155111n, 'synth-session-001', commitmentsHash);
    const ethSignedHash = computeEthSignedHash(messageHash);

    const rawSig = await account.sign({ hash: ethSignedHash });
    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(rawSig),
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('Synth-4 — ecrecover restores signer address (with policyVersion)', async () => {
    const commitmentsHash = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    const messageHash = computeMessageHash(
      11155111n,
      'synth-session-002',
      commitmentsHash,
      null,
      'v1.0.0',
    );
    const ethSignedHash = computeEthSignedHash(messageHash);

    const rawSig = await account.sign({ hash: ethSignedHash });
    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(rawSig),
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('Synth-5 — ecrecover restores signer address (with orderBindingHash + policyVersion)', async () => {
    const commitmentsHash = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    const orderBindingHash =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    const messageHash = computeMessageHash(
      11155111n,
      'synth-session-003',
      commitmentsHash,
      orderBindingHash,
      'v1.0.0',
    );
    const ethSignedHash = computeEthSignedHash(messageHash);

    const rawSig = await account.sign({ hash: ethSignedHash });
    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: parseSig65(rawSig),
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('Synth-6 — wrong hash does NOT recover the signer address', async () => {
    const commitmentsHash = computeCommitmentsHash(SYNTHETIC_COMMITMENTS);
    const messageHash = computeMessageHash(11155111n, 'synth-session-004', commitmentsHash);
    const ethSignedHash = computeEthSignedHash(messageHash);

    const rawSig = await account.sign({ hash: ethSignedHash });

    // Tamper: verify against a different hash
    const wrongHash = computeEthSignedHash(
      computeMessageHash(11155111n, 'WRONG-SESSION', commitmentsHash),
    );
    const recovered = await recoverAddress({
      hash: wrongHash,
      signature: parseSig65(rawSig),
    });

    expect(recovered.toLowerCase()).not.toBe(account.address.toLowerCase());
  });
});
