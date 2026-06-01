"use client";
import { useState } from 'react';
import type { Hex } from 'viem';
import { Coins } from 'lucide-react';
import { useAdminContract } from '@/hooks/useAdminContract';
import { AssetForm } from '@/components/shared/AssetForm';

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
        <AssetForm
            title="Add Crypto Asset"
            icon={Coins}
            iconBgClass="bg-[color:rgb(240_185_11_/_15%)]"
            iconColorVar="text-[var(--accent-cta)]"
            accentVar="var(--accent-cta)"
            status={state.status}
            error={state.error}
            canSubmit={tokenAddress.length === 42 && tokenAddress.startsWith('0x')}
            onSubmit={handleSubmit}
        >
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
        </AssetForm>
    );
}
