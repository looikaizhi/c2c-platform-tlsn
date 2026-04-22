import { keccak256, toBytes } from 'viem';
import type { Hex } from 'viem';

const MAX_SCAN_DEPTH = 5;
const HEX_DATA_RE = /^0x[0-9a-fA-F]+$/;
const RETURN_DATA_RE = /return data:\s*(0x[0-9a-fA-F]+)/i;

interface KnownErrorDef {
    name: string;
    hint: string;
}

const KNOWN_ERRORS: KnownErrorDef[] = [
    {
        name: 'UntrustedVerifier',
        hint: 'Verifier signer recovered from proof is not in trustedVerifiers. Check VERIFIER_PRIVATE_KEY, trusted verifier registration, policyVersionHash, and orderBindingHash.',
    },
    {
        name: 'OrderBindingHashMismatch',
        hint: 'Proof binding context does not match on-chain order snapshot. Rebuild context from latest on-chain order and regenerate proof.',
    },
    {
        name: 'SessionAlreadyUsed',
        hint: 'TLSN sessionId has already been consumed on-chain. Generate a fresh proof session.',
    },
    {
        name: 'WrongChainId',
        hint: 'Proof chainId differs from current chain. Confirm local chain id and verifier CHAIN_ID configuration.',
    },
];

function selectorForError(name: string): Hex {
    return `${keccak256(toBytes(`${name}()`)).slice(0, 10).toLowerCase()}` as Hex;
}

const KNOWN_ERROR_BY_SELECTOR = new Map<string, KnownErrorDef>(
    KNOWN_ERRORS.map((item) => [selectorForError(item.name), item]),
);

function toLowerHex(value: string): Hex {
    return value.toLowerCase() as Hex;
}

function maybeHex(value: unknown): Hex | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (HEX_DATA_RE.test(trimmed)) return toLowerHex(trimmed);
    const m = trimmed.match(RETURN_DATA_RE);
    if (m?.[1] && HEX_DATA_RE.test(m[1])) return toLowerHex(m[1]);
    return undefined;
}

function findRevertData(value: unknown, depth = 0): Hex | undefined {
    if (depth > MAX_SCAN_DEPTH || value == null) return undefined;

    const direct = maybeHex(value);
    if (direct) return direct;

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findRevertData(item, depth + 1);
            if (found) return found;
        }
        return undefined;
    }

    if (typeof value !== 'object') return undefined;

    const obj = value as Record<string, unknown>;
    const likelyKeys = [
        'data',
        'returnData',
        'revertData',
        'message',
        'shortMessage',
        'details',
        'metaMessages',
        'cause',
        'error',
    ];
    for (const key of likelyKeys) {
        if (!(key in obj)) continue;
        const found = findRevertData(obj[key], depth + 1);
        if (found) return found;
    }

    return undefined;
}

export interface DecodedContractError {
    selector: Hex;
    errorName?: string;
    hint?: string;
    revertData?: Hex;
}

export function decodeContractError(err: unknown): DecodedContractError | null {
    const revertData = findRevertData(err);
    if (!revertData || revertData.length < 10) return null;

    const selector = toLowerHex(revertData.slice(0, 10));
    const known = KNOWN_ERROR_BY_SELECTOR.get(selector);
    if (!known) {
        return { selector, revertData };
    }
    return {
        selector,
        revertData,
        errorName: known.name,
        hint: known.hint,
    };
}

export function formatContractAwareError(err: unknown): string {
    const e = err as any;
    const base =
        e?.details ||
        e?.cause?.message ||
        e?.message ||
        e?.shortMessage ||
        String(err);
    const decoded = decodeContractError(err);
    if (!decoded) return base;
    if (!decoded.errorName) {
        return `${base} (custom error selector: ${decoded.selector})`;
    }
    return `${decoded.errorName} (${decoded.selector}). ${decoded.hint} Raw: ${base}`;
}
