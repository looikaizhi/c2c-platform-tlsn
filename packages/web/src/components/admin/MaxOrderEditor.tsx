"use client";
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { useAdminContract } from '@/hooks/useAdminContract';
import { getPublicClient } from '@/chain/clients';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const DECIMALS = 18;

export default function MaxOrderEditor() {
    const { network } = useNetwork();
    const admin = useAdminContract();
    const [current, setCurrent] = useState<bigint | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    const refresh = useCallback(async () => {
        try {
            const client = getPublicClient(network.chainId);
            const v = (await client.readContract({
                address: network.contracts.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'maxOrderAmount',
            })) as bigint;
            setCurrent(v);
        } catch {
            setCurrent(null);
        }
    }, [network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleSave = async () => {
        if (!draft) return;
        let parsed: bigint;
        try {
            parsed = parseUnits(draft as `${number}`, DECIMALS);
        } catch {
            return;
        }
        await admin.setMaxOrderAmount(parsed);
        setEditing(false);
        setDraft('');
        await refresh();
    };

    return (
        <Card padding="none" className="p-6">
            <h3 className="mb-3 text-lg font-semibold text-white">Global max order amount</h3>
            <p className="mb-3 text-xs text-[var(--text-subtle)]">Maximum amount per order across all products (token-decimals: 18).</p>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Current:</span>
                <span className="font-mono text-sm">
                    {current === null ? '—' : `${formatUnits(current, DECIMALS)}`}
                </span>
                {!editing ? (
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(true); setDraft(current ? formatUnits(current, DECIMALS) : ''); }}>Edit</Button>
                ) : (
                    <>
                        <input
                            type="number"
                            step="any"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="terminal-input h-10 w-40 px-2 text-sm"
                        />
                        <Button variant="primary" size="sm" onClick={handleSave} disabled={admin.state.status === 'confirming'}>Save</Button>
                        <Button variant="ghost"   size="sm" onClick={() => { setEditing(false); setDraft(''); }}>Cancel</Button>
                    </>
                )}
            </div>
            {admin.state.error && <p className="mt-2 text-xs text-red-400">{admin.state.error}</p>}
        </Card>
    );
}
