import {
    keccak256,
    recoverMessageAddress,
    toBytes,
    type Hex,
} from 'viem';

export interface SignedRequestHeaders {
    'X-Wallet-Sig': Hex;
    'X-Wallet-Timestamp': string;
}

export interface VerifiedCaller {
    wallet: string; // lowercase
    timestamp: number;
}

const TIMESTAMP_SKEW_SECONDS = 300;
const USER_DOMAIN = 'C2C-Binding/v1';
const ADMIN_DOMAIN = 'C2C-Admin/v1';

function canonicalJSON(value: unknown): string {
    // Mirror JSON.stringify semantics:
    //   • in arrays, undefined → null
    //   • in objects, undefined-valued keys are omitted
    // Without this, a client passing `{notes: undefined}` produces a different
    // canonical string than the server (which only sees the wire bytes — no
    // `notes` key at all), so the recovered address comes out garbage.
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map((v) => v === undefined ? 'null' : canonicalJSON(v)).join(',') + ']';
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return (
        '{' +
        keys
            .map((k) => JSON.stringify(k) + ':' + canonicalJSON(obj[k]))
            .join(',') +
        '}'
    );
}

function bodyHash(method: string, body: unknown): Hex {
    if (method.toUpperCase() === 'GET' || body === undefined || body === null) {
        return '0x' as Hex;
    }
    return keccak256(toBytes(canonicalJSON(body)));
}

export interface BuildMessageInput {
    domain: 'user' | 'admin';
    method: string;
    path: string;
    body?: unknown;
    timestamp: number;
}

export function buildSignableMessage(input: BuildMessageInput): string {
    const domain = input.domain === 'admin' ? ADMIN_DOMAIN : USER_DOMAIN;
    const bh = bodyHash(input.method, input.body);
    return [domain, input.method.toUpperCase(), input.path, bh, String(input.timestamp)].join(
        '\n',
    );
}

export interface VerifySignedRequestInput {
    domain: 'user' | 'admin';
    method: string;
    path: string;
    body?: unknown;
    signature: Hex;
    timestamp: number;
    now?: number; // override for tests
}

export async function verifySignedRequest(
    input: VerifySignedRequestInput,
): Promise<VerifiedCaller> {
    const now = input.now ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - input.timestamp) > TIMESTAMP_SKEW_SECONDS) {
        throw new Error('timestamp_out_of_window');
    }
    const message = buildSignableMessage({
        domain: input.domain,
        method: input.method,
        path: input.path,
        body: input.body,
        timestamp: input.timestamp,
    });
    const recovered = await recoverMessageAddress({
        message,
        signature: input.signature,
    });
    return {
        wallet: recovered.toLowerCase(),
        timestamp: input.timestamp,
    };
}

export function extractSignedHeaders(
    headers: Headers | Record<string, string | string[] | undefined>,
): { signature: Hex; timestamp: number } {
    const get = (k: string): string | undefined => {
        if (headers instanceof Headers) return headers.get(k) ?? undefined;
        const v = (headers as Record<string, string | string[] | undefined>)[k];
        return Array.isArray(v) ? v[0] : v;
    };
    const sig = get('x-wallet-sig') ?? get('X-Wallet-Sig');
    const ts = get('x-wallet-timestamp') ?? get('X-Wallet-Timestamp');
    if (!sig || !ts) throw new Error('missing_wallet_auth_headers');
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) throw new Error('invalid_timestamp');
    return { signature: sig as Hex, timestamp: tsNum };
}
