"use client";

import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useWallet } from '@/hooks/useWallet';
import { useProducts, type MerchantInfo, type SupportedCrypto, type SupportedFiat } from '@/hooks/useProducts';
import MerchantStatusCard from './merchant/MerchantStatusCard';
import RegisterSection from './merchant/RegisterSection';
import MerchantTabBar, { type MerchantTab } from './merchant/MerchantTabBar';
import ListProductTab from './merchant/ListProductTab';
import ManageTab from './merchant/ManageTab';
import OrdersTab from './merchant/OrdersTab';
import { Card } from './ui/Card';

export default function MerchantPanel() {
    const wallet = useWallet();
    const products = useProducts();

    const [activeTab, setActiveTab] = useState<MerchantTab>('list');
    const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
    const [cryptos, setCryptos] = useState<SupportedCrypto[]>([]);
    const [fiats, setFiats] = useState<SupportedFiat[]>([]);
    const [loading, setLoading] = useState(true);

    const provider = wallet.selectedWallet?.provider;

    useEffect(() => {
        const load = async () => {
            if (!wallet.address) {
                setMerchantInfo(null);
                setCryptos([]);
                setFiats([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            const [info, cs, fs] = await Promise.all([
                products.fetchMerchantInfo(wallet.address as Address, provider),
                products.fetchSupportedCryptos(provider),
                products.fetchSupportedFiats(provider),
            ]);

            setMerchantInfo(info);
            setCryptos(cs);
            setFiats(fs);
            setLoading(false);
        };

        void load();
    }, [wallet.address, provider, products]);

    if (!wallet.isConnected) {
        return (
            <main className="flex min-h-[calc(100dvh-64px)] w-full justify-center px-4 py-6 sm:px-6">
                <section className="flex w-full max-w-[1280px]">
                    <Card padding="none" className="w-full p-8 text-center">
                        <p className="text-lg text-[var(--text-subtle)]">请先连接钱包以管理 Merchant 面板</p>
                    </Card>
                </section>
            </main>
        );
    }

    if (loading) {
        return (
            <main className="flex min-h-[calc(100dvh-64px)] w-full justify-center px-4 py-6 sm:px-6">
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
        <main className="flex min-h-[calc(100dvh-64px)] w-full justify-center px-4 py-6 sm:px-6">
            <section className="flex w-full max-w-[1280px] flex-col gap-5">
                <div style={{ marginBottom: 'var(--space-2)' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Merchant Workspace</p>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>商家管理 Merchant Terminal</h1>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>管理上架商品、收款账户与订单执行流程，保持业务步骤不变并统一终端视觉语义。</p>
                </div>

                <MerchantStatusCard walletAddress={wallet.address} isMerchant={isMerchant} merchantInfo={merchantInfo} />

                {!isMerchant && <RegisterSection />}

                {isMerchant && merchantInfo && (
                    <>
                        <MerchantTabBar activeTab={activeTab} onChange={setActiveTab} />

                        {activeTab === 'list' && (
                            <ListProductTab cryptos={cryptos} fiats={fiats} products={products} provider={provider} />
                        )}
                        {activeTab === 'manage' && <ManageTab merchantInfo={merchantInfo} products={products} provider={provider} />}
                        {activeTab === 'orders' && <OrdersTab merchantAddress={wallet.address as Address} />}
                    </>
                )}
            </section>
        </main>
    );
}
