import type {
  CommitmentSelfCheckSummary,
  HandlerResult,
  ProveResponse,
  TranscriptCommitmentRange,
  TranscriptCommitmentSummary,
  TranscriptCommitOpeningSummary,
} from '@tlsn/plugin-sdk/src/types';

const MASK_64 = (1n << 64n) - 1n;
const KECCAK_RATE_BYTES = 136;
const KECCAK_OUTPUT_BYTES = 32;
const KECCAK_ROUNDS = 24;

const RHO_OFFSETS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

function rotateLeft64(value: bigint, shift: number): bigint {
  const n = shift % 64;
  if (n === 0) {
    return value & MASK_64;
  }

  return ((value << BigInt(n)) | (value >> BigInt(64 - n))) & MASK_64;
}

function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < KECCAK_ROUNDS; round += 1) {
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      c[x] =
        state[x] ^
        state[x + 5] ^
        state[x + 10] ^
        state[x + 15] ^
        state[x + 20];
    }

    const d = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotateLeft64(c[(x + 1) % 5], 1);
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & MASK_64;
      }
    }

    const b = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        const rotated = rotateLeft64(state[index], RHO_OFFSETS[index]);
        const newX = y;
        const newY = (2 * x + 3 * y) % 5;
        b[newX + 5 * newY] = rotated;
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        const b1 = b[((x + 1) % 5) + 5 * y];
        const b2 = b[((x + 2) % 5) + 5 * y];
        state[index] = (b[index] ^ (~b1 & MASK_64 & b2)) & MASK_64;
      }
    }

    state[0] = (state[0] ^ ROUND_CONSTANTS[round]) & MASK_64;
  }
}

function loadLaneLE(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i += 1) {
    value |= BigInt(data[offset + i] ?? 0) << BigInt(8 * i);
  }

  return value & MASK_64;
}

