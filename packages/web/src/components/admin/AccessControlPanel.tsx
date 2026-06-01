"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { useAdminContract } from '@/hooks/useAdminContract';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const HEX_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDR = ('0x' + '0'.repeat(40)) as Address;

export default function AccessControlPanel() {
    const { network } = useNetwork();
    const admin = useAdminContract();

    const [currentAdmin, setCurrentAdmin] = useState<Address | null>(null);
    const [pendingAdmin, setPendingAdmin] = useState<Address | null>(null);
    const [newAdminInput, setNewAdminInput] = useState('');
    const [callerInput, setCallerInput] = useState('');
    const [callerGranted, setCallerGranted] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const client = getPublicClient(network.chainId);
            const [a, p] = await Promise.all([
                client.readContract({ address: network.contracts.c2cAdmin, abi: C2C_ADMIN_ABI, functionName: 'admin' }),
                client.readContract({ address: network.contracts.c2cAdmin, abi: C2C_ADMIN_ABI, functionName: 'pendingAdmin' }),
            ]);
            setCurrentAdmin(a as Address);
            setPendingAdmin(p as Address);
        } catch {
            setCurrentAdmin(null);
            setPendingAdmin(null);
        }
    }, [network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handlePropose = async () => {
        if (!HEX_RE.test(newAdminInput.trim())) return;
        await admin.proposeAdminTransfer(newAdminInput.trim() as Hex);
        setNewAdminInput('');
        await refresh();
    };

    const handleAccept = async () => {
        await admin.acceptAdmin();
        await refresh();
    };

    const handleSetCaller = async () => {
        if (!HEX_RE.test(callerInput.trim())) return;
        await admin.setAuthorizedCaller(callerInput.trim() as Hex, callerGranted);
        setCallerInput('');
    };

    const hasPending = pendingAdmin && pendingAdmin !== ZERO_ADDR;

    return (
        <Card padding="none" className="space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">Access control</h3>

            <div className="space-y-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">Current admin</span>
                    {currentAdmin ? <AddressDisplay address={currentAdmin} truncate copyable /> : <span>—</span>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">Pending admin</span>
                    {hasPending && pendingAdmin ? (
                        <AddressDisplay address={pendingAdmin} truncate copyable />
                    ) : (
                        <span className="text-xs text-[var(--text-muted)]">none</span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                    <input
                        type="text"
                        value={newAdminInput}
                        onChange={(e) => setNewAdminInput(e.target.value)}
                        placeholder="New admin 0x..."
                        className="terminal-input h-10 min-w-72 flex-1 px-2 font-mono text-sm"
                    />
                    <Button variant="primary" size="sm" onClick={handlePropose} disabled={!HEX_RE.test(newAdminInput.trim()) || admin.state.status === 'confirming'}>
                        Propose transfer
                    </Button>
                    {hasPending && (
                        <Button variant="buy" size="sm" onClick={handleAccept} disabled={admin.state.status === 'confirming'}>
                            Accept (as pending admin)
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3">
                <div className="text-sm font-semibold text-white">Authorized callers</div>
                <p className="text-xs text-[var(--text-subtle)]">Grant/revoke external contracts (e.g. C2CEscrow) the right to invoke privileged admin calls.</p>
                <div className="flex flex-wrap gap-2">
                    <input
                        type="text"
                        value={callerInput}
                        onChange={(e) => setCallerInput(e.target.value)}
                        placeholder="Caller 0x..."
                        className="terminal-input h-10 min-w-72 flex-1 px-2 font-mono text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={callerGranted}
                            onChange={(e) => setCallerGranted(e.target.checked)}
                        />
                        Granted
                    </label>
                    <Button variant="primary" size="sm" onClick={handleSetCaller} disabled={!HEX_RE.test(callerInput.trim()) || admin.state.status === 'confirming'}>
                        Apply
                    </Button>
                </div>
            </div>

            {admin.state.error && <p className="text-xs text-red-400">{admin.state.error}</p>}
        </Card>
    );
}
