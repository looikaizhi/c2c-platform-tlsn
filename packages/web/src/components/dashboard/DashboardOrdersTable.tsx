import Link from 'next/link';
import type * as dbTypes from '@/server/db_types';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from 'lucide-react';
import SurfaceCard from '@/components/ui/SurfaceCard';
import StatusPill from '@/components/ui/StatusPill';
import type { SortConfig } from './types';

interface DashboardOrdersTableProps {
    isLoading: boolean;
    isError?: boolean;
    orders: dbTypes.UserDashboard[];
    sortConfig: SortConfig;
    onSort: (key: string) => void;
}

function formatContractAddress(address: string) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDateTime(timeStamp: string) {
    const date = new Date(timeStamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SortIcon({ sortConfig, columnKey }: { sortConfig: SortConfig; columnKey: string }) {
    if (sortConfig.key !== columnKey) {
        return <ArrowUpDown className="ml-1 h-4 w-4 text-[var(--text-muted)]" />;
    }
    return sortConfig.direction === 'asc'
        ? <ArrowUp className="ml-1 h-4 w-4 text-[var(--accent-primary)]" />
        : <ArrowDown className="ml-1 h-4 w-4 text-[var(--accent-primary)]" />;
}

export default function DashboardOrdersTable({
    isLoading,
    isError,
    orders,
    sortConfig,
    onSort,
}: DashboardOrdersTableProps) {
    return (
        <SurfaceCard className="overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-[var(--bg-surface-2)] text-[var(--text-muted)]">
                        <tr>
                            <th className="px-4 py-3 text-left">订单ID</th>
                            <th className="px-4 py-3 text-left">合约地址</th>
                            <th className="px-4 py-3 text-left">交易对</th>
                            <th className="px-4 py-3 text-left">
                                <button
                                    type="button"
                                    className="inline-flex items-center"
                                    onClick={() => onSort('order_create_time')}
                                >
                                    创建时间
                                    <SortIcon sortConfig={sortConfig} columnKey="order_create_time" />
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">状态</th>
                            <th className="px-4 py-3 text-right">详情</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-subtle)]">
                                    正在加载订单数据...
                                </td>
                            </tr>
                        ) : isError ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-[var(--state-danger)]">
                                    订单加载失败，请稍后刷新重试
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-subtle)]">
                                    暂无订单数据
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr key={order.order_id} className="border-t border-[var(--line-soft)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--bg-surface-2)]">
                                    <td className="px-4 py-3 font-semibold text-white">#{order.order_id}</td>
                                    <td className="px-4 py-3 text-[var(--text-secondary)]">{formatContractAddress(order.contract_address)}</td>
                                    <td className="px-4 py-3">
                                        <div className="inline-flex items-center gap-1 text-sm">
                                            {order.fiat_to_crypto === 1 ? (
                                                <>
                                                    <span className="font-medium text-[var(--state-info)]">{order.fiat_asset_name}</span>
                                                    <span className="text-[var(--text-muted)]">→</span>
                                                    <span className="font-medium text-[var(--accent-cta)]">{order.crypto_asset_name}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-medium text-[var(--accent-cta)]">{order.crypto_asset_name}</span>
                                                    <span className="text-[var(--text-muted)]">→</span>
                                                    <span className="font-medium text-[var(--state-info)]">{order.fiat_asset_name}</span>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDateTime(order.order_create_time)}</td>
                                    <td className="px-4 py-3"><StatusPill label="active" tone="success" /></td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={`/orders/${order.order_id}`}
                                            className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)] hover:text-white"
                                        >
                                            查看
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </SurfaceCard>
    );
}
