"use client";
import { useState } from 'react';
import type { Hex } from 'viem';
import { Coins, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAdminContract } from '@/hooks/useAdminContract';

interface Props {
    onSuccess: () => void;
}

export default function AddCryptoForm({ onSuccess }: Props) {
    const [tokenAddress, setTokenAddress] = useState('');
    const [isActive, setIsActive]         = useState(true);
    const { state, addCrypto, reset }     = useAdminContract();

    const busy = state.status === 'confirming' || state.status === 'syncing';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) return;
        await addCrypto(tokenAddress as Hex, isActive);
        if (state.status !== 'error') {
            setTokenAddress('');
            setIsActive(true);
            onSuccess();
        }
    };

    return (
        <div className="flex flex-1 flex-col rounded-xl border border-l-4 border-[var(--line-soft)] border-l-[var(--accent-cta)] bg-[var(--bg-surface-1)] p-6">
            {/* Card header */}
            <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:rgb(240_185_11_/_15%)]">
                    <Coins className="h-4 w-4 text-[var(--accent-cta)]" />
                </div>
                <h3 className="text-sm font-semibold text-white">Add Crypto Asset</h3>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Token Address</label>
                    <input
                        className="terminal-input w-full font-mono text-sm"
                        placeholder="0x..."
                        value={tokenAddress}
                        onChange={(e) => { reset(); setTokenAddress(e.target.value); }}
                        disabled={busy}
                        spellCheck={false}
                    />
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-[var(--accent-cta)]"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        disabled={busy}
                    />
                    Active on deployment
                </label>

                {/* Status banners */}
                {state.status === 'error' && (
                    <div className="flex items-start gap-2 rounded-lg border border-[color:rgb(246_70_93_/_30%)] bg-[color:rgb(246_70_93_/_8%)] px-3 py-2.5">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--state-danger)]" />
                        <p className="text-xs text-[var(--state-danger)]">{state.error}</p>
                    </div>
                )}
                {state.status === 'success' && (
                    <div className="flex items-center gap-2 rounded-lg border border-[color:rgb(14_203_129_/_30%)] bg-[color:rgb(14_203_129_/_8%)] px-3 py-2.5">
                        <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-[var(--state-success)]" />
                        <p className="text-xs text-[var(--state-success)]">Added successfully!</p>
                    </div>
                )}
                {(state.status === 'confirming' || state.status === 'syncing') && (
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-3 py-2.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0 text-[var(--text-muted)]" />
                        <p className="text-xs text-[var(--text-subtle)]">
                            {state.status === 'confirming' ? 'Waiting for tx confirmation…' : 'Syncing database…'}
                        </p>
                    </div>
                )}

                <div className="mt-auto flex justify-end">
                    <button
                        type="submit"
                        disabled={busy || !tokenAddress}
                        className="flex h-9 items-center gap-2 rounded-lg bg-[var(--accent-cta)] px-5 text-sm font-semibold text-[var(--text-inverse)] transition-opacity disabled:opacity-40"
                    >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {busy ? 'Processing…' : 'Submit →'}
                    </button>
                </div>
            </form>
        </div>
    );
}
