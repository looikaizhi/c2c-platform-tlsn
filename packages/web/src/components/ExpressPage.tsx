"use client";

import { useState } from 'react';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import { useTradeQuote } from '@/hooks/useTradeQuote';
import ExpressHero from './express/ExpressHero';
import ExpressTradeCard from './express/ExpressTradeCard';

export default function ExpressPage() {
    const [isBuy, setIsBuy] = useState(true);
    const [region, setRegion] = useState('TW');
    const [moneyPair, setMoneyPair] = useState<MoneyPair>('CNY');
    const [cryptoPair, setCryptoPair] = useState<CryptoPair>('USDT');

    const quote = useTradeQuote({
        isBuy,
        moneyPair,
        cryptoPair,
    });

    return (
        <div className="min-h-[calc(100dvh-120px)]">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-4 pb-20 pt-8 sm:px-6 lg:min-h-[calc(100dvh-220px)] lg:flex-row lg:items-center lg:justify-between lg:gap-[92px] lg:pb-20 lg:pt-12">
                <ExpressHero
                    isBuy={isBuy}
                    moneyPair={moneyPair}
                    cryptoPair={cryptoPair}
                />
                <div className="w-full max-w-[486px] shrink-0 lg:self-center">
                    <ExpressTradeCard
                        isBuy={isBuy}
                        amountPay={quote.amountPay}
                        amountRecv={quote.amountRecv}
                        region={region}
                        moneyPair={moneyPair}
                        cryptoPair={cryptoPair}
                        rateLabel={quote.rateLabel}
                        onToggleBuy={setIsBuy}
                        onPayAmountChange={quote.onPayAmountChange}
                        onRecvAmountChange={quote.onReceiveAmountChange}
                        onMoneyPairChange={setMoneyPair}
                        onCryptoPairChange={setCryptoPair}
                        onRegionChange={setRegion}
                    />
                </div>
            </div>
        </div>
    );
}
