// packages/demo/src/components/ProofsList.tsx
// Generic proof list for both the user audit (MyProofs) and admin audit (AdminAudit).
// Backend (verifier) enforces row-level scoping; this component just renders.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Hex } from 'viem';
import {
    listProofs,
    type ListItem,
    type ListPage,
    type ListFilters,
    type ProofStatus,
} from '../utils/proofsApi';

export interface ProofsListProps {
    mode: 'admin' | 'user';
    /** When mode === 'user', pass the active user address so authedFetch picks the right JWT. */
    activeUserAddr?: Hex;
    /** Initial filter values. Updated by inline form below in admin mode. */
    initialFilters?: ListFilters;
    /** Click handler — usually opens <ProofDetail attestationId=… /> */
    onSelect?: (item: ListItem) => void;
    /** Optional refresh trigger so a parent can force reload (e.g. after a new payment). */
    reloadKey?: number;
    /** When false, suppress the initial fetch (e.g. waiting for SIWE / Admin Key). */
    enabled?: boolean;
    /** Message shown when disabled (instead of firing a doomed fetch). */
    disabledMessage?: string;
}

// ── Design tokens ────────────────────────────────────────────────────────────

const C = {
    primary: '#2563EB',
    success: '#16A34A',
    warning: '#F97316',
    border: '#E2E8F0',
    bg: '#F8FAFC',
    text: '#0F172A',
    muted: '#64748B',
} as const;

const S: Record<string, CSSProperties> = {
    wrap: { background: '#fff', borderRadius: 10, border: `1px solid ${C.border}` },
    header: {
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
    },
    input: {
        padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`,
        fontSize: 12, color: C.text, background: '#fff', minWidth: 0,
    },
    select: {
        padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`,
        fontSize: 12, color: C.text, background: '#fff',
    },
    btn: {
        padding: '5px 12px', borderRadius: 6, border: 'none',
        background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
    btnGhost: {
        padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
        background: '#fff', color: C.text, fontSize: 12, cursor: 'pointer',
    },
    row: {
        display: 'grid',
        gridTemplateColumns: '1.5fr 0.8fr 1fr 0.9fr 1.2fr 0.6fr',
        gap: 10, padding: '8px 14px', borderBottom: `1px solid ${C.border}`,
        fontSize: 12, alignItems: 'center', cursor: 'pointer',
    },
    rowHead: {
        background: C.bg, fontWeight: 700, color: C.muted, fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'default',
    },
    cellMono: { fontFamily: '"Fira Code", monospace', fontSize: 11, color: C.text },
    statusPill: {
        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', display: 'inline-block',
    },
    footer: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', fontSize: 12, color: C.muted,
    },
};

