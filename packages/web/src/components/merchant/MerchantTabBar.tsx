import { Card } from '@/components/ui/Card';

export type MerchantTab = 'list' | 'manage' | 'orders';

interface MerchantTabBarProps {
    activeTab: MerchantTab;
    onChange: (tab: MerchantTab) => void;
    /** Numeric badge shown on the Orders tab (e.g. count of pending FIAT orders). */
    ordersBadge?: number;
}

const TABS: Array<{ key: MerchantTab; label: string }> = [
    { key: 'list', label: 'List Products' },
    { key: 'manage', label: 'Manage' },
    { key: 'orders', label: 'Orders' },
];

export default function MerchantTabBar({ activeTab, onChange, ordersBadge }: MerchantTabBarProps) {
    return (
        <Card padding="none" className="p-2">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Merchant tabs">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.key;
                    const showBadge = tab.key === 'orders' && ordersBadge !== undefined && ordersBadge > 0;
                    return (
                        <button
                            type="button"
                            key={tab.key}
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => onChange(tab.key)}
                            className={`relative inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-[var(--motion-fast)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cta)] ${
                                isActive
                                    ? 'border-[color:rgb(240_185_11_/_55%)] bg-[color:rgb(240_185_11_/_12%)] text-white shadow-[inset_0_-2px_0_0_var(--accent-cta)]'
                                    : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                            }`}
                        >
                            <span>{tab.label}</span>
                            {showBadge && ordersBadge !== undefined && (
                                <span
                                    aria-label={`${ordersBadge} pending`}
                                    className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--status-warning)] px-1.5 text-[10px] font-bold leading-5 text-black"
                                >
                                    {ordersBadge > 99 ? '99+' : ordersBadge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </Card>
    );
}
