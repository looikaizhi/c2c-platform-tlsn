// packages/demo/src/utils/verifierAuth.ts
// SIWE login (user wallets) + Admin key login + JWT cache + authedFetch.
//
// Single source of truth for "who is the demo frontend right now":
//   - admin    → Bearer = PROOF_API_KEY (sessionStorage 'tlsn:adminKey')
//   - user     → Bearer = SIWE JWT      (sessionStorage 'tlsn:jwt:<addr>')
//   - anon     → no Authorization header
//
// Backend enforces row-level scoping; the frontend just picks the right credential.

import { getAddress, type Hex, type WalletClient } from 'viem';
import { config } from '../config';

// ── SIWE message builder ─────────────────────────────────────────────────────

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

// ── JWT cache (sessionStorage, keyed by lowercase address) ───────────────────

interface CachedToken {
    token: string;
    expiresAt: number; // unix seconds
}

function jwtKey(addr: string) {
    return `tlsn:jwt:${addr.toLowerCase()}`;
}

function getCachedJwt(addr: string): CachedToken | null {
    try {
        const raw = sessionStorage.getItem(jwtKey(addr));
        if (!raw) return null;
        const t = JSON.parse(raw) as CachedToken;
        // 60s pre-expiry buffer → force re-login
        if (t.expiresAt - Math.floor(Date.now() / 1000) < 60) return null;
        return t;
    } catch {
        return null;
    }
}

// ── User SIWE login ──────────────────────────────────────────────────────────

export async function loginAsUser(walletClient: WalletClient): Promise<string> {
    // SIWE spec + the `siwe` Rust crate require the address line to be in
    // EIP-55 checksum format (mixed case). viem's getAddress() does that.
    // Storage / lookup keys are always lowercase — see jwtKey().
    const checksumAddr = getAddress(walletClient.account!.address as string) as Hex;
    const cached = getCachedJwt(checksumAddr);
    if (cached) return cached.token;

    const nonceResp = await fetch(`${config.verifierUrl}/auth/nonce`);
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
        account: walletClient.account!,
        message,
    });

    const resp = await fetch(`${config.verifierUrl}/auth/verify`, {
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
    sessionStorage.setItem(jwtKey(addr), JSON.stringify({ token, expiresAt }));
    return token;
}

// ── Admin key login (PROOF_API_KEY) ──────────────────────────────────────────

const ADMIN_KEY = 'tlsn:adminKey';

/**
 * Strip the optional `:scope` suffix from a PROOF_API_KEYS env-style value.
 * The verifier expects ONLY the key portion as the Bearer token; the `:scope`
 * (e.g. `:*`, `:tenant=wise`) lives in the env and is parsed server-side.
 * Pasting the whole env line `admin-demo-key:*` should still work.
 */
function normalizeAdminKey(raw: string): string {
    const trimmed = raw.trim();
    const i = trimmed.indexOf(':');
    return i >= 0 ? trimmed.slice(0, i) : trimmed;
}

export function loginAsAdmin(key: string) {
    sessionStorage.setItem(ADMIN_KEY, normalizeAdminKey(key));
}

export function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_KEY);
}

// ── Identity resolution ──────────────────────────────────────────────────────

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
    const k = sessionStorage.getItem(ADMIN_KEY);
    if (k) return { kind: 'admin', key: k };
    return { kind: 'anonymous' };
}

function getBearer(activeUserAddr?: Hex): string | null {
    const id = getCurrentIdentity(activeUserAddr);
    if (id.kind === 'user') return id.token;
    if (id.kind === 'admin') return id.key;
    return null;
}

// ── authedFetch (caller stays in charge of Content-Type) ─────────────────────

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
