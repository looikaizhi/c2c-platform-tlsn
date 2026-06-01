"use client";
import { useState, type ComponentType, type ReactNode } from 'react';
import { RefreshCw, Pencil, Check, X } from 'lucide-react';
import { StatusPill } from './StatusPill';
import { Toggle } from './Toggle';
import { StatusBanner } from './StatusBanner';

export interface AssetTableColumn<T> {
    key:    string;
    header: string;
    /** Width hint, e.g. "w-12". */
    width?: string;
    render: (row: T) => ReactNode;
}

export interface AssetTableProps<T> {
    title:        string;
    icon:         ComponentType<{ className?: string }>;
    iconBgClass:  string;
    iconColorVar: string;
    rows:         T[];
    loading:      boolean;
    rowKey:       (row: T) => string | number;
    columns:      AssetTableColumn<T>[];
    isActive:     (row: T) => boolean;
    /** Provide a stable id for tracking which rows are dirty in edit mode. */
    rowId:        (row: T) => number;
    onToggle:     (row: T, newActive: boolean) => Promise<void>;
    onRefresh:    () => void;
    emptyText?:   string;
}

/**
 * Generic admin "asset" listing table with inline Edit/Submit/Cancel/Refresh
 * controls. Used by Crypto + Fiat asset tables — both pass column defs and
 * delegate the actual toggle write.
 */
export function AssetTable<T>(props: AssetTableProps<T>): JSX.Element {
    const {
        title, icon: Icon, iconBgClass, iconColorVar,
        rows, loading, rowKey, rowId, columns, isActive,
        onToggle, onRefresh, emptyText = 'No items yet.',
    } = props;

    const [editMode, setEditMode] = useState(false);
    const [draft, setDraft]       = useState<Record<number, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [opError, setOpError]   = useState<string | null>(null);

    const startEdit = () => {
        const initial: Record<number, boolean> = {};
        rows.forEach((r) => { initial[rowId(r)] = isActive(r); });
        setDraft(initial);
        setEditMode(true);
        setOpError(null);
    };
    const cancelEdit = () => { setEditMode(false); setDraft({}); setOpError(null); };

    const submitEdit = async () => {
        setSubmitting(true);
        setOpError(null);
        try {
            const changed = rows.filter((r) => draft[rowId(r)] !== isActive(r));
            for (const r of changed) {
                await onToggle(r, draft[rowId(r)]);
            }
            await onRefresh();
            setEditMode(false);
            setDraft({});
        } catch (err: any) {
            setOpError(err?.message ?? 'Failed to update');
        } finally {
            setSubmitting(false);
        }
    };

    const hasChanges = rows.some((r) => draft[rowId(r)] !== isActive(r));
    const totalCols = columns.length + 1; // +1 for Status column

    return (
        <div className="flex flex-1 flex-col gap-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-6">
            {/* Section header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconBgClass}`}>
                        <Icon className={`h-4 w-4 ${iconColorVar}`} />
                    </div>
                    <h2 className="text-base font-semibold text-white">{title}</h2>
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
                        onClick={onRefresh}
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
                <StatusBanner variant="warning">
                    Edit mode — toggle Active status below, then click <strong>Submit</strong> to apply on-chain.
                </StatusBanner>
            )}

            {/* Error banner */}
            {opError && <StatusBanner variant="error">{opError}</StatusBanner>}

            {/* Table */}
            <div className="terminal-panel overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-[var(--bg-surface-2)]">
                            <tr className="border-b border-[var(--line-soft)]">
                                {columns.map((c) => (
                                    <th key={c.key} className={`px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] ${c.width ?? ''}`}>
                                        {c.header}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line-soft)]">
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={totalCols} className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
                                        {loading ? 'Loading…' : emptyText}
                                    </td>
                                </tr>
                            )}
                            {rows.map((row) => {
                                const id = rowId(row);
                                const dirty = editMode && draft[id] !== isActive(row);
                                return (
                                    <tr
                                        key={rowKey(row)}
                                        className={`transition-colors hover:bg-[var(--bg-surface-3)] ${dirty ? 'border-l-2 border-l-[var(--accent-cta)] bg-[color:rgb(240_185_11_/_4%)]' : ''}`}
                                    >
                                        {columns.map((c) => (
                                            <td key={c.key} className="px-4 py-3">
                                                {c.render(row)}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3">
                                            {editMode
                                                ? <Toggle checked={draft[id]} onChange={(v) => setDraft((d) => ({ ...d, [id]: v }))} disabled={submitting} />
                                                : <StatusPill active={isActive(row)} />
                                            }
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
