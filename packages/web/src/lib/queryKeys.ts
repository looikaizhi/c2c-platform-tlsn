import type { CryptoPair, MoneyPair } from './priceModel';

export const queryKeys = {
    dashboard: (walletAddress: string) => ['dashboard', walletAddress] as const,
    orderList: (params: {
        walletAddress: string;
        isBuy: boolean;
        moneyPair: MoneyPair;
        cryptoPair: CryptoPair;
    }) => ['order-list', params.walletAddress, params.isBuy ? 1 : 0, params.moneyPair, params.cryptoPair] as const,
    orderPayment: (orderId: number) => ['order-payment', String(orderId)] as const,
    orderDetail: (orderId: string) => ['order-detail', orderId] as const,
    rate: (moneyPair: MoneyPair, cryptoPair: CryptoPair) => ['rate', moneyPair, cryptoPair] as const,
};
