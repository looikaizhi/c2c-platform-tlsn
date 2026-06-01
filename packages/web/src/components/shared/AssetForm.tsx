"use client";
import { type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { AdminStatus } from '@/hooks/useAdminContract';

export interface AssetFormProps {
    title:        string;
    icon:         ComponentType<{ className?: string }>;
    iconBgClass:  string;
    iconColorVar: string;
    /** Left accent strip colour token name, e.g. "var(--accent-cta)". */
    accentVar:    string;
    /** Form fields go inside this. Caller owns input state. */
    children:     ReactNode;
    status:       AdminStatus;
    error:        string | null;
    onSubmit:     (e: FormEvent) => void;
    canSubmit:    boolean;
    submitLabel?: string;
    successLabel?: string;
}

/**
 * Generic admin "add asset" card. Wraps the title row, status banners, and
 * submit button — caller drops in the actual input fields as children.
 *
 * Used by AddCryptoForm + AddFiatForm.
 */
export function AssetForm(props: AssetFormProps): JSX.Element {
    const {
        title, icon: Icon, iconBgClass, iconColorVar, accentVar,
        children, status, error, onSubmit, canSubmit,
        submitLabel = 'Submit →', successLabel = 'Added successfully!',
    } = props;

    const busy = status === 'confirming' || status === 'syncing';

    return (
        <div
            className="flex flex-1 flex-col rounded-xl border border-l-4 border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-6"
            style={{ borderLeftColor: accentVar }}
        >
            {/* Card header */}
            <div className="mb-5 flex items-center gap-2.5">
                <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconBgClass}`}>
                    <Icon className={`h-4 w-4 ${iconColorVar}`} />
                </div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
            </div>

            <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
                {children}

                {/* Status banners */}
                {status === 'error' && (
                    <div className="flex items-start gap-2 rounded-lg border border-[color:rgb(246_70_93_/_30%)] bg-[color:rgb(246_70_93_/_8%)] px-3 py-2.5">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--state-danger)]" />
                        <p className="text-xs text-[var(--state-danger)]">{error}</p>
                    </div>
                )}
                {status === 'success' && (
                    <div className="flex items-center gap-2 rounded-lg border border-[color:rgb(14_203_129_/_30%)] bg-[color:rgb(14_203_129_/_8%)] px-3 py-2.5">
                        <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-[var(--state-success)]" />
                        <p className="text-xs text-[var(--state-success)]">{successLabel}</p>
                    </div>
                )}
                {busy && (
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-3 py-2.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0 text-[var(--text-muted)]" />
                        <p className="text-xs text-[var(--text-subtle)]">
                            {status === 'confirming' ? 'Waiting for tx confirmation…' : 'Syncing database…'}
                        </p>
                    </div>
                )}

                <div className="mt-auto flex justify-end">
                    <button
                        type="submit"
                        disabled={busy || !canSubmit}
                        className="flex h-9 items-center gap-2 rounded-lg bg-[var(--accent-cta)] px-5 text-sm font-semibold text-[var(--text-inverse)] transition-opacity disabled:opacity-40"
                    >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {busy ? 'Processing…' : submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
