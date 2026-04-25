"use client";

import type { Address } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { OrderProofFlow } from '@/components/order/OrderProofFlow';
import { useDashboardQuery } from '@/hooks/queries/useDashboardQuery';
import { queryKeys } from '@/lib/queryKeys';

interface OrdersTabProps {
    merchantAddress: Address;
}

export default function OrdersTab({ merchantAddress }: OrdersTabProps) {
    const queryClient = useQueryClient();
    const { data: allOrders, isLoading } = useDashboardQuery(merchantAddress);

    // fiat_to_crypto === 1: buyer pays fiat → merchant receives fiat and must release crypto
    const fiatOrders = allOrders?.filter((o) => o.fiat_to_crypto === 1) ?? [];

    const handleProofSubmitted = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(merchantAddress) });
    };

    return (
        <Card padding="none" className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">待处理订单 Orders Queue</h3>
                <Badge variant="warning" dot>Fiat Pending</Badge>
            </div>
            <p className="mb-4 text-sm text-[var(--text-subtle)]">
                当买家通过 FIAT 产品支付加密货币后，您需要在此处使用 TLSN 验证确认收到法币付款，
                然后调用{' '}
                <code className="text-[var(--accent-cta)]">receiveCryptoWithPayment</code>
                {' '}释放代币。
            </p>

            {isLoading ? (
                <div className="flex items-center justify-center py-10">
                    <Spinner size="md" />
                </div>
            ) : fiatOrders.length === 0 ? (
                <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4">
                    <p className="text-xs text-[var(--text-muted)]">No pending fiat orders</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {fiatOrders.map((order) => (
                        <div
                            key={order.order_id}
                            className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4"
                        >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white">
                                        Order #{order.order_id}
                                    </span>
                                    <Badge variant="info">
                                        {order.fiat_asset_name} → {order.crypto_asset_name}
                                    </Badge>
                                </div>
                                {order.bank_name && (
                                    <span className="text-xs text-[var(--text-muted)]">
                                        via {order.bank_name}
                                    </span>
                                )}
                            </div>
                            <OrderProofFlow
                                merchant={merchantAddress}
                                productId={0n}
                                orderId={BigInt(order.order_id)}
                                onProofSubmitted={handleProofSubmitted}
                            />
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
