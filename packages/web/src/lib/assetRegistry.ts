/**
 * Asset registry — single source of truth for all crypto/fiat the platform recognises.
 * Backed by src/config/assets.json. Entries marked `onChain !== null` are registered
 * on the C2C contracts (via deploy-web.ts), `onChain === null` entries are
 * display-only (e.g. BTC / ETH for ExpressPage quotes, USD as a money unit).
 */
import raw from '@/config/assets.json';

export interface CryptoOnChain { id: number; decimals: number; }
export interface FiatOnChain   { id: number; }

export interface CryptoAsset {
  symbol: string;
  displayName: string;
  coingeckoId: string;
  onChain: CryptoOnChain | null;
}
export interface FiatAsset {
  symbol: string;
  displayName: string;
  coingeckoVs: string;
  onChain: FiatOnChain | null;
}

export const ASSETS = raw as { crypto: CryptoAsset[]; fiat: FiatAsset[] };

// ── Lookups ─────────────────────────────────────────────────────────────────
export const findCrypto = (symbol: string): CryptoAsset | undefined =>
  ASSETS.crypto.find((c) => c.symbol === symbol);
export const findFiat = (symbol: string): FiatAsset | undefined =>
  ASSETS.fiat.find((f) => f.symbol === symbol);

/** CoinGecko coin id for any registered crypto symbol (on-chain or display-only). */
export const cryptoCgId = (symbol: string): string | null =>
  findCrypto(symbol)?.coingeckoId ?? null;
/** CoinGecko vs_currency code for any registered fiat symbol. */
export const moneyCgVs = (symbol: string): string | null =>
  findFiat(symbol)?.coingeckoVs ?? null;
/** Token decimals (only meaningful for on-chain cryptos). */
export const tokenDecimals = (symbol: string): number | null =>
  findCrypto(symbol)?.onChain?.decimals ?? null;

// ── On-chain filters ────────────────────────────────────────────────────────
export const onChainCryptos = (): CryptoAsset[] => ASSETS.crypto.filter((c) => c.onChain !== null);
export const onChainFiats   = (): FiatAsset[]   => ASSETS.fiat.filter((f) => f.onChain !== null);

// ── Symbol lists (for UI dropdowns) ─────────────────────────────────────────
/** All fiat symbols incl. display-only units like USD. */
export const allMoneySymbols = (): string[] => ASSETS.fiat.map((f) => f.symbol);
/** Only on-chain cryptos (for P2P dropdown — must match contract registry). */
export const allCryptoSymbols = (): string[] => onChainCryptos().map((c) => c.symbol);
/** All crypto symbols incl. display-only ones (for Express quote dropdown). */
export const allDisplayCryptoSymbols = (): string[] => ASSETS.crypto.map((c) => c.symbol);

// ── Option-list helpers for <select> dropdowns ──────────────────────────────
const toOptions = (symbols: string[]) => symbols.map((s) => ({ value: s, text: s }));
export const moneyOptions          = () => toOptions(allMoneySymbols());
export const cryptoOptions         = () => toOptions(allCryptoSymbols());
export const displayCryptoOptions  = () => toOptions(allDisplayCryptoSymbols());

// ── Type aliases (kept here so client code never has to import priceModel) ──
export type MoneyPair  = string;
export type CryptoPair = string;
