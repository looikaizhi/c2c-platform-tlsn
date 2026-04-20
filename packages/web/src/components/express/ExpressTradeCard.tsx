import Image from 'next/image';
import { CircleHelp } from 'lucide-react';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import SurfaceCard from '@/components/ui/SurfaceCard';
import { CRYPTO_OPTIONS, MONEY_OPTIONS, REGION_OPTIONS } from './constants';

interface ExpressTradeCardProps {
    isBuy: boolean;
    amountPay: string;
    amountRecv: string;
    region: string;
    moneyPair: MoneyPair;
    cryptoPair: CryptoPair;
    rateLabel: string;
    onToggleBuy: (nextIsBuy: boolean) => void;
    onPayAmountChange: (value: string) => void;
    onRecvAmountChange: (value: string) => void;
    onMoneyPairChange: (value: MoneyPair) => void;
    onCryptoPairChange: (value: CryptoPair) => void;
    onRegionChange: (value: string) => void;
}

function SelectChevron() {
    return (
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    );
}

function CurrencyIcon({ mode }: { mode: 'fiat' | 'crypto' }) {
    const baseClass = 'inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold';
    if (mode === 'fiat') {
        return <span className={`${baseClass} bg-[var(--accent-cta)] text-[var(--text-inverse)]`}>$</span>;
    }
    return <span className={`${baseClass} bg-[color:rgb(33_197_165_/_88%)] text-[var(--text-inverse)]`}>T</span>;
}

function AmountField({
    id,
    label,
    amount,
    onAmountChange,
    options,
    selectedValue,
    onSelectChange,
    placeholder,
    currencyMode,
}: {
    id: string;
    label: string;
    amount: string;
    onAmountChange: (value: string) => void;
    options: Array<{ value: string; text: string }>;
    selectedValue: string;
    onSelectChange: (value: string) => void;
    placeholder: string;
    currencyMode: 'fiat' | 'crypto';
}) {
    return (
        <div className="relative h-[92px] rounded-[14px] border border-[color:rgb(64_82_109_/_62%)] bg-[color:rgb(20_27_41_/_92%)] px-4">
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <div className="pt-[12px]">
                <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[color:rgb(234_236_239_/_95%)]">{label}</span>
                </div>
            </div>

            <input
                id={id}
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                type="number"
                placeholder={placeholder}
                className="absolute bottom-[15px] left-4 w-[56%] bg-transparent text-[2.05rem] font-medium leading-none tracking-[0.01em] text-[color:rgb(124_140_163)] placeholder:text-[color:rgb(102_118_141)] outline-none"
            />

            <div className="absolute bottom-[15px] right-10 flex items-center gap-2">
                <CurrencyIcon mode={currencyMode} />
                <select
                    className="w-[96px] cursor-pointer appearance-none bg-transparent pr-5 text-right text-[1.5rem] font-semibold text-white outline-none"
                    value={selectedValue}
                    onChange={(e) => onSelectChange(e.target.value)}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value} className="bg-[var(--bg-surface-3)] text-white">
                            {option.text}
                        </option>
                    ))}
                </select>
            </div>

            <SelectChevron />
        </div>
    );
}

