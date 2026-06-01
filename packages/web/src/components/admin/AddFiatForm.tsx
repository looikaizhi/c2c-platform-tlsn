"use client";
import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { useAdminContract } from '@/hooks/useAdminContract';
import { AssetForm } from '@/components/shared/AssetForm';

interface Props {
    onSuccess: () => void;
}

export default function AddFiatForm({ onSuccess }: Props) {
    const [fiatName, setFiatName]   = useState('');
    const [isActive, setIsActive]   = useState(true);
    const { state, addFiat, reset } = useAdminContract();
    const busy = state.status === 'confirming' || state.status === 'syncing';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fiatName.trim()) return;
        await addFiat(fiatName.trim().toUpperCase(), isActive);
        if (state.status !== 'error') {
            setFiatName('');
            setIsActive(true);
            onSuccess();
        }
    };

    return (
        <AssetForm
            title="Add Fiat Asset"
            icon={Landmark}
            iconBgClass="bg-[color:rgb(78_164_255_/_15%)]"
            iconColorVar="text-[var(--state-info)]"
            accentVar="var(--state-info)"
            status={state.status}
            error={state.error}
            canSubmit={fiatName.trim().length > 0}
            onSubmit={handleSubmit}
        >
            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Fiat Name (e.g. MYR, SGD, CNY)</label>
                <input
                    className="terminal-input w-full text-sm"
                    placeholder="MYR"
                    value={fiatName}
                    onChange={(e) => { reset(); setFiatName(e.target.value); }}
                    disabled={busy}
                    maxLength={10}
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
