"use client";

/**
 * Active/Inactive pill. Replaces 4 identical inline impls in
 * Crypto/FiatAssetTable, OrdersTab, MerchantStatusCard.
 */
export function StatusPill({ active, labels }: {
    active: boolean;
    labels?: { active?: string; inactive?: string };
}) {
    const activeLabel   = labels?.active   ?? 'Active';
    const inactiveLabel = labels?.inactive ?? 'Inactive';

    return active ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:rgb(14_203_129_/_10%)] px-2.5 py-1 text-xs font-medium text-[var(--state-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--state-success)]" />
            {activeLabel}
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
            {inactiveLabel}
        </span>
    );
}
