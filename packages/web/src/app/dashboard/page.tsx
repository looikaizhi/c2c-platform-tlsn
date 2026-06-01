"use client";

import type { Address } from 'viem';
import { Wallet, Star, ListChecks } from 'lucide-react';
import { useReputation } from '@/hooks/useReputation';
import { useWallet } from '@/hooks/useWallet';
import UserWalletCard from '@/components/dashboard/UserWalletCard';
import BalancesCard from '@/components/shared/BalancesCard';
import ClaimableBondCard from '@/components/shared/ClaimableBondCard';
import ReputationCard from '@/components/dashboard/ReputationCard';
import ActiveOrdersList from '@/components/dashboard/ActiveOrdersList';
import NotConnectedPlaceholder from '@/components/shared/NotConnectedPlaceholder';

export default function DashboardPage() {
    const wallet = useWallet();
    const reputation = useReputation(wallet.address ?? undefined);

    if (!wallet.isConnected || !wallet.address) {
        return (
            <NotConnectedPlaceholder
                title="Connect your wallet"
                description="View balances, reputation, claimable bonds, and your active orders."
                features={[
                    { icon: Wallet, label: 'Wallet balances across chains' },
                    { icon: Star, label: 'On-chain reputation score' },
                    { icon: ListChecks, label: 'Active orders & bond claims' },
                ]}
            />
        );
    }

    const address = wallet.address as Address;

    return (
        <main className="ambient-page screen-fixed flex w-full justify-center px-4 py-4 sm:px-6">
            <section className="flex h-full w-full max-w-[1440px] flex-col gap-3">
                {/* ── Title row ─────────────────────────────────────────── */}
                <div className="flex flex-shrink-0 items-baseline justify-between gap-3">
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Dashboard</h1>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Your trades, bonds & reputation.</p>
                </div>

                {/* ── Wallet slim pill ──────────────────────────────────── */}
                <div className="flex-shrink-0">
                    <UserWalletCard address={address} />
                </div>

                {/* ── Balances strip ────────────────────────────────────── */}
                <div className="flex-shrink-0">
                    <BalancesCard address={address} title="Wallet balances" />
                </div>

                {/* ── Main 2-col split: LEFT (Reputation + Claim) / RIGHT (Active orders) ── */}
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
                        <ReputationCard
                            data={reputation.data}
                            loading={reputation.loading}
                            error={reputation.error}
                            refetch={reputation.refetch}
                            compact
                        />
                        <ClaimableBondCard address={address} />
                    </aside>

                    <div className="flex min-h-0 flex-col">
                        <ActiveOrdersList address={address} onOrderChange={reputation.refetch} />
                    </div>
                </div>
            </section>
        </main>
    );
}
