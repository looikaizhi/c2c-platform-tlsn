"use client";
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Pencil, Check, X, Coins, AlertTriangle } from 'lucide-react';
import type { SupportCryptoAsset } from '@/server/db_types';
import { useAdminContract, AssetType } from '@/hooks/useAdminContract';

interface Props {
    refreshSignal: number;
    onStatsChange: (stats: { total: number; active: number }) => void;
}

function StatusPill({ active }: { active: boolean }) {
    return active ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:rgb(14_203_129_/_10%)] px-2.5 py-1 text-xs font-medium text-[var(--state-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--state-success)]" />
            Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
            Inactive
        </span>
    );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cta)] disabled:cursor-not-allowed disabled:opacity-50 ${
                checked ? 'bg-[var(--accent-cta)]' : 'bg-[var(--bg-surface-4)]'
            }`}
        >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
    );
}

export default function CryptoAssetTable({ refreshSignal, onStatsChange }: Props) {
    const [rows, setRows]         = useState<SupportCryptoAsset[]>([]);
    const [loading, setLoading]   = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [draft, setDraft]       = useState<Record<number, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [opError, setOpError]   = useState<string | null>(null);
    const { toggleAsset }         = useAdminContract();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res  = await fetch('/api/admin/crypto');
            const data = await res.json();
            const list: SupportCryptoAsset[] = Array.isArray(data) ? data : [];
            setRows(list);
            onStatsChange({ total: list.length, active: list.filter((r) => r.is_active).length });
        } finally {
            setLoading(false);
        }
    }, [onStatsChange]);

    useEffect(() => { fetchData(); }, [fetchData, refreshSignal]);

    const startEdit = () => {
        const initial: Record<number, boolean> = {};
        rows.forEach((r) => { initial[r.crypto_id] = r.is_active; });
        setDraft(initial);
        setEditMode(true);
        setOpError(null);
    };

    const cancelEdit = () => { setEditMode(false); setDraft({}); setOpError(null); };

    const submitEdit = async () => {
        setSubmitting(true);
        setOpError(null);
        try {
            const changed = rows.filter((r) => draft[r.crypto_id] !== r.is_active);
            for (const row of changed) {
                await toggleAsset(row.crypto_id, AssetType.CRYPTO, draft[row.crypto_id]);
            }
            await fetchData();
            setEditMode(false);
            setDraft({});
        } catch (err: any) {
            setOpError(err.message || 'Failed to update');
        } finally {
            setSubmitting(false);
        }
    };

    const hasChanges = rows.some((r) => draft[r.crypto_id] !== r.is_active);

    return (
        <div className="flex flex-1 flex-col gap-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-6">
            {/* Section header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:rgb(240_185_11_/_15%)]">
                        <Coins className="h-4 w-4 text-[var(--accent-cta)]" />
                    </div>
                    <h2 className="text-base font-semibold text-white">Crypto Assets</h2>
                    <span className="rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {rows.length}
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    {editMode ? (
                        <>
                            <button
                                onClick={submitEdit}
                                disabled={submitting || !hasChanges}
                                className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--state-success)] px-3 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
                            >
                                <Check className="h-3 w-3" />
                                {submitting ? 'Saving…' : 'Submit'}
                            </button>
                            <button
                                onClick={cancelEdit}
                                disabled={submitting}
                                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-soft)] px-3 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--line-strong)] hover:text-white disabled:opacity-50"
                            >
                                <X className="h-3 w-3" />
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={startEdit}
                            disabled={rows.length === 0}
                            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-soft)] px-3 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--line-strong)] hover:text-white disabled:opacity-30"
                        >
                            <Pencil className="h-3 w-3" />
                            Edit
                        </button>
                    )}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-soft)] text-[var(--text-secondary)] transition-colors hover:border-[var(--line-strong)] hover:text-white disabled:opacity-40"
                        aria-label="Refresh"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Edit mode banner */}
            {editMode && (
                <div className="flex items-center gap-2 rounded-lg border border-[color:rgb(240_185_11_/_30%)] bg-[color:rgb(240_185_11_/_8%)] px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-[var(--state-warning)]" />
                    <p className="text-xs text-[var(--state-warning)]">
                        Edit mode — toggle Active status below, then click <strong>Submit</strong> to apply on-chain.
                    </p>
                </div>
            )}

            {/* Error banner */}
            {opError && (
                <div className="flex items-center gap-2 rounded-lg border border-[color:rgb(246_70_93_/_30%)] bg-[color:rgb(246_70_93_/_8%)] px-3 py-2">
                    <X className="h-3.5 w-3.5 flex-shrink-0 text-[var(--state-danger)]" />
                    <p className="text-xs text-[var(--state-danger)]">{opError}</p>
                </div>
            )}

            {/* Table */}
            <div className="terminal-panel overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-[var(--bg-surface-2)]">
                            <tr className="border-b border-[var(--line-soft)]">
                                <th className="w-12 px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">ID</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Symbol</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Token Address</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line-soft)]">
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
                                        {loading ? 'Loading…' : 'No crypto assets yet.'}
                                    </td>
                                </tr>
                            )}
                            {rows.map((row) => {
                                const changed = editMode && draft[row.crypto_id] !== row.is_active;
                                return (
                                    <tr
                                        key={row.crypto_id}
                                        className={`transition-colors hover:bg-[var(--bg-surface-3)] ${changed ? 'border-l-2 border-l-[var(--accent-cta)] bg-[color:rgb(240_185_11_/_4%)]' : ''}`}
                                    >
                                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{row.crypto_id}</td>
                                        <td className="px-4 py-3 font-semibold text-white">{row.token_symbol}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                                            {row.token_address.slice(0, 10)}…{row.token_address.slice(-8)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {editMode
                                                ? <Toggle checked={draft[row.crypto_id]} onChange={(v) => setDraft((d) => ({ ...d, [row.crypto_id]: v }))} disabled={submitting} />
                                                : <StatusPill active={row.is_active} />
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                                            {new Date(row.edit_time).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
