import { BadgeCheck, ShieldCheck, UserRound } from 'lucide-react';
import type * as dbTypes from '@/server/db_types';
import ActionButton from '@/components/ui/ActionButton';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';

interface P2POrderTableProps {
    isLoading: boolean;
    orderList: dbTypes.OrderList[];
    displayPrice: string;
    isBuy: boolean;
    moneyPair: string;
    cryptoPair: string;
    onTradeClick: (item: dbTypes.OrderList) => void;
}

function formatContractAddress(address: string) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatOrderCapacity(minAmount: number, maxAmount: number) {
    return `${minAmount.toLocaleString('en-US')} - ${maxAmount.toLocaleString('en-US')} USD`;
}

function LoadingRows() {
    return (
        <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)]" />
            ))}
        </div>
    );
}

export default function P2POrderTable({
    isLoading,
    orderList,
    displayPrice,
    isBuy,
    moneyPair,
    cryptoPair,
    onTradeClick,
}: P2POrderTableProps) {
    return (
        <SurfaceCard className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-4 py-3 text-xs text-[var(--text-muted)]">
                <div className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[var(--state-success)]" />
                    Advertiser Orderbook
                </div>
                <div className="font-medium text-[var(--text-secondary)]">Best Price: ¥ {displayPrice}</div>
            </div>

            {isLoading ? (
                <LoadingRows />
            ) : orderList.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-[var(--text-subtle)]">暂无可用订单 No orders available</div>
            ) : (
                <div className="space-y-3 p-4">
                    {orderList.map((item) => (
                        <article
                            key={String(item.order_id)}
                            className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4 transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)]"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-52 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-1)]">
                                            <UserRound className="h-5 w-5 text-[var(--text-secondary)]" />
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-white">{formatContractAddress(item.wallet_address)}</span>
                                                {item.user_level > 0 && <BadgeCheck className="h-4 w-4 text-[var(--accent-cta)]" aria-label="已认证" />}
                                                <StatusPill label={`L${item.user_level}`} tone="info" />
                                            </div>
                                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                                {item.trading_volume} 成交量 · {item.success_rate}% 成交率
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {item.supported_methods.split(', ').map((method) => (
                                            <StatusPill key={`${item.order_id}-${method}`} label={method} tone="neutral" />
                                        ))}
                                    </div>
                                </div>

                                <div className="min-w-44">
                                    <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">价格 Price</p>
                                    <p className="mt-1 font-[var(--font-mono)] text-2xl font-semibold text-white">¥ {displayPrice}</p>
                                    <p className="mt-2 text-xs text-[var(--text-subtle)]">限额 {formatOrderCapacity(item.min_order_amount, item.max_order_amount)}</p>
                                </div>

                                <div className="flex min-w-44 flex-col gap-2">
                                    <ActionButton onClick={() => onTradeClick(item)}>
                                        {isBuy ? 'Buy' : 'Sell'} {isBuy ? cryptoPair : moneyPair}
                                    </ActionButton>
                                    <ActionButton tone="ghost">查看详情</ActionButton>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </SurfaceCard>
    );
}
