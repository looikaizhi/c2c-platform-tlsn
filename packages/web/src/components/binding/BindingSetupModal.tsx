"use client";
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { Hex } from 'viem';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useWallet } from '@/hooks/useWallet';
import { useProducts } from '@/hooks/useProducts';
import { useMyBinding } from '@/hooks/useMyBinding';
import { useBindingMutations } from '@/hooks/mutations/useBindingMutations';
import { ApiError } from '@/api/errors';
import { maskForProof } from '@/lib/proofMask';

interface Props {
    open: boolean;
    onClose: () => void;
    platformId: Hex;
    platformLabel: string;
    onComplete?: () => void;
}

type Phase = 'idle' | 'writing-db' | 'awaiting-wallet' | 'success' | 'error';

export function BindingSetupModal({
    open,
    onClose,
    platformId,
    platformLabel,
    onComplete,
}: Props) {
    const { address, isConnected } = useWallet();
    const products = useProducts();
    const { binding, refetch } = useMyBinding(platformId);
    const { register: registerMut } = useBindingMutations(address);
    const [name, setName] = useState('');
    const [handle, setHandle] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const reset = () => {
        setName('');
        setHandle('');
        setPhase('idle');
        setErrorMsg(null);
    };

    const handleClose = () => {
        if (phase === 'writing-db' || phase === 'awaiting-wallet') return;
        reset();
        onClose();
    };

    const handleSubmit = async () => {
        if (!address || !isConnected) {
            setErrorMsg('Wallet not connected.');
            setPhase('error');
            return;
        }
        const trimmedName = name.trim();
        const trimmedHandle = handle.trim();
        if (!trimmedName || !trimmedHandle) {
            setErrorMsg('Name and handle are required.');
            setPhase('error');
            return;
        }

        setErrorMsg(null);
        setPhase('writing-db');

        let commits: { nameCommit: Hex; idCommit: Hex };
        try {
            const data = await registerMut.mutateAsync({
                platformId,
                name: trimmedName,
                handle: trimmedHandle,
            });
            commits = { nameCommit: data.nameCommit, idCommit: data.idCommit };
        } catch (err: unknown) {
            const msg = err instanceof ApiError ? err.message
                : err instanceof Error ? err.message
                : 'register_failed';
            setErrorMsg(`DB write failed: ${msg}`);
            setPhase('error');
            return;
        }

        setPhase('awaiting-wallet');
        try {
            await products.setPaymentInfoForPlatform(
                platformId,
                commits.nameCommit,
                commits.idCommit,
            );
            if (products.status === 'error') {
                throw new Error(products.error ?? 'wallet_tx_failed');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'wallet_tx_failed';
            setErrorMsg(
                `Server saved your binding, but the on-chain commit failed: ${msg}. ` +
                'Reopen this dialog to retry just the on-chain step.',
            );
            setPhase('error');
            await refetch();
            return;
        }

        setPhase('success');
        await refetch();
        onComplete?.();
    };

    const submitting = phase === 'writing-db' || phase === 'awaiting-wallet';
    const successDone = phase === 'success';

    // What the payment-detail proof will actually reveal for this platform. The
    // on-chain commit is computed over this masked form, so we show it to the
    // merchant to confirm it matches what the platform returns. Hidden when the
    // platform returns the full identity unchanged (e.g. Wise).
    const masked = maskForProof(platformId, { name: name.trim(), handle: handle.trim() });
    const showMaskedPreview =
        (!!name.trim() || !!handle.trim()) &&
        (masked.name !== name.trim() || masked.handle !== handle.trim());

    return (
        <Modal open={open} onClose={handleClose} title={`Bind ${platformLabel} account`} size="md">
            {binding && (
                <div
                    style={{
                        marginBottom: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                        Current binding
                    </div>
                    <div>Name: {binding.plaintextName}</div>
                    <div>Handle: {binding.plaintextHandle}</div>
                    <div style={{ marginTop: 6, fontSize: '12px', color: 'var(--text-muted)' }}>
                        Submitting below will supersede this binding (old commit stays for historical orders).
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Display name on {platformLabel}</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={platformLabel === 'Wise' ? 'e.g. KAI XU LOOI' : 'e.g. KELLY LIM HOOI YEN'}
                        disabled={submitting || successDone}
                        className="terminal-input h-10 px-2 text-sm"
                    />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        {platformLabel === 'Wise' ? 'Wise handle (e.g. @kaixul1)' : 'Alipay phone / email'}
                    </span>
                    <input
                        type="text"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder={platformLabel === 'Wise' ? '@yourhandle' : 'you@example.com or 15812345662'}
                        disabled={submitting || successDone}
                        className="terminal-input h-10 px-2 text-sm"
                    />
                </label>

                {showMaskedPreview && (
                    <div
                        style={{
                            padding: 'var(--space-2) var(--space-3)',
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                        }}
                    >
                        Enter your full account details above. The {platformLabel} proof will
                        reveal them masked — confirm this matches what {platformLabel} shows:
                        <div style={{ marginTop: 4, color: 'var(--text-primary)' }}>
                            name <code>{masked.name || '—'}</code> · handle <code>{masked.handle || '—'}</code>
                        </div>
                    </div>
                )}
            </div>

            <ol
                style={{
                    margin: 'var(--space-4) 0 0',
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    fontSize: '13px',
                }}
            >
                <Step
                    label="Write binding to server (with random salt)"
                    state={phase === 'idle' ? 'pending' : phase === 'writing-db' ? 'active' : 'done'}
                />
                <Step
                    label="Confirm on-chain commit in your wallet"
                    state={
                        phase === 'idle' || phase === 'writing-db'
                            ? 'pending'
                            : phase === 'awaiting-wallet'
                                ? 'active'
                                : phase === 'success'
                                    ? 'done'
                                    : 'pending'
                    }
                />
            </ol>

            {errorMsg && (
                <div
                    style={{
                        marginTop: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        background: 'rgba(220, 50, 50, 0.08)',
                        border: '1px solid rgba(220, 50, 50, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        color: '#f99',
                        fontSize: '12px',
                    }}
                >
                    {errorMsg}
                </div>
            )}

            {successDone && (
                <div
                    style={{
                        marginTop: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        background: 'rgba(50, 200, 100, 0.08)',
                        border: '1px solid rgba(50, 200, 100, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        color: '#9f9',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <CheckCircle2 size={16} />
                    <span>Binding complete.</span>
                </div>
            )}

            <div
                style={{
                    marginTop: 'var(--space-4)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 'var(--space-2)',
                }}
            >
                <Button variant="ghost" size="sm" onClick={handleClose} disabled={submitting}>
                    {successDone ? 'Close' : 'Cancel'}
                </Button>
                {!successDone && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSubmit}
                        disabled={submitting || !name.trim() || !handle.trim() || !address}
                    >
                        {submitting ? 'Submitting…' : 'Bind'}
                    </Button>
                )}
            </div>
        </Modal>
    );
}

function Step({ label, state }: { label: string; state: 'pending' | 'active' | 'done' }) {
    const icon =
        state === 'done' ? (
            <CheckCircle2 size={14} style={{ color: '#7ce0a3' }} />
        ) : state === 'active' ? (
            <Loader2 size={14} style={{ color: 'var(--text-secondary)', animation: 'spin 1s linear infinite' }} />
        ) : (
            <span
                style={{
                    width: 14,
                    height: 14,
                    display: 'inline-block',
                    borderRadius: '50%',
                    border: '1px solid var(--border-default)',
                }}
            />
        );
    return (
        <li
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
            }}
        >
            {icon}
            <span>{label}</span>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </li>
    );
}
