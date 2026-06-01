import { keccak256, toBytes, concat, type Hex } from 'viem';
import { randomBytes } from 'node:crypto';

export function normalize(s: string): string {
    return s.trim().toLowerCase().normalize('NFC');
}

export function randomSalt(): Hex {
    return ('0x' + randomBytes(32).toString('hex')) as Hex;
}

export function computeCommit(plaintext: string, salt: Hex): Hex {
    return keccak256(concat([toBytes(normalize(plaintext)), toBytes(salt)]));
}

export function normalizeWallet(addr: string): string {
    return addr.toLowerCase();
}
