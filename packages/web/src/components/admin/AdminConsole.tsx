"use client";
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import CryptoAssetTable from './CryptoAssetTable';
import FiatAssetTable from './FiatAssetTable';
import AddCryptoForm from './AddCryptoForm';
import AddFiatForm from './AddFiatForm';
import RegisterMerchantForm from './RegisterMerchantForm';

interface StatsProps {
    cryptoCount: number;
    fiatCount: number;
    activeCount: number;
}

function StatsBar({ cryptoCount, fiatCount, activeCount }: StatsProps) {
    const stats = [
        { label: 'Crypto Assets', value: cryptoCount, color: 'text-[var(--accent-cta)]' },
        { label: 'Fiat Assets',   value: fiatCount,   color: 'text-[var(--state-info)]' },
        { label: 'Active Total',  value: activeCount,  color: 'text-[var(--state-success)]' },
    ];

    return (
        <div className="mb-8 flex overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] divide-x divide-[var(--line-soft)]">
            {stats.map((s) => (
                <div key={s.label} className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-4">
                    <span className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
                    <span className="text-xs text-[var(--text-muted)]">{s.label}</span>
                </div>
            ))}
        </div>
    );
}

export default function AdminConsole() {
    const [cryptoRefresh, setCryptoRefresh] = useState(0);
    const [fiatRefresh, setFiatRefresh]     = useState(0);
    const [cryptoStats, setCryptoStats]     = useState({ total: 0, active: 0 });
    const [fiatStats, setFiatStats]         = useState({ total: 0, active: 0 });

    return (
        <main className="flex w-full max-w-[1120px] flex-col px-6 py-10 sm:px-10">
            {/* Page header */}
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:rgb(240_185_11_/_40%)] bg-[color:rgb(240_185_11_/_12%)]">
                    <ShieldCheck className="h-5 w-5 text-[var(--accent-cta)]" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-white">Admin Console</h1>
                    <p className="text-xs text-[var(--text-muted)]">Platform asset management &amp; merchant registration</p>
                </div>
            </div>

            {/* Stats bar */}
            <StatsBar
                cryptoCount={cryptoStats.total}
                fiatCount={fiatStats.total}
                activeCount={cryptoStats.active + fiatStats.active}
            />

            {/* Two-column flex row — items-stretch makes both columns equal height */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">

                {/* Left column: tables — grows to fill remaining width */}
                <div className="flex flex-1 flex-col gap-6">
                    <CryptoAssetTable
                        refreshSignal={cryptoRefresh}
                        onStatsChange={setCryptoStats}
                    />
                    <FiatAssetTable
                        refreshSignal={fiatRefresh}
                        onStatsChange={setFiatStats}
                    />
                </div>

                {/* Right column: forms — fixed 340px, flex col so forms fill height evenly */}
                <div className="flex w-full flex-col gap-6 lg:w-[340px] lg:flex-shrink-0">
                    <AddCryptoForm onSuccess={() => setCryptoRefresh((n) => n + 1)} />
                    <AddFiatForm   onSuccess={() => setFiatRefresh((n) => n + 1)} />
                </div>
            </div>

            {/* Bottom: register merchant */}
            <div className="mt-8 border-t border-[var(--line-soft)] pt-8">
                <RegisterMerchantForm />
            </div>
        </main>
    );
}
