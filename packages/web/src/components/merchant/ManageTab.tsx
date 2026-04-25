import { useState } from 'react';
import { ASSET_TYPE_LABELS, AssetType } from '@/lib/orderHelpers';
import { type MerchantInfo, useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ProductActionStatus from './ProductActionStatus';

interface ManageTabProps {
    merchantInfo: MerchantInfo;
    products: ReturnType<typeof useProducts>;
    provider?: any;
}

export default function ManageTab({ merchantInfo, products, provider }: ManageTabProps) {
    const [fiatAccount, setFiatAccount] = useState('');

    const handleSetFiatAccount = async () => {
        const value = fiatAccount.trim();
        if (!value) return;
        await products.setFiatAccount(value, provider);
    };

    const cryptoCount = Number(merchantInfo.sellCryptoAmount);
    const fiatCount = Number(merchantInfo.sellFiatAmount);

    return (
        <div className="space-y-4">
            <Card padding="none" className="p-6">
                <h3 className="mb-3 text-lg font-semibold text-white">设置法币收款账户</h3>
                <p className="mb-3 text-xs text-[var(--text-subtle)]">例如 Wise 邮箱、支付宝账号。买家付款时会看到此信息。</p>
                <div className="flex flex-wrap gap-2">
                    <input
                        type="text"
                        value={fiatAccount}
                        onChange={(e) => setFiatAccount(e.target.value)}
                        placeholder="merchant@wise.com"
                        className="terminal-input min-w-64 flex-1"
                    />
                    <Button
                        variant="primary"
                        onClick={handleSetFiatAccount}
                        disabled={products.status === 'submitting'}
                    >
                        保存
                    </Button>
                </div>
            </Card>

            <Card padding="none" className="p-6">
                <h3 className="mb-3 text-lg font-semibold text-white">已上架商品</h3>
                {cryptoCount === 0 && fiatCount === 0 ? (
                    <p className="text-sm text-[var(--text-subtle)]">暂无上架商品</p>
                ) : (
                    <div className="space-y-2">
                        {Array.from({ length: cryptoCount }).map((_, i) => (
                            <ProductRow
                                key={`crypto-${i}`}
                                productId={BigInt(i)}
                                assetType={AssetType.CRYPTO}
                                products={products}
                                provider={provider}
                            />
                        ))}
                        {Array.from({ length: fiatCount }).map((_, i) => (
                            <ProductRow
                                key={`fiat-${i}`}
                                productId={BigInt(i)}
                                assetType={AssetType.FIAT}
                                products={products}
                                provider={provider}
                            />
                        ))}
                    </div>
                )}
            </Card>

            <ProductActionStatus
                status={products.status}
                error={products.error}
                submittingMessage="请在钱包中确认交易..."
                successMessage="操作成功!"
            />
        </div>
    );
}

function ProductRow({
    productId,
    assetType,
    products,
    provider,
}: {
    productId: bigint;
    assetType: AssetType;
    products: ReturnType<typeof useProducts>;
    provider?: any;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3">
            <div className="text-sm">
                <span className="text-[var(--text-subtle)]">{ASSET_TYPE_LABELS[assetType]}</span>
                <span className="ml-2 font-semibold">产品 #{String(productId)}</span>
            </div>
            <div className="flex gap-2">
                <Button
                    variant="buy"
                    size="sm"
                    onClick={() => products.activateProduct(productId, assetType, provider)}
                >
                    激活
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => products.deactivateProduct(productId, assetType, provider)}
                >
                    下架
                </Button>
            </div>
        </div>
    );
}
