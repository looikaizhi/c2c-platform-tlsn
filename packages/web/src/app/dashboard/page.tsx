"use client";

import { useMemo, useState } from 'react';
import DashboardStats from '@/components/dashboard/DashboardStats';
import DashboardOrdersTable from '@/components/dashboard/DashboardOrdersTable';
import type { SortConfig } from '@/components/dashboard/types';
import { useDashboardQuery } from '@/hooks/queries/useDashboardQuery';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';

const FALLBACK_WALLET_ADDRESS = '0xAbCDeF1234567890fFaBbCcDdEeFf01234567890';

export default function DashboardPage() {
    const [directionFilter, setDirectionFilter] = useState<0 | 1>(1);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'desc' });

    const dashboardQuery = useDashboardQuery(FALLBACK_WALLET_ADDRESS);
    const userBuyOrder = useMemo(
        () => (dashboardQuery.data ?? []).filter((item) => item.fiat_to_crypto === 1),
        [dashboardQuery.data],
    );
    const userSellOrder = useMemo(
        () => (dashboardQuery.data ?? []).filter((item) => item.fiat_to_crypto === 0),
        [dashboardQuery.data],
    );

    const sortedOrders = useMemo(() => {
        const scopedOrders = directionFilter ? userBuyOrder : userSellOrder;
        const ordersCopy = scopedOrders.slice();

        if (sortConfig.key === 'order_create_time') {
            ordersCopy.sort((a, b) => {
                const dateA = new Date(a.order_create_time).getTime();
                const dateB = new Date(b.order_create_time).getTime();
                return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
            });
        }

        return ordersCopy;
    }, [userBuyOrder, userSellOrder, sortConfig, directionFilter]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const allOrders = [...userBuyOrder, ...userSellOrder];

    return (
        <main className="flex min-h-[calc(100dvh-64px)] w-full justify-center px-4 py-6 sm:px-6">
            <section className="flex w-full max-w-[1280px] flex-col">
                <SectionHeader
                    eyebrow="Operations"
                    title="交易看板 Dashboard"
                    description="追踪法币与加密资产订单流转，统一查看状态、时间和详情跳转。"
                    action={<StatusPill label="Real-time View" tone="info" />}
                />

                <DashboardStats
                    totalOrders={allOrders.length}
                    verifiedBankAccounts={0}
                    activeOrders={sortedOrders.length}
                    profit={0}
                />

                <SurfaceCard className="mb-4 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setDirectionFilter(1)}
                            className={`h-10 rounded-lg border px-4 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${
                                directionFilter === 1
                                    ? 'border-[color:rgb(240_185_11_/_55%)] bg-[color:rgb(240_185_11_/_12%)] text-white shadow-[inset_0_-2px_0_0_var(--accent-cta)]'
                                    : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                            }`}
                        >
                            Fiat → Crypto
                        </button>
                        <button
                            type="button"
                            onClick={() => setDirectionFilter(0)}
                            className={`h-10 rounded-lg border px-4 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${
                                directionFilter === 0
                                    ? 'border-[color:rgb(240_185_11_/_55%)] bg-[color:rgb(240_185_11_/_12%)] text-white shadow-[inset_0_-2px_0_0_var(--accent-cta)]'
                                    : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                            }`}
                        >
                            Crypto → Fiat
                        </button>
                        <div className="ml-auto">
                            <StatusPill label={dashboardQuery.isFetching ? 'Syncing' : 'Stable'} tone={dashboardQuery.isFetching ? 'warning' : 'success'} />
                        </div>
                    </div>
                </SurfaceCard>

                <DashboardOrdersTable
                    isLoading={dashboardQuery.isLoading}
                    orders={sortedOrders}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    isError={dashboardQuery.isError}
                />
            </section>
        </main>
    );
}
