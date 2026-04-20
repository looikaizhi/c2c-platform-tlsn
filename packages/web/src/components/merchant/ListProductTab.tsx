import { useState } from 'react';
import { AssetType, toTokenAmount } from '@/lib/orderHelpers';
import { type SupportedCrypto, type SupportedFiat, useProducts } from '@/hooks/useProducts';
import ActionButton from '@/components/ui/ActionButton';
import SurfaceCard from '@/components/ui/SurfaceCard';
import ProductActionStatus from './ProductActionStatus';

interface ListProductTabProps {
    cryptos: SupportedCrypto[];
    fiats: SupportedFiat[];
    products: ReturnType<typeof useProducts>;
    provider?: any;
}

export default function ListProductTab({ cryptos, fiats, products, provider }: ListProductTabProps) {
    const [assetType, setAssetType] = useState<AssetType>(AssetType.CRYPTO);
    const [cryptoId, setCryptoId] = useState<string>('0');
    const [fiatId, setFiatId] = useState<string>('0');
    const [amount, setAmount] = useState<string>('');
    const [isActive, setIsActive] = useState(true);

    const handleSubmit = async () => {
        const amt = toTokenAmount(parseFloat(amount) || 0);
        if (amt <= BigInt(0)) return;

        if (assetType === AssetType.CRYPTO) {
            await products.listCryptoProduct(BigInt(cryptoId), BigInt(fiatId), amt, isActive, provider);
            return;
        }

        await products.listFiatProduct(BigInt(fiatId), BigInt(cryptoId), amt, isActive, provider);
    };

    return (
        <SurfaceCard className="space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">上架新商品 List New Product</h3>

            <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">产品类型 Type</label>
                <div className="flex flex-wrap gap-2">
                    {[AssetType.CRYPTO, AssetType.FIAT].map((t) => (
                        <button
                            type="button"
                            key={t}
                            onClick={() => setAssetType(t)}
                            className={`rounded-md border px-4 py-2 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${
                                assetType === t
                                    ? 'border-[color:rgb(240_185_11_/_55%)] bg-[color:rgb(240_185_11_/_12%)] text-white shadow-[inset_0_-2px_0_0_var(--accent-cta)]'
                                    : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                            }`}
                        >
                            {t === AssetType.CRYPTO ? '卖出加密货币 Crypto' : '卖出法币 Fiat'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-4">
                <div className="min-w-60 flex-1">
                    <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">加密货币 Crypto</label>
                    <select
                        value={cryptoId}
                        onChange={(e) => setCryptoId(e.target.value)}
                        className="terminal-select h-11 w-full px-3 text-sm"
                    >
                        {cryptos.filter((c) => c.isActive).map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>{c.tokenSymbol}</option>
                        ))}
                        {cryptos.length === 0 && <option value="0">USDT (默认)</option>}
                    </select>
                </div>

                <div className="min-w-60 flex-1">
                    <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">法币 Fiat</label>
                    <select
                        value={fiatId}
                        onChange={(e) => setFiatId(e.target.value)}
                        className="terminal-select h-11 w-full px-3 text-sm"
                    >
                        {fiats.filter((f) => f.isActive).map((f) => (
                            <option key={String(f.id)} value={String(f.id)}>{f.fiatName}</option>
                        ))}
                        {fiats.length === 0 && <option value="0">CNY (默认)</option>}
                    </select>
                </div>
            </div>

            <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">质押数量 Amount</label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="例: 1000"
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
                <span>立即激活 Active on submit</span>
            </label>

            <ProductActionStatus
                status={products.status}
                error={products.error}
                submittingMessage="请在钱包中确认交易..."
                successMessage="商品上架成功!"
            />

            <ActionButton
                onClick={handleSubmit}
                disabled={products.status === 'submitting' || !amount}
                className="w-full"
            >
                {products.status === 'submitting' ? '提交中...' : '上架商品'}
            </ActionButton>
        </SurfaceCard>
    );
}
