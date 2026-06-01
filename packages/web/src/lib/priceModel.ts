/**
 * Price model — SERVER-SIDE ONLY. Source: CoinGecko Demo API.
 * Endpoint: GET https://api.coingecko.com/api/v3/simple/price?ids=<coinId>&vs_currencies=<vs>
 *
 * NEVER import this from a client component — undici pulls in node:async_hooks
 * which can't be bundled for the browser. Client code should import
 * from '@/lib/assetRegistry' for symbol lists / types instead.
 */
import 'server-only';
import { ProxyAgent, type Dispatcher } from 'undici';
import { cryptoCgId, moneyCgVs } from './assetRegistry';
import type { OracleOptions, AlternativeItem, FeedGreedItem } from '@/interface/price';

const CG_BASE = 'https://api.coingecko.com/api/v3';

// Node 18+ built-in `fetch` (undici) does NOT honour HTTPS_PROXY / HTTP_PROXY
// environment variables, unlike curl / git / python-requests. Behind GFW or
// corporate proxies this means every outbound request silently times out. We
// explicitly build a ProxyAgent if any proxy env var is present, so server-side
// CoinGecko calls go through the user's local proxy (e.g. Clash / V2Ray).
const PROXY_URL =
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY  || process.env.http_proxy  || '';
const proxyDispatcher: Dispatcher | undefined = PROXY_URL ? new ProxyAgent(PROXY_URL) : undefined;
if (PROXY_URL) console.info(`[PriceOracle] Routing CoinGecko via proxy: ${PROXY_URL}`);

// In-process TTL cache — protects the 10k/month Demo quota against
// refresh-button spam and multi-tab clients within a single Node instance.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: number | null; expires: number }>();

interface SimplePriceResponse { [coinId: string]: { [vs: string]: number } }

export class PriceOracle {
  private apiKey: string;
  private timeoutMs: number;

  constructor(opts: OracleOptions = {}) {
    this.apiKey    = opts.apiKey    ?? process.env.COINGECKO_API_KEY ?? '';
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    if (!this.apiKey) {
      console.warn('[PriceOracle] COINGECKO_API_KEY not set — using anonymous rate limits');
    }
  }

  /**
   * Returns fiat-per-crypto (e.g. 4.71 for MYR per 1 USDT).
   * One HTTP call. Returns null if symbol unknown or upstream fails.
   */
  async getRate(money: string, crypto: string): Promise<number | null> {
    const coinId = cryptoCgId(crypto);
    const vs     = moneyCgVs(money);
    if (!coinId || !vs) return null;

    const key = `${coinId}:${vs}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const value = await this.fetchPrice(coinId, vs);
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Back-compat: USD price of a crypto. */
  async getCryptoPrice(crypto: string): Promise<number | null> {
    return this.getRate('USD', crypto);
  }

  /** Back-compat: fiat per 1 USD. USD itself is identity. */
  async getMoneyPrice(money: string): Promise<number | null> {
    if (moneyCgVs(money) === 'usd') return 1;
    // USDT ≈ 1 USD; using it as a stable proxy avoids a separate USD-base endpoint.
    return this.getRate(money, 'USDT');
  }

  private async fetchPrice(coinId: string, vs: string): Promise<number | null> {
    const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${encodeURIComponent(vs)}`;
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : {},
        signal: ctl.signal,
        // @ts-expect-error — `dispatcher` is an undici-specific extension to Fetch options,
        // not yet in the standard `RequestInit` type. It's how undici routes through ProxyAgent.
        dispatcher: proxyDispatcher,
      });
      if (!res.ok) {
        console.warn(`[PriceOracle] CoinGecko ${res.status} for ${coinId}/${vs}`);
        return null;
      }
      const data = (await res.json()) as SimplePriceResponse;
      return data[coinId]?.[vs] ?? null;
    } catch (e) {
      console.error('[PriceOracle] CoinGecko fetch failed:', e);
      return null;
    } finally {
      clearTimeout(tid);
    }
  }

  async getFearGreedLatest(): Promise<FeedGreedItem> {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) throw new Error(`FNG API ${res.status}`);
    const json = (await res.json()) as { data: AlternativeItem[] };
    const d = json.data[0];
    return {
      value: Number(d.value),
      value_classification: d.value_classification,
      timestamp: new Date(Number(d.timestamp) * 1000),
    } as FeedGreedItem;
  }
}
