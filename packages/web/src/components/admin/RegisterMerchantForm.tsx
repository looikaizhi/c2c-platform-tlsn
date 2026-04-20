"use client";
import { useState } from 'react';
import type { Hex } from 'viem';
import { UserPlus, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAdminContract } from '@/hooks/useAdminContract';

export default function RegisterMerchantForm() {
    const [merchant, setMerchant]       = useState('');
    const { state, registerMerchant, reset } = useAdminContract();

    const busy = state.status === 'confirming' || state.status === 'syncing';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!merchant.startsWith('0x') || merchant.length !== 42) return;
        await registerMerchant(merchant as Hex);
        if (state.status !== 'error') setMerchant('');
    };

    return (
        <div className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-2)] shadow-[0_8px_24px_rgb(0_0_0_/_20%)]">
            {/* Warning banner — spans full card width */}
            <div className="flex items-center gap-2.5 border-b border-[color:rgb(240_185_11_/_20%)] border-l-4 border-l-[var(--state-warning)] bg-[color:rgb(240_185_11_/_6%)] px-6 py-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--state-warning)]" />
                <p className="text-xs text-[var(--state-warning)]">
                    Admin-only operation — this bypasses KYB verification and directly activates the merchant.
                </p>
            </div>

            <div className="p-6">
                {/* Section header */}
                <div className="mb-1.5 flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:rgb(240_185_11_/_15%)]">
                        <UserPlus className="h-4 w-4 text-[var(--accent-cta)]" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">Register Merchant by Admin</h3>
                </div>
                <p className="mb-5 pl-10 text-xs text-[var(--text-muted)]">
                    Registers a wallet as an active merchant directly, skipping the TLSN proof requirement.
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="flex items-end gap-4">
                        <div className="flex flex-1 flex-col gap-1.5">
                            <label className="text-xs font-medium text-[var(--text-secondary)]">Merchant Wallet Address</label>
                            <input
                                className="terminal-input w-full font-mono text-sm"
                                placeholder="0x..."
                                value={merchant}
                                onChange={(e) => { reset(); setMerchant(e.target.value); }}
                                disabled={busy}
                                spellCheck={false}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={busy || !merchant}
                            className="flex h-12 flex-shrink-0 items-center gap-2 rounded-lg border border-[var(--state-warning)] px-5 text-sm font-semibold text-[var(--state-warning)] transition-all hover:bg-[color:rgb(240_185_11_/_10%)] disabled:opacity-40"
                        >
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {busy ? 'Processing…' : 'Register →'}
                        </button>
                    </div>

                    {/* Status banners */}
                    {state.status === 'error' && (
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[color:rgb(246_70_93_/_30%)] bg-[color:rgb(246_70_93_/_8%)] px-3 py-2.5">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--state-danger)]" />
                            <p className="text-xs text-[var(--state-danger)]">{state.error}</p>
                        </div>
                    )}
                    {state.status === 'success' && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color:rgb(14_203_129_/_30%)] bg-[color:rgb(14_203_129_/_8%)] px-3 py-2.5">
                            <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-[var(--state-success)]" />
                            <p className="text-xs text-[var(--state-success)]">
                                Merchant registered successfully!
                                {state.txHash && (
                                    <span className="ml-2 font-mono text-[var(--text-muted)]">
                                        tx: {state.txHash.slice(0, 10)}…{state.txHash.slice(-6)}
                                    </span>
                                )}
                            </p>
                        </div>
                    )}
                    {(state.status === 'confirming' || state.status === 'syncing') && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-3)] px-3 py-2.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0 text-[var(--text-muted)]" />
                            <p className="text-xs text-[var(--text-subtle)]">Waiting for tx confirmation…</p>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
