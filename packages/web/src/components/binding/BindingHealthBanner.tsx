"use client";
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Hex } from 'viem';
import { Button } from '@/components/ui/Button';
import { useWallet } from '@/hooks/useWallet';
import { useProducts } from '@/hooks/useProducts';
import { useMyBinding } from '@/hooks/useMyBinding';

interface Props {
    platformId: Hex;
    platformLabel: string;
}

/**
 * Shown only when the user has a DB binding for the platform but the on-chain
 * commit is missing or stale (e.g. wallet tx failed after a successful DB
 * write, or someone wrote a different commit directly to the contract).
 * Lets the user push the DB commit back on-chain in one click.
 */
export function BindingHealthBanner({ platformId, platformLabel }: Props) {
    const { selectedWallet } = useWallet();
    const products = useProducts();
    const { binding, inSync, isLoading, refetch } = useMyBinding(platformId);
    const [isPushing, setIsPushing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (isLoading || !binding || inSync) return null;

    const push = async () => {
        setErrorMsg(null);
        setIsPushing(true);
        try {
            await products.setPaymentInfoForPlatform(
                platformId,
                binding.nameCommit,
                binding.idCommit,
            );
            if (products.status === 'error') {
                throw new Error(products.error ?? 'wallet_tx_failed');
            }
            await refetch();
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'wallet_tx_failed');
        } finally {
            setIsPushing(false);
        }
    };

    return (
        <div
            style={{
                padding: 'var(--space-3)',
                background: 'rgba(224, 192, 96, 0.08)',
                border: '1px solid rgba(224, 192, 96, 0.4)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} style={{ color: '#e0c060' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                    {platformLabel} binding out of sync
                </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Your server binding does not match the commit currently stored on-chain. Click below
                to push the server commit back on-chain — your existing orders are not affected.
            </p>
            {errorMsg && (
                <div style={{ fontSize: '12px', color: '#f99' }}>{errorMsg}</div>
            )}
            <div>
                <Button variant="primary" size="sm" onClick={push} disabled={isPushing}>
                    {isPushing ? 'Pushing…' : 'Push commit on-chain'}
                </Button>
            </div>
        </div>
    );
}
