"use client";

import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Clock3 } from 'lucide-react';
import { useOrderDetailQuery } from '@/hooks/queries/useOrderDetailQuery';
import { useOrderPaymentQuery } from '@/hooks/queries/useOrderPaymentQuery';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { OrderTimeline } from '@/components/orders/OrderTimeline';

interface OrderDetailPageClientProps {
    orderId: string;
}

function formatDateTime(timeStamp: string) {
    const date = new Date(timeStamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatAddress(address: string) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function OrderDetailPageClient({ orderId }: OrderDetailPageClientProps) {
    const orderIdNum = Number(orderId);
    const isValidOrderId = Number.isFinite(orderIdNum) && orderIdNum > 0;

    const detailQuery = useOrderDetailQuery(orderId);
    const paymentQuery = useOrderPaymentQuery(orderIdNum);

    if (!isValidOrderId) {
        return (
            <main className="flex min-h-[calc(100dvh-64px)] w-full justify-center px-4 py-6 sm:px-6">
                <section className="w-full max-w-[1280px] rounded-lg border border-[color:rgb(246_70_93_/_45%)] bg-[color:rgb(127_29_29_/_24%)] p-6 text-red-200">
                    Invalid order ID: {orderId}
                </section>
            </main>
        );
    }

    return (
        <main className="flex min-h-[calc(100dvh-64px)] w-full justify-center px-4 py-6 sm:px-6">
            <section className="flex w-full max-w-[1280px] flex-col gap-5">
                <div className="flex items-center justify-between">
                    <Link
                        href="/dashboard"
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-3 text-sm text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)] hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Link>
                    <Badge variant="info">Order #{orderId}</Badge>
                </div>

                <div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Order Detail</p>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Order audit view</h1>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Shows the database snapshot and payment methods. For final on-chain state, verify against contract events.</p>
                </div>

                {detailQuery.isLoading ? (
                    <Card padding="none" className="p-6">
                        <div className="h-5 w-48 animate-pulse rounded bg-[var(--bg-surface-4)]" />
                        <div className="mt-4 h-4 w-full animate-pulse rounded bg-[var(--bg-surface-4)]" />
                        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-[var(--bg-surface-4)]" />
                    </Card>
                ) : detailQuery.isError || !detailQuery.data ? (
                    <div role="alert" className="rounded-lg border border-[color:rgb(246_70_93_/_45%)] bg-[color:rgb(127_29_29_/_24%)] p-6 text-red-200">
                        Failed to load order detail. Please try again later.
                    </div>
                ) : (
                    <>
                        <Card padding="none" className="p-6">
                            <div className="flex flex-wrap gap-4">
                                <InfoItem label="Merchant address" value={formatAddress(detailQuery.data.wallet_address)} />
                                <InfoItem label="Contract address" value={formatAddress(detailQuery.data.contract_address)} />
                                <InfoItem
                                    label="Pair"
                                    value={detailQuery.data.fiat_to_crypto === 1
                                        ? `${detailQuery.data.fiat_asset_name} → ${detailQuery.data.crypto_asset_name}`
                                        : `${detailQuery.data.crypto_asset_name} → ${detailQuery.data.fiat_asset_name}`}
                                />
                                <InfoItem label="Created" value={formatDateTime(detailQuery.data.create_time)} />
                                <InfoItem label="User level" value={`L${detailQuery.data.user_level}`} />
                                <InfoItem label="Close rate" value={`${detailQuery.data.close_rate}%`} />
                                <InfoItem label="Volume" value={`${detailQuery.data.trading_volume}`} />
                                <InfoItem label="Limits" value={`${detailQuery.data.minimum_amount} - ${detailQuery.data.maximum_amount} USD`} />
                            </div>
                        </Card>

                        <Card padding="none" className="p-6">
                            <div className="mb-4 flex items-center gap-2 text-white">
                                <BadgeCheck className="h-4 w-4 text-[var(--state-success)]" />
                                Payment methods
                            </div>
                            {paymentQuery.isLoading ? (
                                <p className="text-sm text-[var(--text-subtle)]">Loading…</p>
                            ) : paymentQuery.isError ? (
                                <p role="alert" className="text-sm text-[var(--state-danger)]">Failed to load payment methods</p>
                            ) : (paymentQuery.data ?? []).length === 0 ? (
                                <p className="text-sm text-[var(--text-subtle)]">No payment methods available</p>
                            ) : (
                                <ul className="space-y-2">
                                    {(paymentQuery.data ?? []).map((method) => (
                                        <li key={`${method.method_name}-${method.account_last4}`} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3 text-sm text-white">
                                            <div className="flex items-center justify-between">
                                                <span>{method.method_name}</span>
                                                <span className="text-[var(--text-subtle)]">{method.currency}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-[var(--text-subtle)]">
                                                {method.account_holder_name} · ****{method.account_last4}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card padding="md">
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                    Order Timeline
                                </h3>
                            </div>
                            <OrderTimeline steps={buildOrderTimeline(detailQuery.data)} />
                        </Card>

                        <div className="flex items-center gap-2 rounded-lg border border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(113_63_18_/_24%)] p-3 text-xs text-amber-200">
                            <Clock3 className="h-4 w-4" />
                            Order details reflect a database snapshot; treat contract events as the authoritative on-chain state.
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}

import type { OrderDetail } from '@/server/db_types';

function buildOrderTimeline(order: OrderDetail) {
    const createdAt = order.create_time ? formatDateTime(order.create_time) : undefined;
    const direction = order.fiat_to_crypto === 1
        ? `${order.fiat_asset_name} → ${order.crypto_asset_name}`
        : `${order.crypto_asset_name} → ${order.fiat_asset_name}`;

    return [
        {
            label: 'Order created',
            sublabel: direction,
            timestamp: createdAt,
            status: 'done' as const,
        },
        {
            label: 'Awaiting payment',
            sublabel: 'Buyer must complete payment within the window',
            status: 'active' as const,
        },
        {
            label: 'Payment verification (zkTLS)',
            sublabel: 'Submit TLSN on-chain payment proof',
            status: 'pending' as const,
        },
        {
            label: 'Trade completed',
            sublabel: 'Assets released to buyer automatically',
            status: 'pending' as const,
        },
    ];
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-56 flex-1">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 text-sm font-medium text-white">{value}</p>
        </div>
    );
}
