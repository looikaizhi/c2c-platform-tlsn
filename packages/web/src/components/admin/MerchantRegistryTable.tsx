"use client";
import { useCallback, useEffect, useState } from 'react';
import { getAbiItem, type Address } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

interface MerchantRow {
    address: Address;
    isActive: boolean;
    kybVerified: boolean;
    registeredAt: bigint;
}

const MERCHANT_REGISTERED_EVENT = getAbiItem({ abi: C2C_ADMIN_ABI, name: 'MerchantRegistered' });

export default function MerchantRegistryTable() {
    const { network } = useNetwork();
    const [rows, setRows] = useState<MerchantRow[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const client = getPublicClient(network.chainId);
            const logs = await client.getLogs({
                address: network.contracts.c2cAdmin,
                event: MERCHANT_REGISTERED_EVENT,
                fromBlock: 0n,
            });
            const unique = new Map<string, Address>();
            for (const l of logs) {
                const addr = (l.args as any).merchant as Address;
                if (addr) unique.set(addr.toLowerCase(), addr);
            }
            const items: MerchantRow[] = await Promise.all(
                Array.from(unique.values()).map(async (addr) => {
                    const result = (await client.readContract({
                        address: network.contracts.c2cAdmin,
                        abi: C2C_ADMIN_ABI,
                        functionName: 'merchants',
                        args: [addr],
                    })) as unknown as readonly [boolean, boolean, bigint, bigint, bigint];
                    return {
                        address: addr,
                        isActive:     result[0],
                        kybVerified:  result[1],
                        registeredAt: result[2],
                    };
                }),
            );
            items.sort((a, b) => Number(b.registeredAt - a.registeredAt));
            setRows(items);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return (
        <Card padding="none" className="p-6">
            <h3 className="mb-3 text-lg font-semibold text-white">Registered merchants</h3>
            {loading ? (
                <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
            ) : rows.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No merchants registered.</p>
            ) : (
                <div className="space-y-2">
                    {rows.map((r) => (
                        <div key={r.address} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3 text-sm">
                            <AddressDisplay address={r.address} truncate copyable />
                            <div className="flex items-center gap-2">
                                <Badge variant={r.isActive ? 'success' : 'danger'} dot>
                                    {r.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                                {r.kybVerified && <Badge variant="info">KYB</Badge>}
                                <span className="text-xs text-[var(--text-muted)]">
                                    {new Date(Number(r.registeredAt) * 1000).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
