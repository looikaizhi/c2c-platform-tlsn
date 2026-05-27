// packages/demo/src/utils/proofsApi.ts
// Typed API client for verifier proof endpoints + hex0x normalization helper.
//
// Naming convention (per PROOF_AUDIT_PLAN §3.2):
//   - Top-level fields: camelCase
//   - hashHex / commitmentsHash / verifierSignature → RAW hex (no 0x)
//   - orderBindingHash / verifierAddress / txHash    → 0x-prefixed
//   - hex0x() lifts raw hex to 0x-prefixed Hex for viem consumption.

import type { Hex } from 'viem';
import { config } from '../config';
import { authedFetch } from './verifierAuth';

// ── Normalization ────────────────────────────────────────────────────────────

export const hex0x = (h: string | null | undefined): Hex | null => {
    if (!h) return null;
    return (h.startsWith('0x') ? h : `0x${h}`) as Hex;
};

// ── Response types ───────────────────────────────────────────────────────────

export type ProofStatus = 'provisional' | 'committed';
export type RetentionClass = 'compliance' | 'ephemeral';

export interface TravelRuleField {
    value: string;
    commitmentIndex: number;
}

export interface AccountCheckResult {
    field: string;
    matched: boolean;
    [k: string]: unknown;
}

export interface ListItem {
    attestationId: string;
    status: ProofStatus;
    retentionClass: RetentionClass;
    ownerAddress: string | null;
    tenantId: string | null;
    serverName: string;
    txHash: string | null;
    timestamp: string;
    committedAt: string | null;
    travelRuleFields: Record<string, TravelRuleField>;
}

export interface ListPage {
    items: ListItem[];
    nextCursor: string | null;
}

export interface TranscriptCommitment {
    hashHex: string;
    hashAlg: 'Keccak256' | string;
    direction: 'SENT' | 'RECV';
    kind: 'Hash' | string;
    ranges: Array<{ start: number; end: number }>;
}

export interface ProofExportResponse {
    formatVersion: 'ProofExportV1';
    attestationId: string;
    txHash: string | null;
    policyVersion: string;
    timestamp: string;
    serverName: string;
    verifierVersion: string;
    orderBindingHash: string | null;
    commitmentsHash: string;
    verifierSignature: string;
    verifierAddress: string;
    chainId: number | null;
    travelRuleFields: Record<string, TravelRuleField>;
    accountChecks: AccountCheckResult[];
    transcriptCommitments: TranscriptCommitment[];
    redactedTranscript?: { sent: string; recv: string };
    handlerResults?: unknown;
    sessionData?: Record<string, string>;
}

// ── List query params ────────────────────────────────────────────────────────

export interface ListFilters {
    owner?: string;
    tenant?: string;
    status?: ProofStatus;
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
}

function buildQuery(f: ListFilters): string {
    const sp = new URLSearchParams();
    if (f.owner)  sp.set('owner', f.owner);
    if (f.tenant) sp.set('tenant', f.tenant);
    if (f.status) sp.set('status', f.status);
    if (f.from)   sp.set('from', f.from);
    if (f.to)     sp.set('to', f.to);
    if (f.limit !== undefined) sp.set('limit', String(f.limit));
    if (f.cursor) sp.set('cursor', f.cursor);
    const s = sp.toString();
    return s ? `?${s}` : '';
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function listProofs(
    filters: ListFilters = {},
    activeUserAddr?: Hex,
): Promise<ListPage> {
    const url = `${config.verifierUrl}/proofs${buildQuery(filters)}`;
    const resp = await authedFetch(url, { method: 'GET' }, activeUserAddr);
    if (!resp.ok) throw new Error(`listProofs ${resp.status}: ${await resp.text()}`);
    return (await resp.json()) as ListPage;
}

export async function getProof(
    sessionId: string,
    activeUserAddr?: Hex,
): Promise<ProofExportResponse> {
    const url = `${config.verifierUrl}/proof/${encodeURIComponent(sessionId)}`;
    const resp = await authedFetch(url, { method: 'GET' }, activeUserAddr);
    if (!resp.ok) throw new Error(`getProof ${resp.status}: ${await resp.text()}`);
    return (await resp.json()) as ProofExportResponse;
}

export async function getProofByTxHash(
    txHash: string,
    activeUserAddr?: Hex,
): Promise<ProofExportResponse> {
    const url = `${config.verifierUrl}/proof?txHash=${encodeURIComponent(txHash)}`;
    const resp = await authedFetch(url, { method: 'GET' }, activeUserAddr);
    if (!resp.ok) throw new Error(`getProofByTxHash ${resp.status}: ${await resp.text()}`);
    return (await resp.json()) as ProofExportResponse;
}

export interface PatchTxResult {
    ok: boolean;
    status: number;
    alreadyCommitted: boolean; // 409 = already-backfilled-skip
}

export async function patchProofTx(
    sessionId: string,
    txHash: Hex,
    chainId: number,
    activeUserAddr?: Hex,
): Promise<PatchTxResult> {
    const url = `${config.verifierUrl}/proof/${encodeURIComponent(sessionId)}/tx`;
    const resp = await authedFetch(
        url,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHash, chainId }),
        },
        activeUserAddr,
    );
    return {
        ok: resp.ok || resp.status === 409,
        status: resp.status,
        alreadyCommitted: resp.status === 409,
    };
}
