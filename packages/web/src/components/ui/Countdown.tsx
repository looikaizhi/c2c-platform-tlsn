"use client";

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownProps {
    deadline: bigint;
    onExpire?: () => void;
    /**
     * Seconds to add to the local wall-clock to approximate chain time.
     * Use this when hardhat / anvil block.timestamp has drifted from real time.
     * Compute once on mount: `chainTs - Math.floor(Date.now() / 1000)`.
     */
    nowOffsetSeconds?: number;
}

export function Countdown({ deadline, onExpire, nowOffsetSeconds = 0 }: CountdownProps) {
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

    useEffect(() => {
        const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(id);
    }, []);

    const remaining = Number(deadline) - (now + nowOffsetSeconds);
    const expired = remaining <= 0;
    const urgent = !expired && remaining < 5 * 60;
    const warning = !expired && !urgent && remaining < 15 * 60;

    useEffect(() => {
        if (expired && onExpire) onExpire();
    }, [expired, onExpire]);

    const color = expired ? 'var(--status-danger)'
        : urgent ? 'var(--status-danger)'
            : warning ? 'var(--status-warning)'
                : 'var(--text-muted)';

    const label = expired
        ? 'Expired'
        : (() => {
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            if (m >= 60) {
                const h = Math.floor(m / 60);
                return `${h}h ${m % 60}m`;
            }
            return `${m}m ${String(s).padStart(2, '0')}s`;
        })();

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${urgent ? 'animate-pulse' : ''}`}
            style={{
                color,
                background: urgent || expired ? 'var(--status-danger-bg)' : 'var(--bg-surface-2)',
            }}
            aria-label={`Deadline ${label}`}
        >
            <Clock size={10} />
            {label}
        </span>
    );
}
