import SurfaceCard from '@/components/ui/SurfaceCard';

export type MerchantTab = 'list' | 'manage' | 'orders';

interface MerchantTabBarProps {
    activeTab: MerchantTab;
    onChange: (tab: MerchantTab) => void;
}

const TABS: Array<{ key: MerchantTab; label: string; en: string }> = [
    { key: 'list', label: '上架商品', en: 'List Products' },
    { key: 'manage', label: '管理商品', en: 'Manage' },
    { key: 'orders', label: '待处理订单', en: 'Orders' },
];

export default function MerchantTabBar({ activeTab, onChange }: MerchantTabBarProps) {
    return (
        <SurfaceCard className="p-2">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Merchant tabs">
                {TABS.map((tab) => (
                    <button
                        type="button"
                        key={tab.key}
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        onClick={() => onChange(tab.key)}
                        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${
                            activeTab === tab.key
                                ? 'border-[color:rgb(240_185_11_/_55%)] bg-[color:rgb(240_185_11_/_12%)] text-white shadow-[inset_0_-2px_0_0_var(--accent-cta)]'
                                : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                        }`}
                    >
                        {tab.label}
                        <span className="ml-1 hidden text-[11px] text-[var(--text-muted)] sm:inline">{tab.en}</span>
                    </button>
                ))}
            </div>
        </SurfaceCard>
    );
}