export default function ExpressTradeCard({
    isBuy,
    amountPay,
    amountRecv,
    region,
    moneyPair,
    cryptoPair,
    rateLabel,
    onToggleBuy,
    onPayAmountChange,
    onRecvAmountChange,
    onMoneyPairChange,
    onCryptoPairChange,
    onRegionChange,
}: ExpressTradeCardProps) {
    const currentRegion = REGION_OPTIONS[region] ?? REGION_OPTIONS.TW;

    return (
        <SurfaceCard
            elevated
            className="h-[592px] w-full max-w-[486px] shrink-0 overflow-hidden rounded-[24px] border border-[color:rgb(64_82_109_/_72%)] bg-[color:rgb(24_29_39_/_98%)] shadow-[0_18px_32px_rgb(0_0_0_/_34%)]"
        >
            <div className="flex h-full w-full flex-col">
                <div
                    className="flex h-[60px] shrink-0 overflow-hidden rounded-t-[24px] border-b border-[color:rgb(64_82_109_/_48%)] bg-[color:rgb(53_64_83_/_90%)]"
                    role="tablist"
                    aria-label="Buy or Sell"
                >
                    <div className={`grow ${isBuy ? 'rounded-tr-[16px] bg-[color:rgb(20_27_41_/_96%)]' : 'bg-transparent'}`}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isBuy}
                            className={`flex h-full w-full items-center justify-center text-[1.75rem] font-semibold transition-colors duration-[var(--motion-fast)] ${
                                isBuy
                                    ? 'text-white'
                                    : 'text-[var(--text-muted)] hover:bg-[color:rgb(45_57_76_/_48%)] hover:text-[var(--text-secondary)]'
                            }`}
                            onClick={() => onToggleBuy(true)}
                        >
                            Buy
                        </button>
                    </div>
                    <div className={`grow ${!isBuy ? 'rounded-tl-[16px] bg-[color:rgb(20_27_41_/_96%)]' : 'bg-transparent'}`}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={!isBuy}
                            className={`flex h-full w-full items-center justify-center text-[1.75rem] font-semibold transition-colors duration-[var(--motion-fast)] ${
                                !isBuy
                                    ? 'text-white'
                                    : 'text-[var(--text-muted)] hover:bg-[color:rgb(45_57_76_/_48%)] hover:text-[var(--text-secondary)]'
                            }`}
                            onClick={() => onToggleBuy(false)}
                        >
                            Sell
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
                    <div className="flex flex-col gap-4">
                        <AmountField
                            id="express-amount-pay"
                            label="You Pay"
                            amount={isBuy ? amountPay : amountRecv}
                            onAmountChange={isBuy ? onPayAmountChange : onRecvAmountChange}
                            options={isBuy ? MONEY_OPTIONS : CRYPTO_OPTIONS}
                            selectedValue={isBuy ? moneyPair : cryptoPair}
                            onSelectChange={isBuy
                                ? (value) => onMoneyPairChange(value as MoneyPair)
                                : (value) => onCryptoPairChange(value as CryptoPair)
                            }
                            placeholder={isBuy ? '10-40000' : '7.5131-30000'}
                            currencyMode={isBuy ? 'fiat' : 'crypto'}
                        />

                        <AmountField
                            id="express-amount-recv"
                            label="You Receive"
                            amount={isBuy ? amountRecv : amountPay}
                            onAmountChange={isBuy ? onRecvAmountChange : onPayAmountChange}
                            options={isBuy ? CRYPTO_OPTIONS : MONEY_OPTIONS}
                            selectedValue={isBuy ? cryptoPair : moneyPair}
                            onSelectChange={isBuy
                                ? (value) => onCryptoPairChange(value as CryptoPair)
                                : (value) => onMoneyPairChange(value as MoneyPair)
                            }
                            placeholder={isBuy ? '7.5131-30000' : '10-40000'}
                            currencyMode={isBuy ? 'crypto' : 'fiat'}
                        />

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-1.5 text-[14px] font-semibold text-white">
                                <span>Available Region</span>
                                <CircleHelp className="h-4 w-4 text-[var(--text-muted)]" />
                            </div>
                            <div className="relative flex h-[62px] items-center rounded-[14px] border border-[color:rgb(64_82_109_/_62%)] bg-[color:rgb(20_27_41_/_92%)] px-4">
                                <Image
                                    src={currentRegion.img}
                                    alt={`${currentRegion.name} Flag`}
                                    width={22}
                                    height={22}
                                    className="mr-3 h-[22px] w-[22px] rounded"
                                />
                                <select
                                    id="express-region"
                                    className="w-full appearance-none bg-transparent pr-7 text-[1.5rem] font-semibold text-white outline-none"
                                    value={region}
                                    onChange={(e) => onRegionChange(e.target.value)}
                                >
                                    {Object.entries(REGION_OPTIONS).map(([code, data]) => (
                                        <option key={code} value={code} className="bg-[var(--bg-surface-3)] text-white">
                                            {data.name}
                                        </option>
                                    ))}
                                </select>
                                <SelectChevron />
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-6">
                        <div className="mb-3 flex items-center gap-1.5 text-[13px] text-[var(--text-subtle)]">
                            <span>Estimated price</span>
                            <CircleHelp className="h-4 w-4" />
                            <span className="font-semibold text-white">1 {cryptoPair} ≈ {rateLabel} {moneyPair}</span>
                        </div>

                        <button
                            type="button"
                            className="inline-flex h-[52px] w-full items-center justify-center rounded-[10px] border border-[color:rgb(35_104_80_/_86%)] bg-[color:rgb(33_93_72_/_95%)] text-[1.35rem] font-semibold text-[color:rgb(105_134_119)] transition-all duration-[var(--motion-fast)] hover:bg-[color:rgb(37_104_80_/_98%)] hover:text-[color:rgb(128_157_142)]"
                        >
                            Select Payment Method
                        </button>
                    </div>
                </div>
            </div>
        </SurfaceCard>
    );
}
