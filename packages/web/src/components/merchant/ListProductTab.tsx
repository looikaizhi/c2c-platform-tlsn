import { useState } from 'react';
import type { Hex } from 'viem';
import { AssetType, toTokenAmount } from '@/lib/orderHelpers';
import { type SupportedCrypto, type SupportedFiat, useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ProductActionStatus from './ProductActionStatus';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';

const PLATFORMS: Array<{ id: Hex; label: string }> = [
    { id: PLATFORM_WISE,   label: 'Wise'   },
    { id: PLATFORM_ALIPAY, label: 'Alipay' },
];

interface ListProductTabProps {
    cryptos: SupportedCrypto[];
    fiats: SupportedFiat[];
    products: ReturnType<typeof useProducts>;
}

export default function ListProductTab({ cryptos, fiats, products }: ListProductTabProps) {
    const [assetType, setAssetType] = useState<AssetType>(AssetType.CRYPTO);
    const [cryptoId, setCryptoId] = useState<string>('0');
    const [fiatId, setFiatId] = useState<string>('0');
    const [amount, setAmount] = useState<string>('');
    const [isActive, setIsActive] = useState(true);
    const [platformId, setPlatformId] = useState<Hex>(PLATFORM_WISE);

    const handleSubmit = async () => {
        const amt = toTokenAmount(parseFloat(amount) || 0);
        if (amt <= BigInt(0)) return;

        if (assetType === AssetType.CRYPTO) {
            await products.listCryptoProduct(BigInt(cryptoId), BigInt(fiatId), amt, isActive, platformId);
            return;
        }

        await products.listFiatProduct(BigInt(fiatId), BigInt(cryptoId), amt, isActive, platformId);
    };

    return (
        <Card padding="none" className="space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">List New Product</h3>

            <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Product type</label>
                <div className="flex flex-wrap gap-2">
                    {[AssetType.CRYPTO, AssetType.FIAT].map((t) => (
                        <button
                            type="button"
                            key={t}
                            onClick={() => setAssetType(t)}
                            className={`rounded-md border px-4 py-2 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${
                                assetType === t
                                    ? 'border-[color:rgb(80_210_193_/_55%)] bg-[color:rgb(80_210_193_/_12%)] text-white shadow-[inset_0_-2px_0_0_var(--accent-cta)]'
                                    : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                            }`}
                        >
                            {t === AssetType.CRYPTO ? 'Sell crypto' : 'Sell fiat'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-4">
                <div className="min-w-60 flex-1">
                    <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Crypto</label>
                    <select
                        value={cryptoId}
                        onChange={(e) => setCryptoId(e.target.value)}
                        className="terminal-select h-11 w-full px-3 text-sm"
                    >
                        {cryptos.filter((c) => c.isActive).map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>{c.tokenSymbol}</option>
                        ))}
                        {cryptos.length === 0 && <option value="0">USDT (default)</option>}
                    </select>
                </div>

                <div className="min-w-60 flex-1">
                    <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Fiat</label>
                    <select
                        value={fiatId}
                        onChange={(e) => setFiatId(e.target.value)}
                        className="terminal-select h-11 w-full px-3 text-sm"
                    >
                        {fiats.filter((f) => f.isActive).map((f) => (
                            <option key={String(f.id)} value={String(f.id)}>{f.fiatName}</option>
                        ))}
                        {fiats.length === 0 && <option value="0">CNY (default)</option>}
                    </select>
                </div>
            </div>

            <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Platform</label>
                <select
                    value={platformId}
                    onChange={(e) => setPlatformId(e.target.value as Hex)}
                    className="terminal-select h-11 w-full px-3 text-sm"
                >
                    {PLATFORMS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">Stake amount</label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    className="terminal-input w-full"
                />
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded"
                />
                <span>Active on submit</span>
            </label>

            <ProductActionStatus
                status={products.status}
                error={products.error}
                submittingMessage="Please confirm the transaction in your wallet…"
                successMessage="Product listed successfully!"
            />

            <Button
                variant="primary"
                fullWidth
                onClick={handleSubmit}
                disabled={products.status === 'submitting' || !amount}
            >
                {products.status === 'submitting' ? 'Submitting…' : 'List product'}
            </Button>
        </Card>
    );
}
