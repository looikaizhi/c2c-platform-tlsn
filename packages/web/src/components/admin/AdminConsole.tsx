"use client";
import { useState } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import CryptoAssetTable from './CryptoAssetTable';
import FiatAssetTable from './FiatAssetTable';
import AddCryptoForm from './AddCryptoForm';
import AddFiatForm from './AddFiatForm';
import RegisterMerchantForm from './RegisterMerchantForm';
import MaxOrderEditor from './MaxOrderEditor';
import MerchantRegistryTable from './MerchantRegistryTable';
import RiskConfigPanel from './RiskConfigPanel';
import UserReputationManager from './UserReputationManager';
import AccessControlPanel from './AccessControlPanel';
import ProofAuditSection from './ProofAuditSection';
import { Modal } from '@/components/ui/Modal';

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
        <div className="flex flex-shrink-0 overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] divide-x divide-[var(--line-soft)]">
            {stats.map((s) => (
                <div key={s.label} className="flex flex-1 flex-col items-center justify-center gap-0.5 px-6 py-3">
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
    const [registerOpen, setRegisterOpen]   = useState(false);

    return (
        <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-6 py-5 sm:px-10">
            {/* Page header */}
            <div className="flex flex-shrink-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:rgb(240_185_11_/_40%)] bg-[color:rgb(240_185_11_/_12%)]">
                    <ShieldCheck className="h-5 w-5 text-[var(--accent-cta)]" strokeWidth={1.5} />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-white">Admin Console</h1>
                    <p className="text-xs text-[var(--text-muted)]">Platform asset management &amp; merchant registration</p>
                </div>
                <button
                    type="button"
                    onClick={() => setRegisterOpen(true)}
                    className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-[var(--state-warning)] px-4 text-sm font-semibold text-[var(--state-warning)] transition-all hover:bg-[color:rgb(240_185_11_/_10%)]"
                >
                    <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                    Register Merchant
                </button>
            </div>

            {/* Stats bar */}
            <StatsBar
                cryptoCount={cryptoStats.total}
                fiatCount={fiatStats.total}
                activeCount={cryptoStats.active + fiatStats.active}
            />

            {/* Asset Management two-column */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="flex min-h-0 flex-1 flex-col gap-6">
                    <CryptoAssetTable
                        refreshSignal={cryptoRefresh}
                        onStatsChange={setCryptoStats}
                    />
                    <FiatAssetTable
                        refreshSignal={fiatRefresh}
                        onStatsChange={setFiatStats}
                    />
                </div>
                <div className="flex w-full flex-col gap-6 lg:w-[340px] lg:flex-shrink-0">
                    <AddCryptoForm onSuccess={() => setCryptoRefresh((n) => n + 1)} />
                    <AddFiatForm   onSuccess={() => setFiatRefresh((n) => n + 1)} />
                </div>
            </div>

            {/* Phase 4: extended admin sections */}
            <MaxOrderEditor />
            <MerchantRegistryTable />
            <RiskConfigPanel />
            <UserReputationManager />
            <AccessControlPanel />

            {/* Phase 6: verifier proof audit */}
            <ProofAuditSection />

            {/* Register merchant modal */}
            <Modal
                open={registerOpen}
                onClose={() => setRegisterOpen(false)}
                title="Register Merchant"
                size="md"
            >
                <RegisterMerchantForm />
            </Modal>
        </main>
    );
}
