export const CRYPTO_ASSETS = [
    { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
] as const;

export const FIAT_ASSETS = [
    { symbol: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
    { symbol: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾' },
    { symbol: 'TWD', name: 'New Taiwan Dollar', flag: '🇹🇼' },
] as const;

export type CryptoSymbol = (typeof CRYPTO_ASSETS)[number]['symbol'];
export type FiatSymbol = (typeof FIAT_ASSETS)[number]['symbol'];
