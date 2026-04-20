import { Activity, Banknote, CircleDollarSign, ShieldCheck } from 'lucide-react';
import MetricChip from '@/components/ui/MetricChip';
import SurfaceCard from '@/components/ui/SurfaceCard';

interface DashboardStatsProps {
    totalOrders: number;
    verifiedBankAccounts: number;
    activeOrders: number;
    profit: number;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(amount);
}

function StatCard({
    icon,
    label,
    value,
    hint,
    tone,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint: string;
    tone: 'info' | 'success' | 'warning' | 'neutral';
}) {
    return (
        <SurfaceCard className="min-w-56 flex-1 p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
                <div className="text-[var(--text-subtle)]">{icon}</div>
            </div>
            <p className="font-[var(--font-mono)] text-3xl font-semibold text-white">{value}</p>
            <div className="mt-3">
                <MetricChip label="Status" value={hint} tone={tone} />
            </div>
        </SurfaceCard>
    );
}

export default function DashboardStats({
    totalOrders,
    verifiedBankAccounts,
    activeOrders,
    profit,
}: DashboardStatsProps) {
    return (
        <div className="mb-5 flex flex-wrap gap-3">
            <StatCard
                label="Total Orders"
                value={String(totalOrders)}
                hint="订单全量累计"
                tone="info"
                icon={<CircleDollarSign className="h-4 w-4" />}
            />
            <StatCard
                label="Verified Bank"
                value={String(verifiedBankAccounts)}
                hint="TLSN linked"
                tone="success"
                icon={<ShieldCheck className="h-4 w-4" />}
            />
            <StatCard
                label="Active Orders"
                value={String(activeOrders)}
                hint="实时挂单"
                tone="warning"
                icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
                label="Protocol Profit"
                value={formatCurrency(profit)}
                hint="P&L summary"
                tone="neutral"
                icon={<Banknote className="h-4 w-4" />}
            />
        </div>
    );
}
