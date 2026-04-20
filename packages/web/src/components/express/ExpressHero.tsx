interface ExpressHeroProps {
    isBuy: boolean;
    moneyPair: string;
    cryptoPair: string;
}

export default function ExpressHero({
    isBuy,
    moneyPair,
    cryptoPair,
}: ExpressHeroProps) {
    const title = isBuy ? `Buy ${cryptoPair} with ${moneyPair}` : `Sell ${cryptoPair} for ${moneyPair}`;

    return (
        <div className="w-full max-w-[620px] flex-1 text-center lg:max-w-[600px] lg:self-center lg:text-left">
            <h1 className="font-[var(--font-heading)] text-[clamp(52px,3.6vw,66px)] font-semibold leading-[1.07] tracking-[-0.012em] text-white">
                P2P Express
            </h1>
            <h2 className="mt-3 font-[var(--font-heading)] text-[clamp(52px,3.6vw,66px)] font-semibold leading-[1.07] tracking-[-0.012em] text-white xl:whitespace-nowrap">
                {title}
            </h2>
            <p className="mx-auto mt-8 max-w-[35ch] font-[var(--font-body)] text-[clamp(18px,1.15vw,24px)] leading-[1.3] text-[var(--color-SecondaryText)] lg:mx-0">
                Buy and Sell {cryptoPair} on Binance-style P2P with various payment methods
            </p>
        </div>
    );
}
