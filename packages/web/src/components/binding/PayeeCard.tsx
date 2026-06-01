"use client";
import type { Address } from 'viem';
import { CreditCard, ShieldCheck, ShieldAlert } from 'lucide-react';
import { usePayeeInfo, type PayeeInfoRole } from '@/hooks/usePayeeInfo';

interface Props {
    role: PayeeInfoRole;
    merchant: Address;
    productId: bigint;
    assetType: 0 | 1;
    orderId: bigint;
    /** Defaults to true. Allows caller to defer fetching until modal is visible. */
    enabled?: boolean;
}

const labelFor = (role: PayeeInfoRole) =>
    role === 'payee' ? 'Pay to' : 'Pay buyer';

/**
 * Read-only display card showing the counterparty's platform identity
 * (Wise/Alipay name + handle) for the current order, anchored by the on-chain
 * commit hash that was frozen at placeOrder time. The plaintext is fetched
 * from the server's binding DB (lookup-by-chain-commit, so this survives
 * merchant rebinds).
 */
export function PayeeCard({
    role,
    merchant,
    productId,
    assetType,
    orderId,
    enabled = true,
}: Props) {
    const { info, isLoading, error } = usePayeeInfo({
        role, merchant, productId, assetType, orderId, enabled,
    });

    return (
        <div
            style={{
                padding: 'var(--space-3)',
                background: 'var(--bg-base)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
                <CreditCard size={14} />
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    {labelFor(role)} · counterparty identity
                </span>
            </div>

            {isLoading && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>
            )}

            {error && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#f99' }}>
                    <ShieldAlert size={14} />
                    <span>Could not load counterparty info: {error}</span>
                </div>
            )}

            {info && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Name</span>
                        <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {info.plaintextName}
                        </code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Handle</span>
                        <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {info.plaintextHandle}
                        </code>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: 'var(--text-muted)' }}>
                        <ShieldCheck size={12} style={{ color: '#7ce0a3' }} />
                        <span>
                            Anchored to on-chain commit{' '}
                            <code>{info.anchor.nameHash.slice(0, 10)}…</code>
                        </span>
                        {info.bindingStatus === 'superseded' && (
                            <span style={{ marginLeft: 'auto', color: '#e0c060' }}>
                                (binding has since been re-bound; this order keeps the original)
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
