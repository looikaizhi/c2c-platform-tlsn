import { describe, it, expect } from 'vitest';
import {
    maskAlipayName,
    maskAlipayEmail,
    maskAlipayPhone,
    maskAlipayHandle,
    alipayMasker,
} from './alipay';
import { maskForProof, identityMasker } from './index';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';

describe('maskAlipayName', () => {
    it('replaces the first space-separated token with "*" (English)', () => {
        expect(maskAlipayName('KELLY LIM HOOI YEN')).toBe('* LIM HOOI YEN');
    });

    it('replaces only the first character for CJK names (no space)', () => {
        expect(maskAlipayName('林凯智')).toBe('*凯智');
    });

    it('trims surrounding whitespace before masking', () => {
        expect(maskAlipayName('  KELLY LIM  ')).toBe('* LIM');
    });

    it('passes through empty input', () => {
        expect(maskAlipayName('')).toBe('');
    });
});

describe('maskAlipayEmail', () => {
    it('keeps first 3 local chars, masks the rest of the local part', () => {
        expect(maskAlipayEmail('kellylimhooiyen@hotmail.com')).toBe('kel***@hotmail.com');
    });

    it('returns the input unchanged when there is no "@"', () => {
        expect(maskAlipayEmail('15812345662')).toBe('15812345662');
    });
});

describe('maskAlipayPhone', () => {
    it('keeps first 3 and last 3 digits, masks the middle (best-effort)', () => {
        expect(maskAlipayPhone('15812345662')).toBe('158*****662');
    });

    it('passes through short inputs', () => {
        expect(maskAlipayPhone('12345')).toBe('12345');
    });
});

describe('maskAlipayHandle', () => {
    it('routes "@" handles to email masking', () => {
        expect(maskAlipayHandle('kellylimhooiyen@hotmail.com')).toBe('kel***@hotmail.com');
    });

    it('routes digit handles to phone masking', () => {
        expect(maskAlipayHandle('15812345662')).toBe('158*****662');
    });
});

describe('alipayMasker', () => {
    it('masks both name and handle', () => {
        expect(alipayMasker({ name: 'KELLY LIM HOOI YEN', handle: 'kellylimhooiyen@hotmail.com' }))
            .toEqual({ name: '* LIM HOOI YEN', handle: 'kel***@hotmail.com' });
    });
});

describe('identityMasker', () => {
    it('returns the identity unchanged', () => {
        const id = { name: 'KAI XU LOOI', handle: '@kaixul1' };
        expect(identityMasker(id)).toEqual(id);
    });
});

describe('maskForProof dispatch', () => {
    it('uses the Alipay masker for the Alipay platform id', () => {
        expect(maskForProof(PLATFORM_ALIPAY, { name: 'KELLY LIM HOOI YEN', handle: 'kellylimhooiyen@hotmail.com' }))
            .toEqual({ name: '* LIM HOOI YEN', handle: 'kel***@hotmail.com' });
    });

    it('leaves Wise identities unmasked (identity masker)', () => {
        const id = { name: 'KAI XU LOOI', handle: '@kaixul1' };
        expect(maskForProof(PLATFORM_WISE, id)).toEqual(id);
    });

    it('falls back to identity for an unknown platform id', () => {
        const id = { name: 'Someone', handle: 'someone@example.com' };
        expect(maskForProof(('0x' + 'ee'.repeat(32)) as `0x${string}`, id)).toEqual(id);
    });
});
