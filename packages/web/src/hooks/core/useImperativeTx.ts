"use client";
import { useCallback, useState } from 'react';
import type { Hex } from 'viem';

export type TxStatus = 'idle' | 'pending' | 'success' | 'error';

export interface UseImperativeTxReturn {
    status:  TxStatus;
    txHash:  Hex | null;
    error:   string | null;
    setHash: (h: Hex) => void;
    reset:   () => void;
    run<T>(fn: () => Promise<T>):
        Promise<{ ok: true; value: T } | { ok: false; error: string }>;
}

/**
 * Tiny state machine for imperative tx flows: `idle → pending → success / error`.
 * Replaces 4 hand-written variants of the same { status, txHash, error } state
 * (`useAdminContract`, `useProducts`, `useOrderFlow`, `useRiskManager`).
 */
export function useImperativeTx(): UseImperativeTxReturn {
    const [status, setStatus] = useState<TxStatus>('idle');
    const [txHash, setHash]   = useState<Hex | null>(null);
    const [error,  setError]  = useState<string | null>(null);

    const reset = useCallback(() => {
        setStatus('idle');
        setHash(null);
        setError(null);
    }, []);

    const run = useCallback(async <T,>(fn: () => Promise<T>) => {
        setStatus('pending');
        setError(null);
        try {
            const value = await fn();
            setStatus('success');
            return { ok: true as const, value };
        } catch (err: any) {
            const msg = err?.shortMessage || err?.message || String(err);
            setError(msg);
            setStatus('error');
            return { ok: false as const, error: msg };
        }
    }, []);

    return { status, txHash, error, setHash, reset, run };
}
