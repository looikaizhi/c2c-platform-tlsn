"use client";
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Address, type Hex } from 'viem';
import { Wallet } from 'lucide-react';
import { ERC20_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

function formatBalance(text: string): string {
    // Add thousand separators to integer part, keep up to 4 decimal places.
    if (text === '—') return text;
    const [intPart, decPart] = text.split('.');
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${withThousands}.${decPart}` : withThousands;
}

interface Props {
    address: Address;
    /** Title to display ("Wallet balances", "Merchant balances", etc.). */
    title?: string;
}

interface TokenBalance {
    sym: string;
    addr: Hex;
    decimals: number;
    balance: bigint;
}

export default function BalancesCard({ address, title = 'Balances' }: Props) {
    const { network } = useNetwork();
    const [eth, setEth] = useState<bigint | null>(null);
    const [tokens, setTokens] = useState<TokenBalance[] | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const client = getPublicClient(network.chainId);

            const defs: Array<Omit<TokenBalance, 'balance'>> = [
                { sym: 'USDT', addr: network.contracts.usdtToken, decimals: 18 },
                { sym: 'USDC', addr: network.contracts.usdcToken, decimals: 6  },
                { sym: 'DAI',  addr: network.contracts.daiToken,  decimals: 18 },
            ].filter((t) => t.addr && t.addr.length > 2);

            const [ethBal, ...tokBals] = await Promise.all([
                client.getBalance({ address }),
                ...defs.map((t) =>
                    client.readContract({
                        address: t.addr,
                        abi: ERC20_ABI,
                        functionName: 'balanceOf',
                        args: [address],
                    }).catch(() => 0n) as Promise<bigint>,
                ),
            ]);

            setEth(ethBal);
            setTokens(defs.map((d, i) => ({ ...d, balance: tokBals[i] })));
        } catch {
            setEth(null);
            setTokens([]);
        } finally {
            setLoading(false);
        }
    }, [address, network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Skeleton tokens used while loading so the row keeps a stable height —
    // prevents the spinner→grid layout jump that was contributing to merchant
    // page flicker.
    const display = loading
        ? [
              { sym: 'ETH',  text: '—' },
              { sym: 'USDT', text: '—' },
              { sym: 'USDC', text: '—' },
          ]
        : [
              { sym: 'ETH',  text: eth !== null ? Number(formatUnits(eth, 18)).toFixed(4) : '—' },
              ...(tokens ?? []).map((t) => ({
                  sym: t.sym,
                  text: Number(formatUnits(t.balance, t.decimals)).toFixed(4),
              })),
          ];

    return (
        <Card padding="none" className="card-glow px-4 py-3" style={{ minHeight: 88 }}>
            <div className="mb-2 flex items-center gap-1.5">
                <Wallet size={12} className="text-[var(--text-muted)]" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</h3>
                {loading && <span className="ml-auto"><Spinner size="sm" /></span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
                {display.map((t) => (
                    <div key={t.sym} className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-3 py-2 text-center">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{t.sym}</div>
                        <div className={`mt-0.5 font-mono text-[15px] font-semibold leading-tight tabular-nums ${loading ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                            {formatBalance(t.text)}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
