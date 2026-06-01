import { describe, it, expect } from 'vitest';
import { keccak256, toBytes, concat } from 'viem';
import { normalize, randomSalt, computeCommit, normalizeWallet } from './payeeCrypto';

describe('normalize', () => {
    it('trims surrounding whitespace', () => {
        expect(normalize('  hello  ')).toBe('hello');
    });

    it('lowercases ascii', () => {
        expect(normalize('ZHANG San')).toBe('zhang san');
    });

    it('combines trim + lowercase', () => {
        expect(normalize('  ZHANG San  ')).toBe('zhang san');
    });

    it('applies NFC normalization', () => {
        // 'é' as decomposed (U+0065 + U+0301) vs precomposed (U+00E9)
        const decomposed = 'café';
        const precomposed = 'café';
        expect(normalize(decomposed)).toBe(precomposed);
        expect(normalize(decomposed)).toBe(normalize(precomposed));
    });

    it('is idempotent', () => {
        const once = normalize('  HéLLO  ');
        expect(normalize(once)).toBe(once);
    });
});

describe('randomSalt', () => {
    it('returns a 0x-prefixed 32-byte hex string', () => {
        const salt = randomSalt();
        expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('produces different values on each call', () => {
        const a = randomSalt();
        const b = randomSalt();
        expect(a).not.toBe(b);
    });
});

describe('computeCommit', () => {
    it('is deterministic for same input and salt', () => {
        const salt = randomSalt();
        const a = computeCommit('Alice', salt);
        const b = computeCommit('Alice', salt);
        expect(a).toBe(b);
    });

    it('differs when salt differs', () => {
        const a = computeCommit('Alice', randomSalt());
        const b = computeCommit('Alice', randomSalt());
        expect(a).not.toBe(b);
    });

    it('differs when plaintext differs (same salt)', () => {
        const salt = randomSalt();
        expect(computeCommit('Alice', salt)).not.toBe(computeCommit('Bob', salt));
    });

    it('treats inputs identical after normalize as the same commit', () => {
        const salt = randomSalt();
        expect(computeCommit('  ALICE  ', salt)).toBe(computeCommit('alice', salt));
    });

    it('matches keccak256(normalize(plaintext) || salt) reference', () => {
        const salt = '0x' + '00'.repeat(32);
        const expected = keccak256(
            concat([toBytes('alice'), toBytes(salt as `0x${string}`)]),
        );
        expect(computeCommit('  ALICE  ', salt as `0x${string}`)).toBe(expected);
    });

    it('produces a 32-byte hex commit', () => {
        const commit = computeCommit('alice', randomSalt());
        expect(commit).toMatch(/^0x[0-9a-f]{64}$/);
    });
});

describe('normalizeWallet', () => {
    it('lowercases addresses', () => {
        expect(normalizeWallet('0xABCdef1234567890abcdef1234567890abcdef12')).toBe(
            '0xabcdef1234567890abcdef1234567890abcdef12',
        );
    });
});