function trunc(s: string | null | undefined, n = 14): string {
    if (!s) return '—';
    return s.length > n ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

function fmtTs(s: string | null | undefined): string {
    if (!s) return '—';
    try { return new Date(s).toLocaleString(); } catch { return s; }
}

function statusStyle(st: ProofStatus): CSSProperties {
    return st === 'committed'
        ? { ...S.statusPill, background: '#dcfce7', color: '#166534' }
        : { ...S.statusPill, background: '#fef3c7', color: '#854d0e' };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProofsList({
    mode,
    activeUserAddr,
    initialFilters,
    onSelect,
    reloadKey,
    enabled = true,
    disabledMessage,
}: ProofsListProps) {
    const [filters, setFilters] = useState<ListFilters>(initialFilters ?? { limit: 50 });
    const [pages, setPages] = useState<ListItem[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Avoid stale closures when filters change mid-fetch
    const reqId = useRef(0);

    const load = useCallback(
        async (append: boolean, nextCursor?: string | null) => {
            const myReq = ++reqId.current;
            setLoading(true);
            setError(null);
            try {
                const merged: ListFilters = { ...filters };
                if (nextCursor) merged.cursor = nextCursor;
                const page: ListPage = await listProofs(merged, activeUserAddr);
                if (reqId.current !== myReq) return;
                setPages((prev) => (append ? [...prev, ...page.items] : page.items));
                setCursor(page.nextCursor);
                setHasMore(!!page.nextCursor);
            } catch (err) {
                if (reqId.current !== myReq) return;
                setError((err as any)?.message ?? String(err));
                if (!append) setPages([]);
            } finally {
                if (reqId.current === myReq) setLoading(false);
            }
        },
        [filters, activeUserAddr],
    );

    useEffect(() => {
        if (!enabled) {
            // Clear stale rows / errors so the UI shows the gating message cleanly.
            setPages([]);
            setError(null);
            setLoading(false);
            return;
        }
        load(false, null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, JSON.stringify(filters), activeUserAddr, reloadKey]);

    const onApply = () => load(false, null);
    const onMore = () => cursor && load(true, cursor);

    const filterBar = useMemo(() => {
        if (mode === 'user') {
            // User view: backend forces owner=self; expose only tenant / status / limit.
            return (
                <>
                    <select
                        style={S.select}
                        value={filters.tenant ?? ''}
                        onChange={(e) => setFilters((f) => ({ ...f, tenant: e.target.value || undefined }))}
                    >
                        <option value="">All platforms</option>
                        <option value="wise">Wise</option>
                        <option value="alipay">Alipay</option>
                    </select>
                    <select
                        style={S.select}
                        value={filters.status ?? ''}
                        onChange={(e) =>
                            setFilters((f) => ({ ...f, status: (e.target.value || undefined) as ProofStatus | undefined }))
                        }
                    >
                        <option value="">All statuses</option>
                        <option value="provisional">Provisional</option>
                        <option value="committed">Committed</option>
                    </select>
                </>
            );
        }
        // Admin view: free owner / tenant / status filtering.
        return (
            <>
                <input
                    style={{ ...S.input, width: 280 }}
                    placeholder="owner (0x… optional)"
                    value={filters.owner ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value || undefined }))}
                />
                <select
                    style={S.select}
                    value={filters.tenant ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, tenant: e.target.value || undefined }))}
                >
                    <option value="">All tenants</option>
                    <option value="wise">Wise</option>
                    <option value="alipay">Alipay</option>
                </select>
                <select
                    style={S.select}
                    value={filters.status ?? ''}
                    onChange={(e) =>
                        setFilters((f) => ({ ...f, status: (e.target.value || undefined) as ProofStatus | undefined }))
                    }
                >
                    <option value="">All statuses</option>
                    <option value="provisional">Provisional</option>
                    <option value="committed">Committed</option>
                </select>
            </>
        );
    }, [mode, filters]);

    return (
        <div style={S.wrap}>
            <div style={S.header}>
                {filterBar}
                <button style={S.btn} onClick={onApply} disabled={loading}>
                    {loading ? 'Loading…' : 'Apply'}
                </button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: C.muted }}>
                    {pages.length} {pages.length === 1 ? 'proof' : 'proofs'}
                    {hasMore ? ' (more available)' : ''}
                </span>
            </div>

            {error && (
                <div style={{ padding: '12px 14px', color: '#b91c1c', fontSize: 12, background: '#fef2f2', borderBottom: `1px solid ${C.border}` }}>
                    {error}
                    {error.includes('401') && mode === 'admin' && (
                        <div style={{ marginTop: 6 }}>
                            未配置 PROOF_API_KEYS 或 key 错误,检查 packages/verifier/.env 后重启。
                        </div>
                    )}
                </div>
            )}

            <div style={{ ...S.row, ...S.rowHead }}>
                <div>sessionId</div>
                <div>tenant</div>
                <div>owner</div>
                <div>status</div>
                <div>timestamp</div>
                <div>tx</div>
            </div>

            {!enabled && (
                <div style={{ padding: '24px 14px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
                    {disabledMessage ?? 'Waiting for credentials…'}
                </div>
            )}

            {enabled && pages.length === 0 && !loading && !error && (
                <div style={{ padding: '24px 14px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
                    No proofs found.
                </div>
            )}

            {pages.map((item) => (
                <div
                    key={item.attestationId}
                    style={S.row}
                    onClick={() => onSelect?.(item)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(item); }}
                    role="button"
                    tabIndex={0}
                >
                    <div style={S.cellMono} title={item.attestationId}>{trunc(item.attestationId, 26)}</div>
                    <div>{item.tenantId ?? '—'}</div>
                    <div style={S.cellMono} title={item.ownerAddress ?? ''}>{trunc(item.ownerAddress, 16)}</div>
                    <div><span style={statusStyle(item.status)}>{item.status}</span></div>
                    <div style={{ color: C.muted }}>{fmtTs(item.timestamp)}</div>
                    <div style={S.cellMono} title={item.txHash ?? ''}>{trunc(item.txHash, 14)}</div>
                </div>
            ))}

            <div style={S.footer}>
                <span>{loading ? 'Loading…' : ' '}</span>
                {hasMore && (
                    <button style={S.btnGhost} onClick={onMore} disabled={loading}>
                        Load more
                    </button>
                )}
            </div>
        </div>
    );
}
