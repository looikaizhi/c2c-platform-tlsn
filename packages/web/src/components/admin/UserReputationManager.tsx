"use client";
import { useState } from 'react';
import type { Hex } from 'viem';
import { useRiskManager, type ReputationView } from '@/hooks/useRiskManager';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const HEX_RE = /^0x[a-fA-F0-9]{40}$/;

export default function UserReputationManager() {
    const rm = useRiskManager();
    const [addrInput, setAddrInput] = useState('');
    const [rep, setRep] = useState<ReputationView | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isValid = HEX_RE.test(addrInput.trim());

    const query = async () => {
        setError(null);
        setRep(null);
        if (!isValid) {
            setError('Invalid address');
            return;
        }
        setBusy(true);
        try {
            const v = await rm.queryReputation(addrInput.trim() as Hex);
            setRep(v);
        } finally {
            setBusy(false);
        }
    };

    const callRisk = async (action: () => Promise<void>) => {
        setError(null);
        setBusy(true);
        try {
            await action();
            // re-query after action
            const v = await rm.queryReputation(addrInput.trim() as Hex);
            setRep(v);
        } catch (e: any) {
            setError(e?.message ?? 'tx failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card padding="none" className="p-6">
            <h3 className="mb-3 text-lg font-semibold text-white">User reputation</h3>
            <div className="flex flex-wrap gap-2">
                <input
                    type="text"
                    value={addrInput}
                    onChange={(e) => setAddrInput(e.target.value)}
                    placeholder="0x..."
                    className="terminal-input h-10 min-w-72 flex-1 px-2 font-mono text-sm"
                />
                <Button variant="primary" size="sm" onClick={query} disabled={!isValid || busy}>Query</Button>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            {rep && (
                <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant={rep.blacklisted ? 'danger' : 'success'} dot>
                            {rep.blacklisted ? 'Blacklisted' : 'OK'}
                        </Badge>
                        {rep.temporarilyFrozen && <Badge variant="warning" dot>Frozen</Badge>}
                        <span className="text-[var(--text-muted)]">Risk level: {rep.riskLevel}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-2">
                            <div className="text-[var(--text-muted)]">Completed</div>
                            <div className="font-mono">{rep.completedCount}</div>
                        </div>
                        <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-2">
                            <div className="text-[var(--text-muted)]">Timeouts</div>
                            <div className="font-mono">{rep.timeoutCount}</div>
                        </div>
                        <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-2">
                            <div className="text-[var(--text-muted)]">Consecutive</div>
                            <div className="font-mono">{rep.consecutiveTimeouts}</div>
                        </div>
                        <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-2">
                            <div className="text-[var(--text-muted)]">Frozen until</div>
                            <div className="font-mono text-xs">
                                {rep.frozenUntil > 0n ? new Date(Number(rep.frozenUntil) * 1000).toLocaleString() : '—'}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy || rep.blacklisted}
                            onClick={() => callRisk(() => rm.setBlacklist(addrInput.trim() as Hex, true))}
                        >
                            Blacklist
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy || !rep.blacklisted}
                            onClick={() => callRisk(() => rm.setBlacklist(addrInput.trim() as Hex, false))}
                        >
                            Unblacklist
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || !rep.temporarilyFrozen}
                            onClick={() => callRisk(() => rm.manualUnfreeze(addrInput.trim() as Hex))}
                        >
                            Manual unfreeze
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
}
