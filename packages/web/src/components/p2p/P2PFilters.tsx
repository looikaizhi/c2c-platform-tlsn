import { Filter, SlidersHorizontal } from 'lucide-react';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';

interface Option {
    value: string;
    text: string;
}

interface P2PFiltersProps {
    isBuy: boolean;
    onToggleBuy: (isBuy: boolean) => void;
    cryptoPair: CryptoPair;
    onCryptoChange: (crypto: CryptoPair) => void;
    moneyPair: MoneyPair;
    onMoneyChange: (money: MoneyPair) => void;
    payMethod: string;
    onPayMethodChange: (method: string) => void;
    sortKey: string;
    onSortKeyChange: (sortKey: string) => void;
    cryptoOptions: Option[];
    moneyOptions: Option[];
}

function FieldSelect({
    value,
    onChange,
    children,
    label,
}: {
    value: string;
    onChange: (value: string) => void;
    children: React.ReactNode;
    label: string;
}) {
    return (
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            {label}
            <select
                className="terminal-select h-10 min-w-32 px-3 text-sm"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {children}
            </select>
        </label>
    );
}

export default function P2PFilters({
    isBuy,
    onToggleBuy,
    cryptoPair,
    onCryptoChange,
    moneyPair,
    onMoneyChange,
    payMethod,
    onPayMethodChange,
    sortKey,
    onSortKeyChange,
    cryptoOptions,
    moneyOptions,
}: P2PFiltersProps) {
    return (
        <SurfaceCard className="mb-4 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-1">
                    <button
                        type="button"
                        className={`h-9 rounded-md px-4 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${isBuy ? 'border border-[color:rgb(252_213_53_/_70%)] bg-[var(--accent-cta)] text-[var(--text-inverse)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-3)] hover:text-white'}`}
                        onClick={() => onToggleBuy(true)}
                    >
                        Buy 买入
                    </button>
                    <button
                        type="button"
                        className={`h-9 rounded-md px-4 text-sm font-semibold transition-all duration-[var(--motion-fast)] ${!isBuy ? 'border border-[color:rgb(252_213_53_/_70%)] bg-[var(--accent-cta)] text-[var(--text-inverse)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-3)] hover:text-white'}`}
                        onClick={() => onToggleBuy(false)}
                    >
                        Sell 卖出
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label={isBuy ? 'Buyer View' : 'Seller View'} tone="info" />
                    <StatusPill label="P2P Orderbook" tone="success" />
                </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
                {cryptoOptions.map((c) => (
                    <button
                        type="button"
                        key={c.value}
                        onClick={() => onCryptoChange(c.value)}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-all duration-[var(--motion-fast)] ${
                            cryptoPair === c.value
                                ? 'border-[color:rgb(240_185_11_/_55%)] bg-[color:rgb(240_185_11_/_12%)] text-white'
                                : 'border-[var(--line-soft)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:border-[var(--line-strong)] hover:text-white'
                        }`}
                    >
                        {c.text}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <FieldSelect label="Amount" value="交易金额" onChange={() => {}}>
                    <option>交易金额</option>
                    <option>&ge; 1,000</option>
                    <option>&ge; 10,000</option>
                </FieldSelect>

                <FieldSelect label="Fiat" value={moneyPair} onChange={(value) => onMoneyChange(value as MoneyPair)}>
                    {moneyOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.text}
                        </option>
                    ))}
                </FieldSelect>

                <FieldSelect label="Payment" value={payMethod} onChange={onPayMethodChange}>
                    <option>所有支付方式</option>
                    <option>银行卡</option>
                    <option>微信</option>
                    <option>支付宝</option>
                </FieldSelect>

                <FieldSelect label="Sort" value={sortKey} onChange={onSortKeyChange}>
                    <option>价格</option>
                    <option>成交量</option>
                </FieldSelect>

                <button
                    type="button"
                    className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-4 text-sm text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)] hover:text-white"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    高级筛选
                </button>

                <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] px-4 text-sm text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)] hover:text-white"
                >
                    <Filter className="h-4 w-4" />
                    Quick Filter
                </button>
            </div>
        </SurfaceCard>
    );
}
