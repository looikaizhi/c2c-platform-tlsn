import type { MerchantInfo } from '@/hooks/useProducts';
import MetricChip from '@/components/ui/MetricChip';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';

interface MerchantStatusCardProps {
    walletAddress: string | null;
    isMerchant: boolean;
    merchantInfo: MerchantInfo | null;
}

function shortAddress(address: string | null) {
    if (!address) return '-';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function MerchantStatusCard({ walletAddress, isMerchant, merchantInfo }: MerchantStatusCardProps) {
    return (
        <SurfaceCard className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold text-white">商家状态 Merchant Status</h2>
                    <p className="mt-1 text-sm text-[var(--text-subtle)]">{shortAddress(walletAddress)}</p>
                </div>
                <StatusPill
                    label={isMerchant ? 'Registered' : 'Unregistered'}
                    tone={isMerchant ? 'success' : 'danger'}
                />
            </div>

            {isMerchant && merchantInfo && (
                <div className="flex flex-wrap gap-3">
                    <div className="min-w-52 flex-1">
                        <MetricChip label="Crypto 产品" value={String(merchantInfo.sellCryptoAmount)} tone="info" />
                    </div>
                    <div className="min-w-52 flex-1">
                        <MetricChip label="Fiat 产品" value={String(merchantInfo.sellFiatAmount)} tone="warning" />
                    </div>
                    <div className="min-w-52 flex-1">
                        <MetricChip label="KYB" value={merchantInfo.kybVerified ? '已验证' : '未验证'} tone={merchantInfo.kybVerified ? 'success' : 'neutral'} />
                    </div>
                </div>
            )}
        </SurfaceCard>
    );
}
