/**
 * Price model - server-side only.
 * Used in API routes, NOT in client components.
 */
import { ethers } from "ethers";
import { PriceServiceConnection } from "@pythnetwork/price-service-client";
import { AggregatorV3_ABI } from "@/interface/price";
import type { LatestRoundData, OracleOptions, AlternativeItem, FeedGreedItem } from "@/interface/price";

export const DEFAULT_MONEY = {
  "CNY": "0xeF8A4aF35cd47424672E3C590aBD37FBB7A7759a",
  "USD": "1",
} as const;

export const DEFAULT_CRYPTO = {
  "BTC" : "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH" : "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "USDT": "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  "USDC": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "HYPE": "0x4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b",
} as const;

export type MoneyPair = keyof typeof DEFAULT_MONEY | string;
export type CryptoPair = keyof typeof DEFAULT_CRYPTO | string;

export function getDefaultOptions(pair: Record<string, string>): Array<{value: string, text: string}>{
  return Object.keys(pair).map(key =>{
    return{
      value: key,
      text: key
    };
  })
}

export class PriceOracle {
  private provider: ethers.JsonRpcProvider;
  private connection: PriceServiceConnection;
  private moneyMap: Record<string, string>;
  private cryptoMap: Record<string, string>;

  constructor(opts: OracleOptions = {}) {
    const {
      rpcUrl = process.env.ALCHEMY_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/ACTUWKI7wYkD-wR2bFiP7mlPptqP5jq6",
      hermesUrl = "https://hermes.pyth.network",
      moneyMap = DEFAULT_MONEY,
      cryptoMap = DEFAULT_CRYPTO,
      timeoutMs = 10_000,
      binaryPriceFeed = true,
    } = opts;

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.connection = new PriceServiceConnection(hermesUrl, {
      timeout: timeoutMs,
      priceFeedRequestConfig: { binary: binaryPriceFeed },
    });

    this.moneyMap = moneyMap;
    this.cryptoMap = cryptoMap;
  }

  async getMoneyPrice(pair: MoneyPair): Promise<number|null> {
    if(pair == "USD") return 1;
    const address = this.moneyMap[pair];
    if (!address) throw new Error(`Not exist MONEY pair: ${pair}`);
    try{
        const feed = new ethers.Contract(address, AggregatorV3_ABI, this.provider);
        const rd = (await feed.latestRoundData()) as unknown as LatestRoundData;
        const decimals = Number(await feed.decimals());
        const price = Number(rd.answer) / 10 ** decimals;
        return price;
    }catch (e) {
        console.error("获取 Chainlink 价格失败:", e);
        return null;
    }
  }

  async getCryptoPrice(pair: CryptoPair): Promise<number | null> {
    const id = this.cryptoMap[pair];
    if (!id) throw new Error(`Not exist CRYPTO pair: ${pair}`);

    try {
      const feeds = await this.connection.getLatestPriceFeeds([id]);
      if (!feeds?.length) return null;

      const pf = feeds[0].getPriceUnchecked();
      const price = Number(pf.price) * 10 ** (pf.expo);
      return price;
    } catch (e) {
      console.error("获取 Pyth 价格失败:", e);
      return null;
    }
  }

  async getFearGreedLatest(): Promise<FeedGreedItem>{
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if(!res.ok) throw new Error(`FNG API ${res.status}`);
    const json = await res.json() as {data: AlternativeItem[];}
    const data = json.data[0]
    return {
      value: Number(data.value),
      value_classification: data.value_classification,
      timestamp: new Date(Number(data.timestamp) * 1000),
    } as FeedGreedItem;
  }

  async getRate(moneyPair: MoneyPair, cryptoPair: CryptoPair): Promise<number | null> {
    const [m, c] = await Promise.all([
      this.getMoneyPrice(moneyPair),
      this.getCryptoPrice(cryptoPair),
    ]);

    if (m != null && c != null) {
        return c / m;
    }
    return null;
  }
}
