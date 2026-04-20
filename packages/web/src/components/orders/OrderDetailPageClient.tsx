"use client";

import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Clock3 } from 'lucide-react';
import { useOrderDetailQuery } from '@/hooks/queries/useOrderDetailQuery';
import { useOrderPaymentQuery } from '@/hooks/queries/useOrderPaymentQuery';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';

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
                    订单 ID 无效：{orderId}
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
                        返回 Dashboard
                    </Link>
                    <StatusPill label={`Order #${orderId}`} tone="info" />
                </div>

                <SectionHeader
                    eyebrow="Order Detail"
                    title="订单审计视图"
                    description="展示数据库快照与支付方式，链上最终状态请结合合约事件校验。"
                />

                {detailQuery.isLoading ? (
                    <SurfaceCard className="p-6">
                        <div className="h-5 w-48 animate-pulse rounded bg-[var(--bg-surface-4)]" />
                        <div className="mt-4 h-4 w-full animate-pulse rounded bg-[var(--bg-surface-4)]" />
                        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-[var(--bg-surface-4)]" />
                    </SurfaceCard>
                ) : detailQuery.isError || !detailQuery.data ? (
                    <div role="alert" className="rounded-lg border border-[color:rgb(246_70_93_/_45%)] bg-[color:rgb(127_29_29_/_24%)] p-6 text-red-200">
                        订单详情加载失败，请稍后重试。
                    </div>
                ) : (
                    <>
                        <SurfaceCard className="p-6">
                            <div className="flex flex-wrap gap-4">
                                <InfoItem label="商家地址" value={formatAddress(detailQuery.data.wallet_address)} />
                                <InfoItem label="合约地址" value={formatAddress(detailQuery.data.contract_address)} />
                                <InfoItem
                                    label="交易对"
                                    value={detailQuery.data.fiat_to_crypto === 1
                                        ? `${detailQuery.data.fiat_asset_name} → ${detailQuery.data.crypto_asset_name}`
                                        : `${detailQuery.data.crypto_asset_name} → ${detailQuery.data.fiat_asset_name}`}
                                />
                                <InfoItem label="创建时间" value={formatDateTime(detailQuery.data.create_time)} />
                                <InfoItem label="用户等级" value={`L${detailQuery.data.user_level}`} />
                                <InfoItem label="成交率" value={`${detailQuery.data.close_rate}%`} />
                                <InfoItem label="成交量" value={`${detailQuery.data.trading_volume}`} />
                                <InfoItem label="限额" value={`${detailQuery.data.minimum_amount} - ${detailQuery.data.maximum_amount} USD`} />
                            </div>
                        </SurfaceCard>

                        <SurfaceCard className="p-6">
                            <div className="mb-4 flex items-center gap-2 text-white">
                                <BadgeCheck className="h-4 w-4 text-[var(--state-success)]" />
                                支付方式
                            </div>
                            {paymentQuery.isLoading ? (
                                <p className="text-sm text-[var(--text-subtle)]">加载中...</p>
                            ) : paymentQuery.isError ? (
                                <p role="alert" className="text-sm text-[var(--state-danger)]">支付方式加载失败</p>
                            ) : (paymentQuery.data ?? []).length === 0 ? (
                                <p className="text-sm text-[var(--text-subtle)]">暂无可用支付方式</p>
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
                        </SurfaceCard>

                        <div className="flex items-center gap-2 rounded-lg border border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(113_63_18_/_24%)] p-3 text-xs text-amber-200">
                            <Clock3 className="h-4 w-4" />
                            订单详情为数据库快照，链上最终状态请以合约事件为准。
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-56 flex-1">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 text-sm font-medium text-white">{value}</p>
        </div>
    );
}
