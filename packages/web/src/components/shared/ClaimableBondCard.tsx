"use client";
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Address, type Hex } from 'viem';
import { Coins, PiggyBank } from 'lucide-react';
import { C2C_BOND_VAULT_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { getPublicClient } from '@/chain/clients';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
    address: Address;
    title?: string;
}

interface ClaimRow {
    sym: string;
    addr: Hex;
    decimals: number;
    balance: bigint;
}

export default function ClaimableBondCard({ address, title = 'Claimable bond' }: Props) {
    const { network } = useNetwork();
    const orderFlow = useOrderFlow();
    const [rows, setRows] = useState<ClaimRow[] | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const client = getPublicClient(network.chainId);

            const defs: Array<Omit<ClaimRow, 'balance'>> = [
                { sym: 'USDT', addr: network.contracts.usdtToken, decimals: 18 },
                { sym: 'USDC', addr: network.contracts.usdcToken, decimals: 6  },
                { sym: 'DAI',  addr: network.contracts.daiToken,  decimals: 18 },
            ].filter((t) => t.addr && t.addr.length > 2);

            const balances = await Promise.all(
                defs.map((t) =>
                    client.readContract({
                        address: network.contracts.c2cBondVault,
                        abi: C2C_BOND_VAULT_ABI,
                        functionName: 'claimableBalance',
                        args: [address, t.addr],
                    }).catch(() => 0n) as Promise<bigint>,
                ),
            );
            setRows(defs.map((d, i) => ({ ...d, balance: balances[i] })));
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [address, network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const claim = async (tokenAddr: Hex) => {
        await orderFlow.claimRefund(tokenAddr);
        await refresh();
    };

    const claimable = (rows ?? []).filter((r) => r.balance > 0n);

    return (
        <Card padding="none" className="card-glow p-4" style={{ minHeight: 120 }}>
            <div className="mb-2 flex items-center gap-1.5">
                <PiggyBank size={12} className="text-[var(--text-muted)]" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</h3>
                {loading && <span className="ml-auto"><Spinner size="sm" /></span>}
            </div>
            {!loading && claimable.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]">
                        <Coins size={16} strokeWidth={1.5} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">No claimable balances yet.</p>
                </div>
            ) : !loading ? (
                <div className="space-y-1.5">
                    {claimable.map((r) => (
                        <div key={r.sym} className="flex items-center justify-between gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-3 py-1.5">
                            <span className="font-mono text-sm tabular-nums">
                                <span className="font-semibold text-[var(--text-primary)]">{Number(formatUnits(r.balance, r.decimals)).toFixed(4)}</span>
                                <span className="ml-1.5 text-[var(--text-muted)]">{r.sym}</span>
                            </span>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => claim(r.addr)}
                                disabled={orderFlow.status === 'claiming'}
                            >
                                Claim
                            </Button>
                        </div>
                    ))}
                </div>
            ) : null}
            {orderFlow.error && (
                <p className="mt-2 text-xs text-red-400">{orderFlow.error}</p>
            )}
        </Card>
    );
}
