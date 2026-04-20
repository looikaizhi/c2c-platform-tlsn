import SurfaceCard from '@/components/ui/SurfaceCard';
import StatusPill from '@/components/ui/StatusPill';

export default function OrdersTab() {
    return (
        <SurfaceCard className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">待处理订单 Orders Queue</h3>
                <StatusPill label="Indexer Pending" tone="warning" />
            </div>
            <p className="text-sm text-[var(--text-subtle)]">
                当买家通过 FIAT 产品支付加密货币后，您需要在此处使用 TLSN 验证确认收到法币付款，
                然后调用 <code className="text-[var(--accent-cta)]">receiveCryptoWithPayment</code> 释放代币。
            </p>
            <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4">
                <p className="text-xs text-[var(--text-muted)]">
                    当前版本订单查询仍依赖链上事件索引。请先通过 Dashboard 查看订单，再进入详情页进行审计。
                </p>
            </div>
        </SurfaceCard>
    );
}
