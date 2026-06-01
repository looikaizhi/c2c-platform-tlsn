"use client";
import { useCallback, useEffect, useState } from 'react';
import { listProofs, getProof, type ListItem, type ListFilters, type ProofExportResponse } from '@/lib/proofsApi';
import { loginAsAdmin, logoutAdmin, getCurrentIdentity } from '@/lib/verifierAuth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

export default function ProofAuditSection() {
    const [keyInput, setKeyInput] = useState('');
    const [identity, setIdentity] = useState(() => getCurrentIdentity().kind);

    const [filters, setFilters] = useState<ListFilters>({ limit: 25 });
    const [filterOwner, setFilterOwner] = useState('');
    const [filterStatus, setFilterStatus] = useState<'' | 'provisional' | 'committed'>('');
    const [items, setItems] = useState<ListItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedDetail, setSelectedDetail] = useState<ProofExportResponse | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const f: ListFilters = { ...filters };
            if (filterOwner.trim()) f.owner = filterOwner.trim();
            if (filterStatus)       f.status = filterStatus;
            const page = await listProofs(f);
            setItems(page.items);
            setNextCursor(page.nextCursor);
        } catch (e: any) {
            setError(e?.message ?? 'list failed');
        } finally {
            setLoading(false);
        }
    }, [filters, filterOwner, filterStatus]);

    useEffect(() => {
        if (identity === 'admin') {
            refresh();
        }
    }, [identity, refresh]);

    const handleLogin = () => {
        if (!keyInput.trim()) return;
        loginAsAdmin(keyInput.trim());
        setIdentity('admin');
        setKeyInput('');
    };

    const handleLogout = () => {
        logoutAdmin();
        setIdentity('anonymous');
        setItems([]);
    };

    const openDetail = async (attestationId: string) => {
        setSelectedDetail(null);
        setDetailLoading(true);
        try {
            const v = await getProof(attestationId);
            setSelectedDetail(v);
        } catch (e: any) {
            setError(e?.message ?? 'detail load failed');
        } finally {
            setDetailLoading(false);
        }
    };

    if (identity !== 'admin') {
        return (
            <Card padding="none" className="p-6">
                <h3 className="mb-3 text-lg font-semibold text-white">Verifier proof audit</h3>
                <p className="mb-3 text-xs text-[var(--text-subtle)]">
                    Paste a verifier admin API key (PROOF_API_KEY) to browse all proofs across tenants.
                    Key is stored only in sessionStorage and never sent anywhere except the verifier.
                </p>
                <div className="flex flex-wrap gap-2">
                    <input
                        type="password"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="admin api key"
                        className="terminal-input h-10 min-w-72 flex-1 px-2 font-mono text-sm"
                    />
                    <Button variant="primary" size="sm" onClick={handleLogin} disabled={!keyInput.trim()}>Login</Button>
                </div>
            </Card>
        );
    }

    return (
        <Card padding="none" className="space-y-3 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-white">Verifier proof audit</h3>
                <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
            </div>

            <div className="flex flex-wrap gap-2">
                <input
                    type="text"
                    value={filterOwner}
                    onChange={(e) => setFilterOwner(e.target.value)}
                    placeholder="Filter by owner 0x..."
                    className="terminal-input h-10 min-w-56 flex-1 px-2 font-mono text-sm"
                />
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as '' | 'provisional' | 'committed')}
                    className="terminal-select h-10 px-2 text-sm"
                >
                    <option value="">All status</option>
                    <option value="provisional">Provisional</option>
                    <option value="committed">Committed</option>
                </select>
                <Button variant="primary" size="sm" onClick={refresh} disabled={loading}>Refresh</Button>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {loading ? (
                <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
            ) : items.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No proofs match these filters.</p>
            ) : (
                <div className="space-y-2">
                    {items.map((it) => (
                        <div key={it.attestationId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3 text-sm">
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-xs">{it.attestationId.slice(0, 18)}…</span>
                                    <Badge variant={it.status === 'committed' ? 'success' : 'warning'} dot>
                                        {it.status}
                                    </Badge>
                                    <span className="text-xs text-[var(--text-muted)]">{it.serverName}</span>
                                </div>
                                <div className="text-xs text-[var(--text-muted)]">
                                    owner {it.ownerAddress ?? '—'} ·{' '}
                                    {it.txHash ? <>tx {it.txHash.slice(0, 12)}…</> : <span className="text-amber-400">no tx</span>} ·{' '}
                                    {new Date(it.timestamp).toLocaleString()}
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => openDetail(it.attestationId)}>View</Button>
                        </div>
                    ))}
                </div>
            )}

            {nextCursor && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters((f) => ({ ...f, cursor: nextCursor }))}
                >
                    Load next page
                </Button>
            )}

            {(detailLoading || selectedDetail) && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', padding: 'var(--space-4)',
                }}>
                    <Card variant="elevated" padding="none" style={{ width: '100%', maxWidth: '720px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Proof detail</h3>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedDetail(null)}>Close</Button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
                            {detailLoading ? (
                                <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
                            ) : selectedDetail ? (
                                <pre style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                                    {JSON.stringify(selectedDetail, null, 2)}
                                </pre>
                            ) : null}
                        </div>
                    </Card>
                </div>
            )}
        </Card>
    );
}
