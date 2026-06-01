// SIWE login (user wallets) + Admin key login + JWT cache + authedFetch.
// Ported from packages/demo/src/utils/verifierAuth.ts; sessionStorage usage
// guarded for SSR (Next.js).

import { getAddress, type Hex, type WalletClient } from 'viem';
import { getVerifierUrl } from './verifierConfig';

interface SiweFields {
    domain: string;
    address: Hex;
    uri: string;
    chainId: number;
    nonce: string;
}

function buildSiweMessage(p: SiweFields): string {
    return [
        `${p.domain} wants you to sign in with your Ethereum account:`,
        p.address,
        '',
        'Sign in to TLSN demo audit.',
        '',
        `URI: ${p.uri}`,
        'Version: 1',
        `Chain ID: ${p.chainId}`,
        `Nonce: ${p.nonce}`,
        `Issued At: ${new Date().toISOString()}`,
    ].join('\n');
}

interface CachedToken {
    token: string;
    expiresAt: number;
}

const ADMIN_KEY = 'tlsn:adminKey';

function jwtKey(addr: string) {
    return `tlsn:jwt:${addr.toLowerCase()}`;
}

function safeSessionStorage(): Storage | null {
    try {
        if (typeof window === 'undefined') return null;
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function getCachedJwt(addr: string): CachedToken | null {
    const ss = safeSessionStorage();
    if (!ss) return null;
    try {
        const raw = ss.getItem(jwtKey(addr));
        if (!raw) return null;
        const t = JSON.parse(raw) as CachedToken;
        if (t.expiresAt - Math.floor(Date.now() / 1000) < 60) return null;
        return t;
    } catch {
        return null;
    }
}

export async function loginAsUser(walletClient: WalletClient): Promise<string> {
    const account = walletClient.account;
    if (!account) throw new Error('SIWE login: wallet client has no account');
    const checksumAddr = getAddress(account.address as string) as Hex;
    const cached = getCachedJwt(checksumAddr);
    if (cached) return cached.token;

    const verifierUrl = getVerifierUrl();
    const nonceResp = await fetch(`${verifierUrl}/auth/nonce`);
    if (!nonceResp.ok) throw new Error(`SIWE nonce fetch failed: ${nonceResp.status}`);
    const { nonce } = (await nonceResp.json()) as { nonce: string };

    const message = buildSiweMessage({
        domain: window.location.host,
        address: checksumAddr,
        uri: window.location.origin,
        chainId: 31337,
        nonce,
    });
    const signature = await walletClient.signMessage({
        account,
        message,
    });

    const resp = await fetch(`${verifierUrl}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
    });
    if (!resp.ok) {
        throw new Error(`SIWE login failed (${resp.status}): ${await resp.text()}`);
    }
    const { token, address: addr, expiresAt } = (await resp.json()) as {
        token: string;
        address: string;
        expiresAt: number;
    };
    const ss = safeSessionStorage();
    ss?.setItem(jwtKey(addr), JSON.stringify({ token, expiresAt }));
    return token;
}

function normalizeAdminKey(raw: string): string {
    const trimmed = raw.trim();
    const i = trimmed.indexOf(':');
    return i >= 0 ? trimmed.slice(0, i) : trimmed;
}

export function loginAsAdmin(key: string) {
    safeSessionStorage()?.setItem(ADMIN_KEY, normalizeAdminKey(key));
}

export function logoutAdmin() {
    safeSessionStorage()?.removeItem(ADMIN_KEY);
}

export type Identity =
    | { kind: 'admin'; key: string }
    | { kind: 'user'; address: Hex; token: string }
    | { kind: 'anonymous' };

export function getCurrentIdentity(activeUserAddr?: Hex): Identity {
    if (activeUserAddr) {
        const c = getCachedJwt(activeUserAddr);
        if (c) {
            return {
                kind: 'user',
                address: activeUserAddr.toLowerCase() as Hex,
                token: c.token,
            };
        }
    }
    const ss = safeSessionStorage();
    const k = ss?.getItem(ADMIN_KEY) ?? null;
    if (k) return { kind: 'admin', key: k };
    return { kind: 'anonymous' };
}

function getBearer(activeUserAddr?: Hex): string | null {
    const id = getCurrentIdentity(activeUserAddr);
    if (id.kind === 'user') return id.token;
    if (id.kind === 'admin') return id.key;
    return null;
}

export async function authedFetch(
    url: string,
    init: RequestInit = {},
    activeUserAddr?: Hex,
): Promise<Response> {
    const bearer = getBearer(activeUserAddr);
    const headers = new Headers(init.headers);
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
    return fetch(url, { ...init, headers });
}
