"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import { ChevronRight, Package } from 'lucide-react';
import { ASSET_TYPE_LABELS, AssetType } from '@/lib/orderHelpers';
import { type MerchantInfo, type SupportedCrypto, useProducts } from '@/hooks/useProducts';
import { useNetwork } from '@/contexts/NetworkContext';
import { C2C_ESCROW_ABI, C2C_ADMIN_ABI, ERC20_ABI } from '@/lib/contractAbi';
import { getPublicClient } from '@/chain/clients';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ProductActionStatus from './ProductActionStatus';
import RateEditControl from './controls/RateEditControl';
import BusinessHoursControl from './controls/BusinessHoursControl';
import OpenToggleControl from './controls/OpenToggleControl';
import CollateralControl from './controls/CollateralControl';
import PaymentInfoSection from './PaymentInfoSection';

interface ManageTabProps {
    merchantAddr: Address;
    merchantInfo: MerchantInfo;
    products: ReturnType<typeof useProducts>;
}

export default function ManageTab({ merchantAddr, merchantInfo, products }: ManageTabProps) {
    const [fiatAccount, setFiatAccount] = useState('');
    const [cryptos, setCryptos] = useState<SupportedCrypto[]>([]);

    // Pluck the stable useCallback ref to avoid re-fetch loop (the products
    // object itself is new every render; the inner callbacks are stable).
    const { fetchSupportedCryptos } = products;

    useEffect(() => {
        fetchSupportedCryptos().then(setCryptos);
    }, [fetchSupportedCryptos]);

    const handleSetFiatAccount = async () => {
        const value = fiatAccount.trim();
        if (!value) return;
        await products.setFiatAccount(value);
    };

    const cryptoCount = Number(merchantInfo.sellCryptoAmount);
    const fiatCount = Number(merchantInfo.sellFiatAmount);

    return (
        <div className="space-y-4">
            <PaymentInfoSection merchantAddr={merchantAddr} products={products} />

            <Card padding="none" className="p-6">
                <h3 className="mb-3 text-lg font-semibold text-white">Set fiat receiving account <span className="text-xs text-[var(--text-subtle)]">(legacy)</span></h3>
                <p className="mb-3 text-xs text-[var(--text-subtle)]">Free-text fallback. New flow uses the dual-platform keccak256 form above.</p>
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
                        Save
                    </Button>
                </div>
            </Card>

            <Card padding="none" className="card-glow p-6">
                <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
                    <Package size={14} className="text-[var(--text-muted)]" />
                    <span className="uppercase tracking-[0.08em]">Listed products</span>
                </h3>
                {cryptoCount === 0 && fiatCount === 0 ? (
                    <p className="text-sm text-[var(--text-subtle)]">No listed products yet</p>
                ) : (
                    <div className="space-y-3">
                        {Array.from({ length: cryptoCount }).map((_, i) => (
                            <ProductRow
                                key={`crypto-${i}`}
                                productId={BigInt(i)}
                                assetType={AssetType.CRYPTO}
                                merchantAddr={merchantAddr}
                                cryptos={cryptos}
                                products={products}
                               
                            />
                        ))}
                        {Array.from({ length: fiatCount }).map((_, i) => (
                            <ProductRow
                                key={`fiat-${i}`}
                                productId={BigInt(i)}
                                assetType={AssetType.FIAT}
                                merchantAddr={merchantAddr}
                                cryptos={cryptos}
                                products={products}
                               
                            />
                        ))}
                    </div>
                )}
            </Card>

            <ProductActionStatus
                status={products.status}
                error={products.error}
                submittingMessage="Please confirm the transaction in your wallet…"
                successMessage="Operation successful!"
            />
        </div>
    );
}

interface ProductInfo {
    cryptoID: bigint;
    collateralAmount: bigint;
    pendingAmount: bigint;
    availableAmount: bigint;
    isActive: boolean;
    activeOrderCount: bigint;
    platformId: Hex;
}

interface ProductLiveStatus {
    rate: bigint;
    isOpen: boolean;
}

function platformLabel(id: Hex): { label: string; color: string; bg: string } | null {
    if (id === PLATFORM_WISE)   return { label: 'Wise',   color: '#7DD3FC', bg: 'rgba(125,211,252,0.12)' };
    if (id === PLATFORM_ALIPAY) return { label: 'Alipay', color: '#5EEAD4', bg: 'rgba(94,234,212,0.12)' };
    return null;
}

