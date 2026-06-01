"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    formatUnits,
    getAbiItem,
    type Address,
    type Hex,
} from 'viem';
import { ArrowRight, ChevronDown, ChevronUp, PackageOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { Spinner } from '@/components/ui/Spinner';
import { ProofStepper } from '@/components/proof/ProofStepper';
import { C2C_ESCROW_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { PLATFORM_WISE } from '@/platforms/registry';
import { platformDisplay } from '@/constants/platforms';

interface Props {
    address: Address;
    /**
     * Called after the orders list refreshes (after sweep / proof submit /
     * countdown expiry). The dashboard hooks this to `reputation.refetch`
     * so the reputation card reflects timeout-driven score changes within
     * one keeper sweep cycle.
     */
    onOrderChange?: () => void;
}

interface ActiveOrder {
    buyer: Address;
    merchant: Address;
    orderId: bigint;
    productId: bigint;
    assetType: 0 | 1;
    amount: bigint;
    deadline: bigint;
    status: number;
    platformId: Hex;
}

const ORDER_PLACED_EVENT = getAbiItem({ abi: C2C_ESCROW_ABI, name: 'OrderPlaced' });

const STATUS_LABEL: Record<number, string> = {
    0: 'PENDING',
    1: 'COMPLETED',
    2: 'CANCELLED',
    3: 'WAITING',
    4: 'EXPIRED',
};

function formatBalance4(text: string): string {
    if (text === '—') return text;
    const [intPart, decPart] = text.split('.');
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${withThousands}.${decPart}` : withThousands;
}

function OrderRow({
    row,
    refresh,
    defaultExpanded,
}: {
    row: ActiveOrder;
    refresh: () => void;
    defaultExpanded: boolean;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    // Tracks whether the countdown has crossed the deadline locally — even if
    // the chain hasn't recorded `status=EXPIRED` yet (i.e. before the keeper
    // sweep lands), submitting a proof would just revert with OutOfDeadline.
    const [countdownExpired, setCountdownExpired] = useState(false);
    const isCrypto = row.assetType === 0;
    const isWise   = row.platformId === PLATFORM_WISE;
    const platform = platformDisplay(row.platformId);
    const canGenerate =
        isCrypto && row.status === 0 && platform !== null && !countdownExpired;
    const assetTypeColor = isCrypto
        ? { color: 'var(--color-buy)',     bg: 'var(--color-buy-bg)' }
        : { color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' };
    const isUrgent = Number(row.deadline) - Math.floor(Date.now() / 1000) < 5 * 60;

    // Promote to expanded automatically if entering an urgent state.
    useEffect(() => {
        if (isUrgent) setExpanded(true);
    }, [isUrgent]);

    // Once the countdown reports expiry, collapse the proof panel and pull
    // a fresh state — the keeper sweep should land within the grace window.
    const handleExpire = useCallback(() => {
        setCountdownExpired(true);
        setExpanded(false);
        refresh();
    }, [refresh]);

    return (
        <div className="overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] transition-colors hover:border-[var(--line-strong)]">
            {/* Collapsed header — always visible */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ minHeight: 52 }}>
                <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                    style={{ color: assetTypeColor.color, background: assetTypeColor.bg }}
                >
                    {isCrypto ? 'CRYPTO' : 'FIAT'}
                </span>
                {platform && (
                    <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                        style={{ color: platform.color, background: platform.bg }}
                    >
                        {platform.label}
                    </span>
                )}
                <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">#{row.orderId.toString()}</span>
                <Badge variant={row.status === 0 ? 'warning' : 'info'} dot size="sm">
                    {STATUS_LABEL[row.status] ?? `STATUS ${row.status}`}
                </Badge>
                <Countdown deadline={row.deadline} onExpire={handleExpire} />

                {canGenerate && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--bg-surface-3)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cta)]"
                        aria-expanded={expanded}
                    >
                        {expanded ? 'Hide proof flow' : 'Submit payment proof'}
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                )}
            </div>

            <div className="border-t border-[var(--line-soft)] px-4 py-2 text-xs text-[var(--text-muted)]">
                <span className="font-mono tabular-nums text-[var(--text-primary)]">
                    {formatBalance4(Number(formatUnits(row.amount, 18)).toFixed(4))}
                </span>
                <span className="ml-1">USDT</span>
                <span className="mx-2">·</span>
                <span>Merchant <span className="font-mono">{row.merchant.slice(0, 6)}…{row.merchant.slice(-4)}</span></span>
                <span className="mx-2">·</span>
                <span>Deadline <span className="font-mono">{new Date(Number(row.deadline) * 1000).toLocaleTimeString()}</span></span>
                {countdownExpired && row.status === 0 && (
                    <>
                        <span className="mx-2">·</span>
                        <span className="text-[var(--status-danger)]">Awaiting keeper sweep…</span>
                    </>
                )}
            </div>

            {/* Expanded ProofFlow */}
            {expanded && canGenerate && (
                <div className="border-t border-[var(--line-soft)] p-4">
                    <ProofStepper
                        merchant={row.merchant}
                        productId={row.productId}
                        orderId={row.orderId}
                        assetType={row.assetType}
                        platform={isWise ? 'wise' : 'alipay'}
                        direction="crypto"
                        onProofSubmitted={() => refresh()}
                    />
                </div>
            )}
        </div>
    );
}

export default function ActiveOrdersList({ address, onOrderChange }: Props) {
    const { network } = useNetwork();
    const [orders, setOrders] = useState<ActiveOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const client = getPublicClient(network.chainId);

            const logs = await client.getLogs({
                address: network.contracts.c2cEscrow,
                event: ORDER_PLACED_EVENT,
                args: { buyer: address } as any,
                fromBlock: 0n,
            });

            const items: ActiveOrder[] = await Promise.all(
                logs.map(async (l) => {
                    const a = l.args as any;
                    const assetType = Number(a.assetType) as 0 | 1;
                    const orderTuple = (await client.readContract({
                        address: network.contracts.c2cEscrow,
                        abi: C2C_ESCROW_ABI,
                        functionName: 'getOrder',
                        args: [a.merchant, a.productId, assetType, a.orderId],
                    })) as unknown as readonly [Address, bigint, bigint, bigint, number, number, Hex, Hex, Hex];
                    const platformId = (await client.readContract({
                        address: network.contracts.c2cEscrow,
                        abi: C2C_ESCROW_ABI,
                        functionName: 'getProductPlatformId',
                        args: [a.merchant, a.productId, assetType],
                    })) as Hex;
                    return {
                        buyer: a.buyer,
                        merchant: a.merchant,
                        orderId: a.orderId,
                        productId: a.productId,
                        assetType,
                        amount: orderTuple[1],
                        deadline: orderTuple[3],
                        status: orderTuple[4],
                        platformId,
                    };
                }),
            );

            setOrders(items.filter((o) => o.status === 0 || o.status === 3));
            // Refresh succeeded — let the parent know so it can pull related
            // state (e.g. reputation score after a keeper-driven timeout).
            onOrderChange?.();
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, [address, network, onOrderChange]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const { pendingCount, waitingCount, firstPendingKey } = useMemo(() => {
        let p = 0, w = 0;
        let firstKey: string | null = null;
        for (const o of orders) {
            if (o.status === 0) {
                p += 1;
                if (firstKey === null) firstKey = `${o.merchant}-${o.productId}-${o.orderId}`;
            }
            if (o.status === 3) w += 1;
        }
        return { pendingCount: p, waitingCount: w, firstPendingKey: firstKey };
    }, [orders]);

    return (
        <Card padding="none" className="card-glow flex min-h-0 flex-1 flex-col p-4">
            {/* Section header */}
            <div className="mb-3 flex flex-shrink-0 items-center gap-2">
                <PackageOpen size={14} className="text-[var(--text-muted)]" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Active orders</h3>
                {orders.length > 0 && (
                    <span className="rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-[var(--text-primary)]">
                        {orders.length}
                    </span>
                )}
                {(pendingCount > 0 || waitingCount > 0) && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                        ·{' '}
                        {pendingCount > 0 && <><span className="text-[var(--status-warning)]">{pendingCount}</span> pending</>}
                        {pendingCount > 0 && waitingCount > 0 && ' · '}
                        {waitingCount > 0 && <><span className="text-[var(--status-info)]">{waitingCount}</span> waiting</>}
                    </span>
                )}
                {loading && <span className="ml-auto"><Spinner size="sm" /></span>}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? null : orders.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]">
                            <PackageOpen size={20} strokeWidth={1.5} />
                        </div>
                        <div>
                            <p className="text-sm text-[var(--text-secondary)]">No active orders yet.</p>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Place your first order on the P2P market.</p>
                        </div>
                        <Link
                            href="/trade/p2p"
                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-cta)] bg-[color:rgb(80_210_193_/_12%)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[color:rgb(80_210_193_/_20%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cta)]"
                        >
                            Browse P2P market <ArrowRight size={14} />
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {orders.map((row) => {
                            const key = `${row.merchant}-${row.productId}-${row.orderId}`;
                            return (
                                <OrderRow
                                    key={key}
                                    row={row}
                                    refresh={refresh}
                                    defaultExpanded={key === firstPendingKey}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}
