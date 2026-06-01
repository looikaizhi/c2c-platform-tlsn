"use client";

import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useWallet } from '@/hooks/useWallet';
import { useProducts, type MerchantInfo, type SupportedCrypto, type SupportedFiat } from '@/hooks/useProducts';
import { useReputation } from '@/hooks/useReputation';
import { Store, ClipboardList, Wallet } from 'lucide-react';
import MerchantStatusCard from './merchant/MerchantStatusCard';
import RegisterSection from './merchant/RegisterSection';
import MerchantTabBar, { type MerchantTab } from './merchant/MerchantTabBar';
import ListProductTab from './merchant/ListProductTab';
import ManageTab from './merchant/ManageTab';
import OrdersTab from './merchant/OrdersTab';
import BalancesCard from './shared/BalancesCard';
import ClaimableBondCard from './shared/ClaimableBondCard';
import ReputationCard from './dashboard/ReputationCard';
import NotConnectedPlaceholder from './shared/NotConnectedPlaceholder';
import { Card } from './ui/Card';

export default function MerchantPanel() {
    const wallet = useWallet();
    const products = useProducts();
    const reputation = useReputation(wallet.address ?? undefined);

    const [activeTab, setActiveTab] = useState<MerchantTab>('manage');
    const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
    const [cryptos, setCryptos] = useState<SupportedCrypto[]>([]);
    const [fiats, setFiats] = useState<SupportedFiat[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
    const handleOrdersCountChange = useCallback((n: number) => setPendingOrdersCount(n), []);

    // Pluck stable useCallback refs out of the (per-render-new) products object,
    // so the effect deps don't churn every render → no refetch-storm / panel flicker.
    const { fetchMerchantInfo, fetchSupportedCryptos, fetchSupportedFiats } = products;

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!wallet.address) {
                if (!cancelled) {
                    setMerchantInfo(null);
                    setCryptos([]);
                    setFiats([]);
                    setLoading(false);
                }
                return;
            }

            if (!cancelled) setLoading(true);
            const [info, cs, fs] = await Promise.all([
                fetchMerchantInfo(wallet.address as Address),
                fetchSupportedCryptos(),
                fetchSupportedFiats(),
            ]);

            if (!cancelled) {
                setMerchantInfo(info);
                setCryptos(cs);
                setFiats(fs);
                setLoading(false);
            }
        };

        void load();
        return () => { cancelled = true; };
    }, [wallet.address, fetchMerchantInfo, fetchSupportedCryptos, fetchSupportedFiats]);

    if (!wallet.isConnected) {
        return (
            <NotConnectedPlaceholder
                title="Merchant Panel"
                description="Connect your wallet to register as a merchant, list products, and manage orders."
                features={[
                    { icon: Store, label: 'List crypto / fiat products' },
                    { icon: ClipboardList, label: 'Track orders & disputes' },
                    { icon: Wallet, label: 'Manage balances & withdrawals' },
                ]}
            />
        );
    }

    if (loading) {
        return (
            <main className="screen-fixed flex w-full justify-center px-4 py-5 sm:px-6">
                <section className="flex w-full max-w-[1280px]">
                    <Card padding="none" className="w-full p-8 text-center">
                        <div className="mx-auto h-6 w-56 animate-pulse rounded bg-[var(--bg-surface-4)]" />
                    </Card>
                </section>
            </main>
        );
    }

    const isMerchant = Boolean(merchantInfo?.isActive);

    return (
        <main className="ambient-page screen-fixed flex w-full justify-center px-4 py-4 sm:px-6">
            <section className="flex h-full w-full max-w-[1440px] flex-col gap-3">
                {/* ── 1. Title row ─────────────────────────────────────────── */}
                <div className="flex flex-shrink-0 items-baseline justify-between gap-3">
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Merchant Terminal</h1>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Manage products, payout accounts & orders.</p>
                </div>

                {/* ── 2. Status pill (compact, 1 row) ─────────────────────── */}
                <div className="flex-shrink-0">
                    <MerchantStatusCard walletAddress={wallet.address} isMerchant={isMerchant} merchantInfo={merchantInfo} />
                </div>

                {!isMerchant && (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <RegisterSection />
                    </div>
                )}

                {isMerchant && merchantInfo && (
                    <>
                        {/* ── 3. Balances strip ──────────────────────────── */}
                        <div className="flex-shrink-0">
                            <BalancesCard address={wallet.address as Address} title="Merchant balances" />
                        </div>

                        {/* ── 4. Main 2-col split: LEFT (cards) / RIGHT (tabs+content) ── */}
                        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
                            {/* LEFT column — compact reputation + claim */}
                            <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
                                <ReputationCard
                                    data={reputation.data}
                                    loading={reputation.loading}
                                    error={reputation.error}
                                    refetch={reputation.refetch}
                                    compact
                                />
                                <ClaimableBondCard address={wallet.address as Address} title="Claimable bond" />
                            </aside>

                            {/* RIGHT column — tabs header + scrollable tab content */}
                            <div className="flex min-h-0 flex-col gap-3">
                                <div className="flex-shrink-0">
                                    <MerchantTabBar
                                        activeTab={activeTab}
                                        onChange={setActiveTab}
                                        ordersBadge={pendingOrdersCount}
                                    />
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    {activeTab === 'list' && (
                                        <ListProductTab cryptos={cryptos} fiats={fiats} products={products} />
                                    )}
                                    {activeTab === 'manage' && (
                                        <ManageTab
                                            merchantAddr={wallet.address as Address}
                                            merchantInfo={merchantInfo}
                                            products={products}
                                        />
                                    )}
                                    {/* OrdersTab stays mounted so the pending-count fetch runs up front
                                        and the tab badge is accurate before the user clicks Orders. */}
                                    <div style={{ display: activeTab === 'orders' ? 'block' : 'none' }}>
                                        <OrdersTab
                                            merchantAddress={wallet.address as Address}
                                            onCountChange={handleOrdersCountChange}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}
