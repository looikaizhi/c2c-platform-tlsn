/**
 * Standalone Terminal Test: Transcript Commitment Keccak256 Verification
 *
 * Purpose:
 *   Verify that keccak256(plaintext || blinder) == commitment.hashHex
 *   using real ProveResponse data captured from the Wise plugin.
 *
 * How to run:
 *   npx tsx packages/extension/src/offscreen/test.ts
 *   npx tsx packages/extension/src/offscreen/test.ts ./fixtures/wise_prove_response.json
 *
 * How to capture real fixture data:
 *   1. Enable transcriptCommitDebug flags in wise.plugin.ts (already done)
 *   2. Run the plugin in Chrome, open Offscreen DevTools console
 *   3. The plugin logs '[wise] prove ok' — copy the full ProveResponse JSON
 *      (look for console.log output from [TranscriptCommitmentTest] lines)
 *   4. Save as packages/extension/src/offscreen/fixtures/wise_prove_response.json
 *   5. Run this script
 */

import * as fs from 'fs';
import * as path from 'path';
import { runTranscriptCommitmentRuntimeTest } from './transcriptCommitment.runtimeTest';
import type { ProveResponse } from '@tlsn/plugin-sdk/src/types';

// ─── Step 1: Load fixture ────────────────────────────────────────────────────

const fixtureArg = process.argv[2];
const defaultFixture = path.join(
  __dirname,
  'fixtures',
  'wise_prove_response.json',
);
const fixturePath = fixtureArg
  ? path.resolve(process.cwd(), fixtureArg)
  : defaultFixture;

console.log('');
console.log('='.repeat(60));
console.log('  TLSN Commitment Keccak256 Verification — Terminal Test');
console.log('='.repeat(60));
console.log('');
console.log(`[Step 1] Loading fixture from: ${fixturePath}`);

let proveResponse: ProveResponse;

try {
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  proveResponse = JSON.parse(raw) as ProveResponse;
  console.log(`[Step 1] OK — loaded ProveResponse`);
  console.log(
    `         transcriptCommitments : ${proveResponse.transcriptCommitments?.length ?? 0}`,
  );
  console.log(
    `         transcriptCommitOpenings: ${proveResponse.transcriptCommitOpenings?.length ?? 0}`,
  );
  console.log(
    `         verifierTranscript.sent  : ${proveResponse.verifierTranscript?.sent?.length ?? 'missing'} bytes`,
  );
  console.log(
    `         verifierTranscript.recv  : ${proveResponse.verifierTranscript?.recv?.length ?? 'missing'} bytes`,
  );
} catch (err) {
  console.error('[Step 1] FAILED — could not load fixture:', err);
  console.error('');
  console.error('To generate a fixture:');
  console.error(
    '  1. Run the Wise plugin in Chrome (with transcriptCommitDebug enabled)',
  );
  console.error(
    '  2. Open chrome://extensions → inspect offscreen page → Console',
  );
  console.error(
    '  3. Find and copy the ProveResponse JSON from the plugin output',
  );
  console.error(
    '  4. Save to packages/extension/src/offscreen/fixtures/wise_prove_response.json',
  );
  process.exit(1);
}

// ─── Step 2: Validate required fields ────────────────────────────────────────

console.log('');
console.log('[Step 2] Validating required fields...');

const commitments = proveResponse.transcriptCommitments ?? [];
const openings = proveResponse.transcriptCommitOpenings ?? [];
const transcript = proveResponse.verifierTranscript;

if (commitments.length === 0) {
  console.warn(
    '[Step 2] WARN — no transcriptCommitments. Did you set transcriptCommitHashAlg?',
  );
}

if (openings.length === 0) {
  console.warn(
    '[Step 2] WARN — no transcriptCommitOpenings (blinders). Did you set exposeOpenings: true?',
  );
}

if (!transcript) {
  console.warn(
    '[Step 2] WARN — verifierTranscript is missing. Did you set includeVerifierTranscript: true?',
  );
}

if (commitments.length > 0 && openings.length > 0 && transcript) {
  console.log('[Step 2] OK — all required fields present');
} else {
  console.error(
    '[Step 2] FAILED — missing required fields, test will be skipped',
  );
  process.exit(1);
}

// ─── Step 3: Print commitment overview ───────────────────────────────────────

console.log('');
console.log('[Step 3] Commitment overview:');
commitments.forEach((c, i) => {
  console.log(`  [${i}] direction=${c.direction} hashAlg=${c.hashAlg}`);
  console.log(`       ranges=${JSON.stringify(c.ranges)}`);
  console.log(`       hashHex=${c.hashHex?.slice(0, 16)}...`);
  console.log(`       revealed=${c.revealed}`);
});

// ─── Step 4: Print blinder overview ─────────────────────────────────────────

console.log('');
console.log('[Step 4] Blinder (transcriptCommitOpenings) overview:');
openings.forEach((o, i) => {
  console.log(`  [${i}] direction=${o.direction} hashAlg=${o.hashAlg}`);
  console.log(`       ranges=${JSON.stringify(o.ranges)}`);
  console.log(`       blinderHex=${o.blinderHex.slice(0, 16)}...`);
});

// ─── Step 5: Run commitment verification ─────────────────────────────────────

console.log('');
console.log('[Step 5] Running keccak256(plaintext || blinder) verification...');
console.log('         (Each commitment will be verified individually below)');
console.log('');

const summary = runTranscriptCommitmentRuntimeTest(proveResponse);

// ─── Step 6: Print final result ──────────────────────────────────────────────

console.log('');
console.log('='.repeat(60));
console.log('  FINAL RESULT');
console.log('='.repeat(60));
console.log(`  status    : ${summary.status}`);
console.log(`  total     : ${summary.total}`);
console.log(`  matched   : ${summary.matched}`);
console.log(`  mismatched: ${summary.mismatched}`);
console.log(`  message   : ${summary.message ?? '-'}`);
console.log('='.repeat(60));
console.log('');

if (summary.status === 'passed') {
  console.log(
    'PASS: All commitment openings verified. keccak256(plaintext || blinder) matches.',
  );
  console.log(
    '      This confirms the Verifier commitment data is authentic and unmodified.',
  );
} else if (summary.status === 'failed') {
  console.error(
    'FAIL: One or more commitments did not match. Data may have been tampered.',
  );
  process.exit(1);
} else if (summary.status === 'skipped') {
  console.warn(
    'SKIPPED: Verification could not run. Check required fields above.',
  );
} else if (summary.status === 'unsupported_alg') {
  console.warn(
    'SKIPPED: No Keccak256 commitments found. Ensure transcriptCommitHashAlg is set to Keccak256.',
  );
}

console.log('');