function ProductRow({
    productId,
    assetType,
    merchantAddr,
    cryptos,
    products,
}: {
    productId: bigint;
    assetType: AssetType;
    merchantAddr: Address;
    cryptos: SupportedCrypto[];
    products: ReturnType<typeof useProducts>;
}) {
    const { network } = useNetwork();
    const [info, setInfo] = useState<ProductInfo | null>(null);
    const [live, setLive] = useState<ProductLiveStatus | null>(null);
    const [decimals, setDecimals] = useState<number>(18);
    const [expanded, setExpanded] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const client = getPublicClient(network.chainId);
            const result = (await client.readContract({
                address: network.contracts.c2cEscrow,
                abi: C2C_ESCROW_ABI,
                functionName: 'getProductInfo',
                args: [merchantAddr, productId, assetType],
            })) as ProductInfo;
            setInfo(result);

            const crypto = cryptos.find((c) => c.id === result.cryptoID);
            if (crypto && crypto.tokenAddress && crypto.tokenAddress.length > 2) {
                try {
                    const dec = (await client.readContract({
                        address: crypto.tokenAddress,
                        abi: ERC20_ABI,
                        functionName: 'decimals',
                    })) as number;
                    setDecimals(Number(dec));
                } catch {
                    setDecimals(18);
                }
            }

            // Best-effort fetch of rate + open status for the collapsed header.
            try {
                const [rateRes, openRes] = await Promise.all([
                    client.readContract({
                        address: network.contracts.c2cAdmin,
                        abi: C2C_ADMIN_ABI,
                        functionName: 'getMerchantRate',
                        args: [merchantAddr, productId, assetType],
                    }),
                    client.readContract({
                        address: network.contracts.c2cAdmin,
                        abi: C2C_ADMIN_ABI,
                        functionName: 'isMerchantOpen',
                        args: [merchantAddr, productId, assetType],
                    }),
                ]);
                setLive({
                    rate:   (rateRes as { rate: bigint }).rate ?? 0n,
                    isOpen: openRes as boolean,
                });
            } catch {
                setLive(null);
            }
        } catch {
            setInfo(null);
        }
    }, [merchantAddr, productId, assetType, network, cryptos]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const crypto = info ? cryptos.find((c) => c.id === info.cryptoID) : undefined;
    const headerId = `product-${assetType}-${productId}-header`;
    const panelId  = `product-${assetType}-${productId}-panel`;
    const platform = info ? platformLabel(info.platformId) : null;
    const assetTypeColor = assetType === AssetType.CRYPTO
        ? { color: 'var(--color-buy)',  bg: 'var(--color-buy-bg)'  }
        : { color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' };

    return (
        <div className="overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] transition-colors hover:border-[var(--line-strong)]">
            {/* Collapsed header — always visible, ≥44px tappable */}
            <button
                type="button"
                id={headerId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cta)]"
                style={{ minHeight: 48 }}
            >
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <ChevronRight
                        size={14}
                        className="flex-shrink-0 text-[var(--text-muted)] transition-transform"
                        style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
                    />
                    {/* Asset type chip */}
                    <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{ color: assetTypeColor.color, background: assetTypeColor.bg }}
                    >
                        {ASSET_TYPE_LABELS[assetType]}
                    </span>
                    {/* Product ID */}
                    <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">#{String(productId)}</span>
                    {/* Token */}
                    {crypto && (
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{crypto.tokenSymbol}</span>
                    )}
                    {/* Platform badge */}
                    {platform && (
                        <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: platform.color, background: platform.bg }}
                        >
                            {platform.label}
                        </span>
                    )}
                    {/* Open/closed live status dot */}
                    {live && (
                        <span
                            className="inline-flex items-center gap-1.5 text-[11px]"
                            style={{ color: live.isOpen ? 'var(--status-success)' : 'var(--text-muted)' }}
                        >
                            <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{
                                    background: live.isOpen ? 'var(--status-success)' : 'var(--text-tertiary)',
                                    boxShadow: live.isOpen ? '0 0 6px var(--status-success)' : 'none',
                                }}
                            />
                            {live.isOpen ? 'Open' : 'Closed'}
                        </span>
                    )}
                    {/* Rate */}
                    {live && live.rate > 0n && (
                        <span className="text-[11px] text-[var(--text-muted)]">
                            ·
                            <span className="ml-1 font-mono tabular-nums text-[var(--text-secondary)]">
                                {(Number(live.rate) / 1e8).toFixed(4)}
                            </span>
                            <span className="ml-1">{crypto?.tokenSymbol ? `/ ${crypto.tokenSymbol}` : ''}</span>
                        </span>
                    )}
                    {/* Available */}
                    {info && (
                        <span className="text-[11px] text-[var(--text-muted)]">
                            ·
                            <span className="ml-1 font-mono tabular-nums text-[var(--text-secondary)]">
                                {(Number(info.availableAmount) / 10 ** decimals).toFixed(0)}
                            </span>
                            <span className="ml-1">avail.</span>
                        </span>
                    )}
                </div>
                <div className="flex flex-shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="buy"
                        size="sm"
                        onClick={() => products.activateProduct(productId, assetType)}
                    >
                        Activate
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => products.deactivateProduct(productId, assetType)}
                    >
                        Delist
                    </Button>
                </div>
            </button>

            {/* Expanded panel — 4 controls */}
            {expanded && (
                <div id={panelId} role="region" aria-labelledby={headerId} className="space-y-3 border-t border-[var(--line-soft)] p-4">
                    <RateEditControl
                        productId={productId}
                        assetType={assetType}
                        products={products}
                       
                    />
                    <BusinessHoursControl
                        productId={productId}
                        assetType={assetType}
                        products={products}
                       
                    />
                    <OpenToggleControl
                        merchantAddr={merchantAddr}
                        productId={productId}
                        assetType={assetType}
                        products={products}
                       
                    />
                    {info && (
                        <CollateralControl
                            productId={productId}
                            assetType={assetType}
                            collateralAmount={info.collateralAmount}
                            decimals={decimals}
                            tokenSymbol={crypto?.tokenSymbol}
                            products={products}
                           
                        />
                    )}
                </div>
            )}
        </div>
    );
}
