"use client";
import { useState, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Hex } from 'viem';
import { Button } from '@/components/ui/Button';
import { useMyBinding } from '@/hooks/useMyBinding';
import { BindingSetupModal } from '@/components/binding/BindingSetupModal';

interface Props {
    platformId: Hex;
    platformLabel: string;
    children: ReactNode;
    /** Custom prompt text shown when the user is not yet bound. */
    promptTitle?: string;
    promptBody?: string;
}

export function RequireBindingGate({
    platformId,
    platformLabel,
    children,
    promptTitle,
    promptBody,
}: Props) {
    const { binding, isLoading } = useMyBinding(platformId);
    const [modalOpen, setModalOpen] = useState(false);

    if (isLoading) {
        return (
            <div style={{ padding: 'var(--space-3)', fontSize: '13px', color: 'var(--text-muted)' }}>
                Checking platform binding…
            </div>
        );
    }

    if (!binding) {
        return (
            <>
                <div
                    style={{
                        padding: 'var(--space-4)',
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-3)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShieldAlert size={16} style={{ color: '#e0c060' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {promptTitle ?? `${platformLabel} binding required`}
                        </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {promptBody ??
                            `Before you can act on this ${platformLabel} order, bind your ${platformLabel} account on-chain. The plaintext stays on the server; only a commit hash goes on-chain.`}
                    </p>
                    <div>
                        <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
                            Bind {platformLabel} now
                        </Button>
                    </div>
                </div>
                <BindingSetupModal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    platformId={platformId}
                    platformLabel={platformLabel}
                />
            </>
        );
    }

    return <>{children}</>;
}
