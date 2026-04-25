import type { MerchantInfo } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

interface MerchantStatusCardProps {
    walletAddress: string | null;
    isMerchant: boolean;
    merchantInfo: MerchantInfo | null;
}

function shortAddress(address: string | null) {
    if (!address) return '-';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function MetricItem({ label, value, variant }: { label: string; value: string; variant: 'info' | 'warning' | 'success' | 'muted' }) {
    return (
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
            <Badge variant={variant} size="sm">{value}</Badge>
        </div>
    );
}

export default function MerchantStatusCard({ walletAddress, isMerchant, merchantInfo }: MerchantStatusCardProps) {
    return (
        <Card padding="none" className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold text-white">商家状态 Merchant Status</h2>
                    <p className="mt-1 text-sm text-[var(--text-subtle)]">{shortAddress(walletAddress)}</p>
                </div>
                <Badge variant={isMerchant ? 'success' : 'danger'} dot>
                    {isMerchant ? 'Registered' : 'Unregistered'}
                </Badge>
            </div>

            {isMerchant && merchantInfo && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                    <MetricItem label="Crypto 产品" value={String(merchantInfo.sellCryptoAmount)} variant="info" />
                    <MetricItem label="Fiat 产品" value={String(merchantInfo.sellFiatAmount)} variant="warning" />
                    <MetricItem label="KYB" value={merchantInfo.kybVerified ? '已验证' : '未验证'} variant={merchantInfo.kybVerified ? 'success' : 'muted'} />
                </div>
            )}
        </Card>
    );
}
