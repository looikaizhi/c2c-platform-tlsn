export enum TradingType {
    EXPRESS = "express",
    P2P = "p2p",
    Bulk = "bulk"
}

export const TradingType_Label_Map = {
    [TradingType.EXPRESS]: "Express",
    [TradingType.P2P]: "P2P",
    [TradingType.Bulk]: "Block"
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
