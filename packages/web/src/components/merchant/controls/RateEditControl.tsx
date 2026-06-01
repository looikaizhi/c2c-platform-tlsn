"use client";
import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/Button';

const RATE_PRECISION = 1e8;

interface Props {
    productId: bigint;
    assetType: number;
    products: ReturnType<typeof useProducts>;
}

export default function RateEditControl({ productId, assetType, products }: Props) {
    const [rateInput, setRateInput] = useState('');
    const [expiresInput, setExpiresInput] = useState('');
    const [noExpiry, setNoExpiry] = useState(true);

    const handleSave = async () => {
        const num = parseFloat(rateInput);
        if (!isFinite(num) || num <= 0) return;
        const rate = BigInt(Math.round(num * RATE_PRECISION));
        const expiresAt = noExpiry || !expiresInput
            ? 0n
            : BigInt(Math.floor(new Date(expiresInput).getTime() / 1000));
        await products.publishRate(productId, assetType, rate, expiresAt);
    };

    return (
        <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-32">
                <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Rate</label>
                <input
                    type="number"
                    step="0.0001"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    placeholder="e.g. 7.24"
                    className="terminal-input h-10 w-32 px-2 text-sm"
                />
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs text-[var(--text-secondary)]">
                <input
                    type="checkbox"
                    checked={noExpiry}
                    onChange={(e) => setNoExpiry(e.target.checked)}
                />
                <span>No expiry</span>
            </label>
            {!noExpiry && (
                <input
                    type="datetime-local"
                    value={expiresInput}
                    onChange={(e) => setExpiresInput(e.target.value)}
                    className="terminal-input h-10 px-2 text-sm"
                />
            )}
            <Button variant="primary" size="sm" onClick={handleSave} disabled={products.status === 'submitting' || !rateInput}>
                Publish rate
            </Button>
        </div>
    );
}
