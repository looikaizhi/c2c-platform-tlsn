"use client";
import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/Button';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
    productId: bigint;
    assetType: number;
    products: ReturnType<typeof useProducts>;
}

function timeToSeconds(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
}

export default function BusinessHoursControl({ productId, assetType, products }: Props) {
    const [openTime, setOpenTime]   = useState('09:00');
    const [closeTime, setCloseTime] = useState('18:00');
    // bitmask: bit 0 = Mon, ... bit 6 = Sun. Default: all 7 days.
    const [activeDays, setActiveDays] = useState<number>(0b1111111);

    const toggleDay = (idx: number) => {
        setActiveDays((mask) => mask ^ (1 << idx));
    };

    const handleSave = async () => {
        await products.setBusinessHours(
            productId,
            assetType,
            timeToSeconds(openTime),
            timeToSeconds(closeTime),
            activeDays,
        );
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Open</label>
                <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="terminal-input h-10 px-2 text-sm"
                />
                <label className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Close</label>
                <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="terminal-input h-10 px-2 text-sm"
                />
            </div>
            <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((label, idx) => {
                    const on = (activeDays & (1 << idx)) !== 0;
                    return (
                        <button
                            key={label}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            className={`rounded-md border px-3 py-1 text-xs font-semibold transition-all ${
                                on
                                    ? 'border-[color:rgb(80_210_193_/_55%)] bg-[color:rgb(80_210_193_/_12%)] text-white'
                                    : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]'
                            }`}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={products.status === 'submitting'}>
                Save business hours
            </Button>
        </div>
    );
}
