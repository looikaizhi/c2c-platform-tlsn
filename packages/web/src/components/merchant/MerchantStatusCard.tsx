import type { MerchantInfo } from '@/hooks/useProducts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

interface MerchantStatusCardProps {
    walletAddress: string | null;
    isMerchant: boolean;
    merchantInfo: MerchantInfo | null;
}

function shortAddress(address: string | null) {
    if (!address) return '—';
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Single-row status pill. Designed for ~48px height in the new compact
 * merchant layout. Renders the previous large card only if not registered
 * (so the user still sees a clear unregistered state).
 */
export default function MerchantStatusCard({ walletAddress, isMerchant, merchantInfo }: MerchantStatusCardProps) {
    if (!isMerchant) {
        return (
            <Card padding="none" className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Badge variant="danger" dot>Unregistered</Badge>
                    <span className="font-mono text-[var(--text-secondary)]">{shortAddress(walletAddress)}</span>
                    <span className="text-[var(--text-muted)]">— register below to start listing products.</span>
                </div>
            </Card>
        );
    }

    return (
        <Card padding="none" className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Badge variant="success" dot>Active</Badge>
                <span className="font-mono text-[var(--text-secondary)]">{shortAddress(walletAddress)}</span>
                {merchantInfo && (
                    <>
                        <span className="text-[var(--text-muted)]">·</span>
                        <Badge variant={merchantInfo.kybVerified ? 'success' : 'muted'} size="sm">
                            {merchantInfo.kybVerified ? 'KYB ✓' : 'KYB —'}
                        </Badge>
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="text-[var(--text-muted)]">
                            <span className="font-mono text-[var(--text-primary)]">{String(merchantInfo.sellCryptoAmount)}</span> CRYPTO
                            <span className="mx-1">/</span>
                            <span className="font-mono text-[var(--text-primary)]">{String(merchantInfo.sellFiatAmount)}</span> FIAT products
                        </span>
                        {merchantInfo.registeredAt > 0n && (
                            <>
                                <span className="text-[var(--text-muted)]">·</span>
                                <span className="text-[var(--text-muted)]">
                                    Reg <span className="font-mono">{new Date(Number(merchantInfo.registeredAt) * 1000).toLocaleDateString()}</span>
                                </span>
                            </>
                        )}
                    </>
                )}
            </div>
        </Card>
    );
}
