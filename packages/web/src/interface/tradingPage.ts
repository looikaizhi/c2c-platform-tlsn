export enum TradingType {
    EXPRESS = "express",
    P2P = "p2p",
    Bulk = "bulk"
}

export const TradingType_CN_Map = {
    [TradingType.EXPRESS]: "快捷区",
    [TradingType.P2P]: "自选区",
    [TradingType.Bulk]: "大宗区"
}

export enum CoinType{
    USDT = "USDT",
    USDC = "USDC",
    BTC = "BTC",
    ETH = "ETH",
    HYPE = "HYPE",
}

export interface Coin {
    name: string;
    symbol: string;
    icon: string;
}

export interface TradingPageProps {
    tradingType: TradingType;
}

export interface Region{
    name: string;
    img: string;
}