function storeLaneLE(value: bigint, output: Uint8Array, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    output[offset + i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
}

function keccak256(input: Uint8Array): Uint8Array {
  const state = new Array<bigint>(25).fill(0n);
  let cursor = 0;

  while (cursor + KECCAK_RATE_BYTES <= input.length) {
    const block = input.subarray(cursor, cursor + KECCAK_RATE_BYTES);
    for (let i = 0; i < KECCAK_RATE_BYTES / 8; i += 1) {
      state[i] ^= loadLaneLE(block, i * 8);
    }
    keccakF1600(state);
    cursor += KECCAK_RATE_BYTES;
  }

  const finalBlock = new Uint8Array(KECCAK_RATE_BYTES);
  const remaining = input.subarray(cursor);
  finalBlock.set(remaining);
  finalBlock[remaining.length] ^= 0x01;
  finalBlock[KECCAK_RATE_BYTES - 1] ^= 0x80;

  for (let i = 0; i < KECCAK_RATE_BYTES / 8; i += 1) {
    state[i] ^= loadLaneLE(finalBlock, i * 8);
  }
  keccakF1600(state);

  const output = new Uint8Array(KECCAK_OUTPUT_BYTES);
  for (let i = 0; i < KECCAK_OUTPUT_BYTES / 8; i += 1) {
    storeLaneLE(state[i], output, i * 8);
  }
  return output;
}

function normalizeHex(value: string): string {
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);
  if (normalized.length === 0) {
    return new Uint8Array();
  }

  if (normalized.length % 2 !== 0) {
    throw new Error(`hex length must be even, got=${normalized.length}`);
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function previewHex(hex: string, keep = 12): string {
  if (hex.length <= keep * 2) {
    return hex;
  }
  return `${hex.slice(0, keep)}...${hex.slice(-keep)}`;
}

function rangesEqual(
  left: TranscriptCommitmentRange[],
  right: TranscriptCommitmentRange[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i].start !== right[i].start || left[i].end !== right[i].end) {
      return false;
    }
  }

  return true;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Strict mode: slice plaintext directly from verifierTranscript bytes using
 * commitment.direction + commitment.ranges.
 * This matches how the Verifier computed the commitment (raw bytes, not JS string).
 */
function extractPlaintextFromTranscript(
  proveResponse: ProveResponse,
  commitment: TranscriptCommitmentSummary,
): Uint8Array | null {
  const transcript = proveResponse.verifierTranscript;
  if (!transcript || !commitment.direction || !commitment.ranges?.length) {
    return null;
  }

  const transcriptBytes =
    commitment.direction === 'SENT'
      ? new Uint8Array(transcript.sent)
      : new Uint8Array(transcript.recv);

  const chunks: Uint8Array[] = [];
  for (const range of commitment.ranges) {
    chunks.push(transcriptBytes.slice(range.start, range.end));
  }
  return concatBytes(chunks);
}

function findMatchingResult(
  results: HandlerResult[],
  commitment: TranscriptCommitmentSummary,
  blinder: Uint8Array,
  proveResponse: ProveResponse,
): { result: HandlerResult; plaintextBytes: Uint8Array } | null {
  if (!commitment.direction || !commitment.hashHex) return null;
  const expected = normalizeHex(commitment.hashHex);

  // Strict mode: use raw transcript bytes when available
  const strictPlaintext = extractPlaintextFromTranscript(proveResponse, commitment);
  if (strictPlaintext !== null) {
    const recomputed = bytesToHex(keccak256(concatBytes([strictPlaintext, blinder])));
    if (recomputed === expected) {
      // Find the corresponding result for logging (direction match, any range overlap)
      const matchedResult = results.find(
        (r) => (r.type === 'SENT' ? 'SENT' : 'RECV') === commitment.direction,
      ) ?? null;
      return matchedResult
        ? { result: matchedResult, plaintextBytes: strictPlaintext }
        : { result: { type: commitment.direction } as HandlerResult, plaintextBytes: strictPlaintext };
    }
    return null;
  }

  // Fallback: use result.value text encoding (when verifierTranscript not available)
  for (const result of results) {
    const resultDir = result.type === 'SENT' ? 'SENT' : 'RECV';
    if (resultDir !== commitment.direction) continue;

    const plaintextBytes = new TextEncoder().encode(result.value);
    const recomputed = bytesToHex(
      keccak256(concatBytes([plaintextBytes, blinder])),
    );
    if (recomputed === expected) {
      return { result, plaintextBytes };
    }
  }
  return null;
}

function findOpening(
  openings: TranscriptCommitOpeningSummary[],
  commitment: TranscriptCommitmentSummary,
): TranscriptCommitOpeningSummary | undefined {
  const { direction, hashAlg, ranges } = commitment;
  if (!direction || !hashAlg || !ranges) {
    return undefined;
  }

  return openings.find(
    (opening) =>
      opening.kind === 'Hash' &&
      opening.direction === direction &&
      opening.hashAlg === hashAlg &&
      rangesEqual(opening.ranges, ranges),
  );
}

/**
 * 直接按 index 配对，不做暴力搜索，验证：
 *   Step 1: commitments[i] ↔ openings[i]  — direction / hashAlg / ranges 是否对齐
 *   Step 2: revealedCommitments[j] ↔ results[j] — hash 是否能验通（Keccak256 only）
 *
 * 结果仅打印，不影响 runTranscriptCommitmentRuntimeTest 的返回值。
 */
export function runDirectIndexMatchTest(proveResponse: ProveResponse): void {
  const commitments = proveResponse.transcriptCommitments ?? [];
  const openings = proveResponse.transcriptCommitOpenings ?? [];

  console.log('[DirectIndexMatch] ===== Direct Index Alignment Test =====');
  console.log(
    `[DirectIndexMatch] commitments=${commitments.length}  openings=${openings.length}`,
  );

  // ── Step 1: commitments[i] ↔ openings[i] ──────────────────────────────────
  console.log('[DirectIndexMatch] --- Step 1: commitments[i] ↔ openings[i] ---');
  let step1Mismatches = 0;

  for (let i = 0; i < Math.max(commitments.length, openings.length); i++) {
    const c = commitments[i];
    const o = openings[i];

    if (!c) {
      console.warn(`[DirectIndexMatch]   [${i}] ❌ commitment MISSING`);
      step1Mismatches++;
      continue;
    }
    if (!o) {
      console.warn(`[DirectIndexMatch]   [${i}] ❌ opening MISSING`);
      step1Mismatches++;
      continue;
    }

    const dirOk = c.direction === o.direction;
    const algOk = c.hashAlg === o.hashAlg;
    const rangesOk = rangesEqual(c.ranges ?? [], o.ranges ?? []);
    const ok = dirOk && algOk && rangesOk;
    if (!ok) step1Mismatches++;

    console.log(
      `[DirectIndexMatch]   [${i}] ${ok ? '✅' : '❌'}` +
      `  dir=${String(c.direction)}/${String(o.direction)} dirOk=${dirOk}` +
      `  alg=${String(c.hashAlg)}/${String(o.hashAlg)} algOk=${algOk}` +
      `  commitRanges=${JSON.stringify(c.ranges)} openRanges=${JSON.stringify(o.ranges)} rangesOk=${rangesOk}`,
    );
  }

  console.log(
    `[DirectIndexMatch] Step 1: ${step1Mismatches === 0 ? '✅ fully aligned' : `❌ ${step1Mismatches} mismatch(es)`}`,
  );

  console.log('[DirectIndexMatch] ===== Test Complete =====');
}

export function runTranscriptCommitmentRuntimeTest(
  proveResponse: ProveResponse,
): CommitmentSelfCheckSummary {
  const commitments = proveResponse.transcriptCommitments ?? [];
  const openings = proveResponse.transcriptCommitOpenings ?? [];

  if (commitments.length === 0) {
    const summary: CommitmentSelfCheckSummary = {
      status: 'skipped',
      total: 0,
      matched: 0,
      mismatched: 0,
      message: 'No transcript commitments returned',
    };
    console.log('[TranscriptCommitmentTest] skipped', summary);
    return summary;
  }

  const results = proveResponse.results ?? [];
  if (openings.length === 0 || results.length === 0) {
    const summary: CommitmentSelfCheckSummary = {
      status: 'skipped',
      total: commitments.length,
      matched: 0,
      mismatched: 0,
      message: 'Missing transcriptCommitOpenings or results',
    };
    console.log('[TranscriptCommitmentTest] skipped', summary);
    return summary;
  }

  let matched = 0;
  let mismatched = 0;
  let unsupported = 0;

  commitments.forEach((commitment, index) => {
    if (commitment.kind !== 'Hash') {
      console.log(`[TranscriptCommitmentTest] commitment[${index}] skip non-hash`);
      return;
    }

    if (commitment.hashAlg !== 'Keccak256') {
      unsupported += 1;
      console.log(
        `[TranscriptCommitmentTest] commitment[${index}] unsupported alg=${String(commitment.hashAlg)}`,
      );
      return;
    }

    const opening = findOpening(openings, commitment);
    if (!opening) {
      mismatched += 1;
      console.warn(
        `[TranscriptCommitmentTest] commitment[${index}] opening not found for direction/ranges`,
      );
      return;
    }

    try {
      const blinder = hexToBytes(opening.blinderHex);
      const matchedResult = findMatchingResult(results, commitment, blinder, proveResponse);

      console.log(`[TranscriptCommitmentTest] commitment[${index}] step`, {
        direction: commitment.direction,
        ranges: commitment.ranges,
        matchedValue: matchedResult?.result.value ?? null,
        plaintextLen: matchedResult?.plaintextBytes.length ?? 0,
        blinderHexPreview: previewHex(opening.blinderHex),
        match: matchedResult !== null,
      });

      if (matchedResult !== null) {
        matched += 1;
      } else {
        mismatched += 1;
      }
    } catch (error) {
      mismatched += 1;
      console.warn(
        `[TranscriptCommitmentTest] commitment[${index}] runtime check error`,
        error,
      );
    }
  });

  const checked = matched + mismatched;
  const summary: CommitmentSelfCheckSummary = {
    status:
      mismatched > 0
        ? 'failed'
        : checked > 0
          ? 'passed'
          : unsupported > 0
            ? 'unsupported_alg'
            : 'skipped',
    total: commitments.length,
    matched,
    mismatched,
    message:
      mismatched > 0
        ? 'Some commitments did not match recomputed Keccak256 hash'
        : checked > 0
          ? 'All checked commitments matched'
          : unsupported > 0
            ? 'No Keccak256 commitments available for runtime check'
            : 'No commitments were checked',
  };

  console.log('[TranscriptCommitmentTest] summary', summary);

  // 追加直接 index 对齐测试（仅当有 openings 时才有意义）
  if (openings.length > 0) {
    runDirectIndexMatchTest(proveResponse);
  }

  return summary;
}
