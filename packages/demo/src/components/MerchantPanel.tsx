// packages/demo/src/components/MerchantPanel.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatUnits, keccak256, stringToBytes, parseUnits, parseAbiItem } from 'viem';
import type { Hex, WalletClient } from 'viem';
import { publicClient, merchantClients } from '../utils/hardhatAccounts';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI, ERC20_ABI } from '../utils/c2cAbi';
import { c2cConfig, isC2CConfigured } from '../utils/c2cContractConfig';
import {
  makeWiseFiatBindingContext,
  generateWiseFiatProof,
  submitWiseFiatProof,
} from '../utils/wiseC2cActions';
import {
  makeAlipayFiatBindingContext,
  generateAlipayFiatProof,
  submitAlipayFiatProof,
} from '../utils/alipayC2cActions';

// ── Platform constants ────────────────────────────────────────────────────────
const PLATFORM_WISE   = keccak256(stringToBytes('wise'))   as Hex;
const PLATFORM_ALIPAY = keccak256(stringToBytes('alipay')) as Hex;
const PLATFORMS = [
  { id: PLATFORM_WISE,   label: 'Wise' },
  { id: PLATFORM_ALIPAY, label: 'Alipay' },
] as const;

// ── Event ABIs ────────────────────────────────────────────────────────────────
const ORDER_PLACED_ABI = parseAbiItem(
  'event OrderPlaced(address indexed buyer, address indexed merchant, uint256 indexed orderId, uint256 productId, uint8 assetType, uint256 amount, uint256 rate, uint256 deadline, uint256 salt)',
);
const MERCHANT_REGISTERED_ABI = parseAbiItem(
  'event MerchantRegistered(address indexed merchant, uint256 registeredAt)',
);
const PRODUCT_LISTED_ABI = parseAbiItem(
  'event ProductListed(address indexed merchant, uint256 indexed productId, uint8 indexed assetType, uint256 cryptoID, uint256 fiatID, uint256 collateralAmount, bool isActive)',
);
const PRODUCT_COLLATERAL_CHANGED_ABI = parseAbiItem(
  'event ProductCollateralChanged(address indexed merchant, uint256 indexed productId, uint8 indexed assetType, int256 delta, uint256 collateralAmount, uint256 pendingAmount, uint256 buyerEscrowedAmount)',
);

// ── Wallet client map ─────────────────────────────────────────────────────────
const walletByAddr = new Map<string, WalletClient>(
  merchantClients.map((c) => [c.account!.address.toLowerCase(), c]),
);

// ── Design tokens ─────────────────────────────────────────────────────────────
const CLR = {
  success: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  danger:  { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  warning: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  neutral: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
  info:    { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
} as const;
type BadgeVariant = keyof typeof CLR;

// ── Shared styles ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 24,
};
const LABEL: React.CSSProperties  = { fontSize: 11, color: '#9ca3af', marginBottom: 2, fontWeight: 500 };
const VALUE: React.CSSProperties  = { fontSize: 13, color: '#111827', wordBreak: 'break-all' };
const MONO: React.CSSProperties   = { fontFamily: 'monospace' };
const GRID2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const GRID3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };
const GRID4: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 };
const FORM_LABEL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4,
};
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#111827',
};

function btnStyle(
  variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary',
  extra: React.CSSProperties = {},
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 14px', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontSize: 12, fontWeight: 600,
  };
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: '#2563eb', color: '#fff' },
    danger:    { background: '#dc2626', color: '#fff' },
    ghost:     { background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb' },
    secondary: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' },
  };
  return { ...base, ...variants[variant], ...extra };
}

// ── Reusable components ───────────────────────────────────────────────────────

function Badge({ v, text }: { v: BadgeVariant; text: string }) {
  const c = CLR[v];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
      borderRadius: 9999, background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.text, flexShrink: 0 }} />
      {text}
    </span>
  );
}

function SectionHdr({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: '0.06em',
      textTransform: 'uppercase', marginBottom: 12, paddingBottom: 6,
      borderBottom: '1px solid #f3f4f6',
    }}>
      {children}
    </div>
  );
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{children}</div>
    </div>
  );
}

function CopyAddr({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ ...MONO, fontSize: 13 }} title={address}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <button
        onClick={() => navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        title={copied ? 'Copied!' : address}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', color: copied ? '#16a34a' : '#9ca3af', fontSize: 12, borderRadius: 3 }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}

// Fix #1: decimals prop so USDC (6 dec) displays correctly
function BalCard({ label, amount, symbol, decimals = 18 }: {
  label: string; amount: bigint; symbol: string; decimals?: number;
}) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px', border: '1px solid #f3f4f6' }}>
      <div style={LABEL}>{label}</div>
      <div style={{ ...MONO, fontSize: 17, fontWeight: 700, color: '#111827', marginTop: 4 }}>
        {parseFloat(formatUnits(amount, decimals)).toFixed(4)}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{symbol}</div>
    </div>
  );
}

// ── Data types ────────────────────────────────────────────────────────────────

interface CryptoAsset { id: bigint; symbol: string; tokenAddress: Hex; isActive: boolean; decimals: number; }
interface FiatAsset   { id: bigint; name: string;   isActive: boolean; }
interface PayInfo     { nameHash: Hex; idHash: Hex; isSet: boolean; }

interface BusinessHoursData {
  openSecond: number;
  closeSecond: number;
  activeDays: number;
  manualOverride: number;
}

interface Product {
  productId: bigint;
  assetType: 0 | 1;
  cryptoID: bigint;
  fiatID: bigint;
  collateralAmount: bigint;
  rate: bigint;
  version: number;
  expiresAt: bigint;
  isOpen: boolean;
  platformId: Hex;      // Fix #6
  bh: BusinessHoursData; // Fix #3
}

interface MerchantData {
  isActive: boolean;
  kybVerified: boolean;
  registeredAt: bigint;
  eth: bigint;
  usdt: bigint;
  usdc: bigint;
  dai: bigint;
  wise: PayInfo;
  alipay: PayInfo;
  products: Product[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function secondsToTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToSeconds(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}

function resolvePlatformLabel(id: Hex): string {
  if (id === PLATFORM_WISE) return 'Wise';
  if (id === PLATFORM_ALIPAY) return 'Alipay';
  return 'Unknown';
}

function resolvePlatformVariant(id: Hex): BadgeVariant {
  if (id === PLATFORM_WISE) return 'info';
  if (id === PLATFORM_ALIPAY) return 'warning';
  return 'neutral';
}

// ── Data loaders ──────────────────────────────────────────────────────────────

async function loadSupportLists(): Promise<{ cryptos: CryptoAsset[]; fiats: FiatAsset[] }> {
  const [cryptoRaw, fiatRaw] = await Promise.all([
    publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getSupportCryptoList', args: [] }),
    publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getSupportFiatList',   args: [] }),
  ]);
  const cryptosBase = (cryptoRaw as any[]).map((r) => ({
    id: r.id, symbol: r.tokenSymbol, tokenAddress: r.tokenAddress, isActive: r.isActive,
  }));
  const decimalsArr = await Promise.all(
    cryptosBase.map((c) =>
      c.tokenAddress && c.tokenAddress.length > 5
        ? publicClient.readContract({ address: c.tokenAddress, abi: ERC20_ABI, functionName: 'decimals', args: [] })
            .then((r) => Number(r)).catch(() => 18)
        : Promise.resolve(18),
    ),
  );
  const cryptos: CryptoAsset[] = cryptosBase.map((c, i) => ({ ...c, decimals: decimalsArr[i] }));
  const fiats: FiatAsset[] = (fiatRaw as any[]).map((r) => ({
    id: r.id, name: r.fiatName, isActive: r.isActive,
  }));
  return { cryptos, fiats };
}

async function loadMerchantList(): Promise<Hex[]> {
  const logs = await publicClient.getLogs({ address: c2cConfig.adminAddress, event: MERCHANT_REGISTERED_ABI, fromBlock: 0n });
  const seen = new Set<string>();
  const addrs: Hex[] = [];
  for (const log of logs) {
    const addr = (log.args as any).merchant as Hex;
    if (addr && !seen.has(addr.toLowerCase())) { seen.add(addr.toLowerCase()); addrs.push(addr); }
  }
  return addrs;
}

function safeBal(addr: Hex, merchant: Hex): Promise<bigint> {
  if (!addr || addr.length < 5) return Promise.resolve(0n);
  return publicClient
    .readContract({ address: addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [merchant] })
    .then((r) => r as bigint).catch(() => 0n);
}

async function loadMerchantData(address: Hex): Promise<MerchantData> {
  const [merchantInfo, eth, usdt, usdc, dai, wise, alipay] = await Promise.all([
    publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'merchants', args: [address] }),
    publicClient.getBalance({ address }),
    safeBal(c2cConfig.usdtAddress, address),
    safeBal(c2cConfig.usdcAddress, address),
    safeBal(c2cConfig.daiAddress,  address),
    publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getMerchantPaymentInfoForPlatform', args: [address, PLATFORM_WISE] }),
    publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getMerchantPaymentInfoForPlatform', args: [address, PLATFORM_ALIPAY] }),
  ]);

  const [productLogs, collateralLogs] = await Promise.all([
    publicClient.getLogs({
      address: c2cConfig.escrowAddress,
      event: PRODUCT_LISTED_ABI,
      args: { merchant: address } as any,
      fromBlock: 0n,
    }),
    publicClient.getLogs({
      address: c2cConfig.escrowAddress,
      event: PRODUCT_COLLATERAL_CHANGED_ABI,
      args: { merchant: address } as any,
      fromBlock: 0n,
    }),
  ]);

  // Build a map of latest collateral per product from ProductCollateralChanged events.
  // Logs are ordered chronologically so the last entry for each key is the most recent.
  const latestCollateral = new Map<string, bigint>();
  for (const log of collateralLogs) {
    const a = log.args as any;
    latestCollateral.set(`${a.productId}-${a.assetType}`, a.collateralAmount as bigint);
  }

  const productMap = new Map<string, { productId: bigint; assetType: 0 | 1; cryptoID: bigint; fiatID: bigint; collateralAmount: bigint; }>();
  for (const log of productLogs) {
    const a = log.args as any;
    const key = `${a.productId}-${a.assetType}`;
    productMap.set(key, {
      productId: a.productId, assetType: Number(a.assetType) as 0 | 1,
      cryptoID: a.cryptoID, fiatID: a.fiatID,
      collateralAmount: latestCollateral.get(key) ?? a.collateralAmount,
    });
  }

  const entries = [...productMap.values()];

  // Fix #6: fetch platformId and businessHours in same parallel batch
  const [rates, opens, platformIds, bhs] = await Promise.all([
    Promise.all(entries.map((p) =>
      publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getMerchantRate', args: [address, p.productId, p.assetType] })
        .then((r) => r as any).catch(() => null),
    )),
    Promise.all(entries.map((p) =>
      publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'isMerchantOpen', args: [address, p.productId, p.assetType] })
        .then((r) => r as boolean).catch(() => false),
    )),
    Promise.all(entries.map((p) =>
      publicClient.readContract({ address: c2cConfig.escrowAddress, abi: C2C_ESCROW_ABI, functionName: 'getProductPlatformId', args: [address, p.productId, p.assetType] })
        .then((r) => r as Hex).catch(() => '0x' as Hex),
    )),
    Promise.all(entries.map((p) =>
      publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'businessHours', args: [address, p.productId, p.assetType] })
        .then((r) => {
          const x = r as any;
          return {
            openSecond:     Number(Array.isArray(x) ? x[0] : (x.openSecond     ?? 0)),
            closeSecond:    Number(Array.isArray(x) ? x[1] : (x.closeSecond    ?? 0)),
            activeDays:     Number(Array.isArray(x) ? x[2] : (x.activeDays     ?? 0)),
            manualOverride: Number(Array.isArray(x) ? x[3] : (x.manualOverride ?? 0)),
          } as BusinessHoursData;
        })
        .catch(() => ({ openSecond: 0, closeSecond: 0, activeDays: 0, manualOverride: 0 } as BusinessHoursData)),
    )),
  ]);

  const products: Product[] = entries.map((p, i) => ({
    ...p,
    rate:       rates[i]?.rate      ?? 0n,
    version:    rates[i]?.version   ?? 0,
    expiresAt:  rates[i]?.expiresAt ?? 0n,
    isOpen:     opens[i],
    platformId: platformIds[i],
    bh:         bhs[i],
  }));

  // Fix #2: use index-based access — viem may return array for multi-output functions
  const mi = merchantInfo as any;
  const isActive    = Array.isArray(mi) ? Boolean(mi[0]) : Boolean(mi?.isActive);
  const kybVerified = Array.isArray(mi) ? Boolean(mi[1]) : Boolean(mi?.kybVerified);
  const registeredAt= Array.isArray(mi) ? (mi[2] as bigint) : (mi?.registeredAt as bigint);

  return {
    isActive, kybVerified, registeredAt,
    eth: eth as bigint,
    usdt, usdc, dai,
    wise:   wise   as PayInfo,
    alipay: alipay as PayInfo,
    products,
  };
}

// ── HashRow ───────────────────────────────────────────────────────────────────

function HashRow({ label, hash }: { label: string; hash: Hex }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, minWidth: 64, flexShrink: 0 }}>{label}</span>
      <span style={{ ...MONO, fontSize: 10, color: '#374151', flex: 1 }}>
        {hash.slice(0, 18)}…{hash.slice(-6)}
      </span>
      <button
        onClick={() => navigator.clipboard.writeText(hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
        title={copied ? 'Copied!' : hash}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', color: copied ? '#16a34a' : '#9ca3af', fontSize: 11, borderRadius: 3 }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  );
}

// ── PayInfoForm ───────────────────────────────────────────────────────────────

function PayInfoForm({ platform, platformLabel, info, walletClient, onDone }: {
  platform: Hex; platformLabel: string; info: PayInfo;
  walletClient: WalletClient | undefined; onDone: () => void;
}) {
  const [open, setOpen]           = useState(false);
  const [name, setName]           = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<'ok' | string | null>(null);

  const submit = async () => {
    if (!walletClient || !name.trim() || !accountId.trim()) return;
    setLoading(true); setResult(null);
    try {
      const nameHash = keccak256(stringToBytes(name.trim())) as Hex;
      const idHash   = keccak256(stringToBytes(accountId.trim())) as Hex;
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI,
        functionName: 'setMerchantPaymentInfoForPlatform',
        args: [platform, nameHash, idHash],
        account: walletClient.account!,
      });
      await walletClient.writeContract(request);
      setResult('ok'); setName(''); setAccountId(''); setOpen(false);
      setTimeout(onDone, 600);
    } catch (e: any) {
      setResult(e?.shortMessage ?? e?.message ?? 'Transaction failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 72 }}>{platformLabel}</span>
        <Badge v={info.isSet ? 'success' : 'neutral'} text={info.isSet ? 'Set' : 'Not set'} />
        {result === 'ok' && <Badge v="success" text="Saved" />}
        {walletClient && (
          <button style={btnStyle('ghost', { padding: '3px 10px', fontSize: 11 })} onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : info.isSet ? 'Update' : 'Set'}
          </button>
        )}
      </div>
      {info.isSet && !open && (
        <div style={{ marginTop: 6, marginLeft: 82, background: '#f9fafb', borderRadius: 6, padding: '8px 12px', border: '1px solid #f0f0f0' }}>
          <HashRow label="Name Hash" hash={info.nameHash} />
          <HashRow label="ID Hash"   hash={info.idHash} />
        </div>
      )}
      {open && (
        <div style={{ marginTop: 10, background: '#f9fafb', borderRadius: 8, padding: 14, border: '1px solid #e5e7eb' }}>
          <div style={GRID2}>
            <div>
              <label style={FORM_LABEL}>Real Name *</label>
              <input style={INPUT_STYLE} value={name} placeholder={`${platformLabel} account name`} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label style={FORM_LABEL}>Account ID / Email *</label>
              <input style={INPUT_STYLE} value={accountId} placeholder={`${platformLabel} ID or email`} onChange={(e) => setAccountId(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={btnStyle('primary')} onClick={submit} disabled={loading || !name.trim() || !accountId.trim()}>
              {loading ? 'Submitting…' : `${info.isSet ? 'Update' : 'Save'} ${platformLabel} Info`}
            </button>
            {result && result !== 'ok' && <span style={{ fontSize: 12, color: '#dc2626' }}>{result}</span>}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, marginBottom: 0 }}>
            Name and ID are hashed (keccak256) before being stored on-chain.
          </p>
        </div>
      )}
    </div>
  );
}

// ── RateEdit — Fix #5: No Expiry checkbox ─────────────────────────────────────

function RateEdit({ product, walletClient, onDone }: {
  product: Product; walletClient: WalletClient | undefined; onDone: () => void;
}) {
  const [open, setOpen]               = useState(false);
  const [rateInput, setRateInput]     = useState('');
  const [expiresInput, setExpiresInput] = useState('');
  const [noExpiry, setNoExpiry]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState<string | null>(null);

  const displayRate = (Number(product.rate) / 1e8).toFixed(4);

  const submit = async () => {
    if (!walletClient || !rateInput || (!noExpiry && !expiresInput)) return;
    setLoading(true); setErr(null);
    try {
      const rate = BigInt(Math.round(parseFloat(rateInput) * 1e8));
      const expiresAt = noExpiry
        ? 0n
        : BigInt(Math.floor(new Date(expiresInput).getTime() / 1000));
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI,
        functionName: 'publishRate',
        args: [product.productId, product.assetType, rate, expiresAt],
        account: walletClient.account!,
      });
      await walletClient.writeContract(request);
      setOpen(false);
      setTimeout(onDone, 500);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={MONO}>{displayRate}</span>
        {product.version > 0 && <span style={{ fontSize: 11, color: '#9ca3af' }}>v{product.version}</span>}
        {walletClient && (
          <button style={btnStyle('ghost', { padding: '2px 8px', fontSize: 11 })} onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 6, padding: 10, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
          <input
            style={{ ...INPUT_STYLE, marginBottom: 6 }}
            type="number" step="0.0001"
            placeholder={`Rate (current: ${displayRate})`}
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} />
            No Expiry
          </label>
          {!noExpiry && (
            <>
              <label style={{ ...FORM_LABEL, marginBottom: 4 }}>Expires At</label>
              <input
                style={{ ...INPUT_STYLE, marginBottom: 8 }}
                type="datetime-local"
                value={expiresInput}
                onChange={(e) => setExpiresInput(e.target.value)}
              />
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              style={btnStyle('primary', { padding: '5px 12px' })}
              onClick={submit}
              disabled={loading || !rateInput || (!noExpiry && !expiresInput)}
            >
              {loading ? '…' : 'Save Rate'}
            </button>
            {err && <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── OpenToggle — Fix #3: clearManualOverride button ───────────────────────────

function OpenToggle({ product, walletClient, onDone }: {
  product: Product; walletClient: WalletClient | undefined; onDone: () => void;
}) {
  const [loading, setLoading]       = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  const toggle = async () => {
    if (!walletClient) return;
    setLoading(true); setErr(null);
    try {
      const fn = product.isOpen ? 'closeNow' : 'openNow';
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI,
        functionName: fn,
        args: [product.productId, product.assetType],
        account: walletClient.account!,
      });
      await walletClient.writeContract(request);
      setTimeout(onDone, 500);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  const clearOverride = async () => {
    if (!walletClient) return;
    setClearLoading(true); setErr(null);
    try {
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI,
        functionName: 'clearManualOverride',
        args: [product.productId, product.assetType],
        account: walletClient.account!,
      });
      await walletClient.writeContract(request);
      setTimeout(onDone, 500);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setClearLoading(false); }
  };

  const hasOverride = product.bh.manualOverride !== 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Badge v={product.isOpen ? 'success' : 'neutral'} text={product.isOpen ? 'Open' : 'Closed'} />
        {walletClient && (
          <>
            <button
              style={btnStyle(product.isOpen ? 'danger' : 'primary', { padding: '3px 10px', fontSize: 11 })}
              onClick={toggle} disabled={loading}
            >
              {loading ? '…' : product.isOpen ? 'Force Close' : 'Force Open'}
            </button>
            {hasOverride && (
              <button
                style={btnStyle('secondary', { padding: '3px 10px', fontSize: 11 })}
                onClick={clearOverride} disabled={clearLoading}
                title="Resume schedule-based open/close"
              >
                {clearLoading ? '…' : 'Reset to Schedule'}
              </button>
            )}
          </>
        )}
      </div>
      {err && <span style={{ fontSize: 11, color: '#dc2626', display: 'block', marginTop: 3 }}>{err}</span>}
    </div>
  );
}

// ── BusinessHoursPanel — Fix #3 ───────────────────────────────────────────────

function BusinessHoursPanel({ product, walletClient, onDone }: {
  product: Product; walletClient: WalletClient | undefined; onDone: () => void;
}) {
  const bh = product.bh;
  const hasSchedule = bh.activeDays > 0 || bh.openSecond > 0;

  const [open, setOpen]         = useState(false);
  const [openTime, setOpenTime]   = useState('09:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [activeDays, setActiveDays] = useState(0b0111110); // Mon–Fri default
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const handleOpen = () => {
    if (!open && hasSchedule) {
      setOpenTime(secondsToTime(bh.openSecond));
      setCloseTime(secondsToTime(bh.closeSecond));
      setActiveDays(bh.activeDays || 0b0111110);
    }
    setOpen((o) => !o);
  };

  const handleSet = async () => {
    if (!walletClient) return;
    setLoading(true); setErr(null);
    try {
      const openSec  = timeToSeconds(openTime);
      const closeSec = timeToSeconds(closeTime);
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI,
        functionName: 'setBusinessHours',
        args: [product.productId, product.assetType, openSec, closeSec, activeDays],
        account: walletClient.account!,
      });
      await walletClient.writeContract(request);
      setOpen(false);
      setTimeout(onDone, 500);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  const toggleDay = (bit: number) => setActiveDays((d) => d ^ (1 << bit));

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {hasSchedule ? (
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {secondsToTime(bh.openSecond)}–{secondsToTime(bh.closeSecond)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>No schedule</span>
        )}
        {walletClient && (
          <button style={btnStyle('ghost', { padding: '2px 8px', fontSize: 11 })} onClick={handleOpen}>
            {open ? 'Cancel' : 'Edit Schedule'}
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 8, padding: 12, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
          <div style={GRID2}>
            <div>
              <label style={FORM_LABEL}>Open Time</label>
              <input style={INPUT_STYLE} type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </div>
            <div>
              <label style={FORM_LABEL}>Close Time</label>
              <input style={INPUT_STYLE} type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={FORM_LABEL}>Active Days</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DAY_LABELS.map((day, i) => (
                <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', color: '#374151' }}>
                  <input type="checkbox" checked={!!(activeDays & (1 << i))} onChange={() => toggleDay(i)} />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <button style={btnStyle('primary', { padding: '5px 12px' })} onClick={handleSet} disabled={loading}>
              {loading ? '…' : 'Save Schedule'}
            </button>
            {err && <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CollateralPanel — Fix #4 ──────────────────────────────────────────────────

function CollateralPanel({ product, cryptos, decimals, walletClient, onDone }: {
  product: Product; cryptos: CryptoAsset[]; decimals: number;
  walletClient: WalletClient | undefined; onDone: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState<'withdraw' | 'add'>('withdraw');
  const [amount, setAmount]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const displayCollateral = parseFloat(formatUnits(product.collateralAmount, decimals)).toFixed(2);

  const handleWithdraw = async () => {
    if (!walletClient || !amount) return;
    setLoading(true); setErr(null);
    try {
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.escrowAddress, abi: C2C_ESCROW_ABI,
        functionName: 'takeAmount',
        args: [product.productId, product.assetType, parseUnits(amount, decimals)],
        account: walletClient.account!,
      });
      await walletClient.writeContract(request);
      setOpen(false); setAmount('');
      setTimeout(onDone, 500);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!walletClient || !amount) return;
    setLoading(true); setErr(null);
    try {
      const cryptoAsset = cryptos.find((c) => String(c.id) === String(product.cryptoID));
      const tokenAddr   = cryptoAsset?.tokenAddress ?? c2cConfig.usdtAddress;
      const amt         = parseUnits(amount, decimals);

      const { request: approveReq } = await publicClient.simulateContract({
        address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
        args: [c2cConfig.escrowAddress, amt], account: walletClient.account!,
      });
      await walletClient.writeContract(approveReq);

      const { request: addReq } = await publicClient.simulateContract({
        address: c2cConfig.escrowAddress, abi: C2C_ESCROW_ABI,
        functionName: 'addAmount',
        args: [product.productId, product.assetType, amt],
        account: walletClient.account!,
      });
      await walletClient.writeContract(addReq);
      setOpen(false); setAmount('');
      setTimeout(onDone, 500);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={MONO}>{displayCollateral}</span>
        {walletClient && (
          <button style={btnStyle('ghost', { padding: '2px 8px', fontSize: 11 })} onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Manage'}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 6, padding: 10, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['withdraw', 'add'] as const).map((t) => (
              <button key={t} style={btnStyle(tab === t ? 'primary' : 'ghost', { padding: '3px 10px', fontSize: 11 })} onClick={() => setTab(t)}>
                {t === 'withdraw' ? 'Withdraw' : 'Add'}
              </button>
            ))}
          </div>
          <input
            style={{ ...INPUT_STYLE, marginBottom: 8 }}
            type="number" min="0" step="0.01"
            placeholder={`Amount (tokens, ${decimals} decimals)`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              style={btnStyle(tab === 'withdraw' ? 'danger' : 'primary', { padding: '5px 12px' })}
              onClick={tab === 'withdraw' ? handleWithdraw : handleAdd}
              disabled={loading || !amount}
            >
              {loading ? '…' : tab === 'withdraw' ? 'Withdraw' : 'Add Collateral'}
            </button>
            {err && <span style={{ fontSize: 11, color: '#dc2626' }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProductRow (sub-component to allow per-row state) ─────────────────────────

function ProductRow({ p, cryptoMap, fiatMap, now, cryptos, walletClient, onRefresh }: {
  p: Product;
  cryptoMap: Map<string, string>;
  fiatMap:   Map<string, string>;
  now: bigint;
  cryptos: CryptoAsset[];
  walletClient: WalletClient | undefined;
  onRefresh: () => void;
}) {
  const isNeverExpiry  = p.expiresAt === 0n;
  const expired        = !isNeverExpiry && p.expiresAt < now;
  const expStr         = new Date(Number(p.expiresAt) * 1000).toLocaleString();
  const tokenDecimals  = cryptos.find((c) => String(c.id) === String(p.cryptoID))?.decimals ?? 18;

  const TD: React.CSSProperties = {
    padding: '10px 10px', verticalAlign: 'top' as const,
    borderBottom: '1px solid #f9fafb', fontSize: 13,
  };

  return (
    <tr style={{ background: '#fff' }}>
      <td style={TD}>
        <span style={{ ...MONO, fontWeight: 600, fontSize: 12 }}>
          P{String(p.productId)}-{p.assetType === 0 ? 'CRYPTO' : 'FIAT'}
        </span>
      </td>
      {/* Fix #6: Type + Platform combined */}
      <td style={TD}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Badge v="info" text={p.assetType === 0 ? 'Sell Crypto' : 'Buy Crypto'} />
          <Badge v={resolvePlatformVariant(p.platformId)} text={resolvePlatformLabel(p.platformId)} />
        </div>
      </td>
      <td style={TD}>
        <span style={{ fontWeight: 600 }}>{cryptoMap.get(String(p.cryptoID)) ?? `id=${p.cryptoID}`}</span>
      </td>
      <td style={TD}>
        {fiatMap.get(String(p.fiatID)) ?? `id=${p.fiatID}`}
      </td>
      {/* Fix #4: Collateral with manage panel */}
      <td style={TD}>
        <CollateralPanel product={p} cryptos={cryptos} decimals={tokenDecimals} walletClient={walletClient} onDone={onRefresh} />
      </td>
      {/* Fix #5: Rate with no-expiry */}
      <td style={TD}>
        <RateEdit product={p} walletClient={walletClient} onDone={onRefresh} />
      </td>
      {/* Fix #5: "Never" for expiresAt=0 */}
      <td style={TD}>
        {isNeverExpiry ? (
          <Badge v="success" text="Never" />
        ) : expired ? (
          <Badge v="danger" text="Expired" />
        ) : (
          <span style={{ fontSize: 12, color: '#6b7280' }}>{expStr}</span>
        )}
      </td>
      {/* Fix #3: Status + schedule + reset-to-schedule */}
      <td style={TD}>
        <OpenToggle product={p} walletClient={walletClient} onDone={onRefresh} />
        <BusinessHoursPanel product={p} walletClient={walletClient} onDone={onRefresh} />
      </td>
    </tr>
  );
}

// ── ProductTable ──────────────────────────────────────────────────────────────

function ProductTable({ products, cryptos, fiats, walletClient, onRefresh }: {
  products: Product[];
  cryptos: CryptoAsset[];
  fiats: FiatAsset[];
  walletClient: WalletClient | undefined;
  onRefresh: () => void;
}) {
  const cryptoMap = new Map(cryptos.map((c) => [String(c.id), c.symbol]));
  const fiatMap   = new Map(fiats.map((f)  => [String(f.id), f.name]));
  const now       = BigInt(Math.floor(Date.now() / 1000));

  if (products.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 13,
        background: '#fafafa', borderRadius: 8, border: '1px dashed #e5e7eb',
      }}>
        No products listed yet.
      </div>
    );
  }

  const TH: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700,
    color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
    borderBottom: '2px solid #f3f4f6', whiteSpace: 'nowrap' as const,
    background: '#fafafa',
  };

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #f3f4f6' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={TH}>Product</th>
            <th style={TH}>Type / Platform</th>
            <th style={TH}>Crypto</th>
            <th style={TH}>Fiat</th>
            <th style={TH}>Collateral</th>
            <th style={TH}>Rate</th>
            <th style={TH}>Expires</th>
            <th style={TH}>Status &amp; Schedule</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <ProductRow
              key={`${p.productId}-${p.assetType}`}
              p={p}
              cryptoMap={cryptoMap}
              fiatMap={fiatMap}
              now={now}
              cryptos={cryptos}
              walletClient={walletClient}
              onRefresh={onRefresh}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── NewProductForm ────────────────────────────────────────────────────────────

function NewProductForm({ walletClient, cryptos, fiats, onDone }: {
  walletClient: WalletClient | undefined; cryptos: CryptoAsset[]; fiats: FiatAsset[]; onDone: () => void;
}) {
  const [open, setOpen]             = useState(false);
  const [direction, setDirection]   = useState<'crypto' | 'fiat'>('crypto');
  const [cryptoId, setCryptoId]     = useState('');
  const [fiatId, setFiatId]         = useState('');
  const [platform, setPlatform]     = useState<Hex>(PLATFORM_WISE);
  const [collateral, setCollateral] = useState('');
  const [isActive, setIsActive]     = useState(true);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  const activeCryptos = cryptos.filter((c) => c.isActive);
  const activeFiats   = fiats.filter((f)   => f.isActive);

  const submit = async () => {
    if (!walletClient || !cryptoId || !fiatId || !collateral) return;
    setLoading(true); setErr(null);
    try {
      const cid         = BigInt(cryptoId);
      const fid         = BigInt(fiatId);
      const cryptoAsset = cryptos.find((c) => String(c.id) === cryptoId);
      const tokenAddr   = cryptoAsset?.tokenAddress ?? c2cConfig.usdtAddress;
      const amount      = parseUnits(collateral, cryptoAsset?.decimals ?? 18);

      const { request: approveReq } = await publicClient.simulateContract({
        address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
        args: [c2cConfig.escrowAddress, amount], account: walletClient.account!,
      });
      await walletClient.writeContract(approveReq);

      const fnName = direction === 'crypto' ? 'listCryptoProduct' : 'listFiatProduct';
      const args: [bigint, bigint, bigint, boolean, Hex] = direction === 'crypto'
        ? [cid, fid, amount, isActive, platform]
        : [fid, cid, amount, isActive, platform];

      const { request: listReq } = await publicClient.simulateContract({
        address: c2cConfig.escrowAddress, abi: C2C_ESCROW_ABI, functionName: fnName,
        args, account: walletClient.account!,
      });
      await walletClient.writeContract(listReq);

      setOpen(false); setCryptoId(''); setFiatId(''); setCollateral('');
      setTimeout(onDone, 600);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Transaction failed');
    } finally { setLoading(false); }
  };

  if (!walletClient) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      {!open ? (
        <button style={btnStyle('primary')} onClick={() => setOpen(true)}>+ List New Product</button>
      ) : (
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#111827' }}>List New Product</div>
          <div style={{ marginBottom: 14 }}>
            <label style={FORM_LABEL}>Direction</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['crypto', 'fiat'] as const).map((d) => (
                <button key={d} style={btnStyle(direction === d ? 'primary' : 'ghost')} onClick={() => setDirection(d)}>
                  {d === 'crypto' ? 'Sell Crypto (receive fiat)' : 'Buy Crypto (pay fiat)'}
                </button>
              ))}
            </div>
          </div>
          <div style={GRID2}>
            <div>
              <label style={FORM_LABEL}>Crypto Asset *</label>
              <select style={INPUT_STYLE} value={cryptoId} onChange={(e) => setCryptoId(e.target.value)}>
                <option value="">— select —</option>
                {activeCryptos.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.symbol} (id={String(c.id)})</option>)}
              </select>
            </div>
            <div>
              <label style={FORM_LABEL}>Fiat Asset *</label>
              <select style={INPUT_STYLE} value={fiatId} onChange={(e) => setFiatId(e.target.value)}>
                <option value="">— select —</option>
                {activeFiats.map((f) => <option key={String(f.id)} value={String(f.id)}>{f.name} (id={String(f.id)})</option>)}
              </select>
            </div>
            <div>
              <label style={FORM_LABEL}>Payment Platform *</label>
              <select style={INPUT_STYLE} value={platform} onChange={(e) => setPlatform(e.target.value as Hex)}>
                {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={FORM_LABEL}>Collateral Amount *</label>
              <input
                style={INPUT_STYLE} type="number" min="0" step="0.01" placeholder="e.g. 1000"
                value={collateral} onChange={(e) => setCollateral(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input id="prod-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <label htmlFor="prod-active" style={{ fontSize: 12, color: '#374151' }}>Activate immediately</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button style={btnStyle('primary')} onClick={submit} disabled={loading || !cryptoId || !fiatId || !collateral}>
              {loading ? 'Submitting…' : 'List Product'}
            </button>
            <button style={btnStyle('ghost')} onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
            {err && <span style={{ fontSize: 12, color: '#dc2626' }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FiatPendingOrders ─────────────────────────────────────────────────────────

interface FiatOrderItem {
  orderId: bigint;
  productId: bigint;
  buyer: Hex;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
  platformId: Hex;
}

const STATUS_LABELS: Record<number, string> = { 0: 'PENDING', 4: 'WAITING' };

function FiatPendingOrders({ address, products, walletClient }: {
  address: Hex;
  products: Product[];
  walletClient: WalletClient | undefined;
}) {
  const [orders, setOrders]       = useState<FiatOrderItem[]>([]);
  const [loading, setLoading]     = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [logs, setLogs]           = useState<Record<string, string[]>>({});

  const fiatProducts = useMemo(() => products.filter((p) => p.assetType === 1), [products]);

  const addLog = (key: string, msg: string) =>
    setLogs((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg] }));

  const loadOrders = useCallback(async () => {
    if (!isC2CConfigured() || fiatProducts.length === 0) { setOrders([]); return; }
    setLoading(true);
    try {
      const placedLogs = await publicClient.getLogs({
        address: c2cConfig.escrowAddress,
        event: ORDER_PLACED_ABI,
        args: { merchant: address } as any,
        fromBlock: 0n,
      });

      const pending: FiatOrderItem[] = [];
      for (const pl of placedLogs) {
        const a = pl.args as any;
        if (Number(a.assetType) !== 1) continue;
        const productId = a.productId as bigint;
        const orderId   = a.orderId   as bigint;
        const product   = fiatProducts.find((p) => p.productId === productId);
        if (!product) continue;
        try {
          const order = await publicClient.readContract({
            address: c2cConfig.escrowAddress,
            abi: C2C_ESCROW_ABI,
            functionName: 'getOrder',
            args: [address, productId, 1, orderId],
          }) as any;
          const status = Number(order.status ?? order[4] ?? 99);
          if (status !== 0 && status !== 4) continue;
          pending.push({
            orderId,
            productId,
            buyer:       (order.buyer      ?? order[0]) as Hex,
            amount:      (order.amount     ?? order[1]) as bigint,
            rate:        (order.rate       ?? order[2]) as bigint,
            deadline:    (order.deadline   ?? order[3]) as bigint,
            status,
            rateVersion: Number(order.rateVersion ?? order[5] ?? 0),
            platformId:  product.platformId,
          });
        } catch { /* order may not exist yet */ }
      }
      setOrders(pending);
    } finally {
      setLoading(false);
    }
  }, [address, fiatProducts]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function handleSubmitProof(o: FiatOrderItem) {
    if (!walletClient) return;
    const key = `${o.productId}-${o.orderId}`;
    setRunningId(key);
    setLogs((p) => ({ ...p, [key]: [] }));
    try {
      addLog(key, 'Building binding context…');
      const isWise = o.platformId === PLATFORM_WISE;
      const ctx = isWise
        ? await makeWiseFiatBindingContext(address, o.buyer, o.amount, o.orderId)
        : await makeAlipayFiatBindingContext(address, o.buyer, o.amount, o.orderId);
      addLog(key, `rateVersion=${ctx.rateVersion}  rate=${ctx.rate}`);
      addLog(key, 'Launching TLSN plugin…');

      let txHash: Hex;
      if (isWise) {
        const { contacts, transfer } = await generateWiseFiatProof(ctx);
        addLog(key, 'Proofs generated, submitting…');
        txHash = await submitWiseFiatProof(walletClient, o.orderId, contacts, transfer);
      } else {
        const proof = await generateAlipayFiatProof(ctx);
        addLog(key, 'Proof generated, submitting…');
        txHash = await submitAlipayFiatProof(walletClient, o.orderId, proof);
      }
      addLog(key, `✅ Done — tx=${txHash}`);
      setTimeout(loadOrders, 800);
    } catch (e: any) {
      addLog(key, `❌ ${e?.shortMessage ?? e?.message ?? String(e)}`);
    } finally {
      setRunningId(null);
    }
  }

  if (fiatProducts.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionHdr>
        FIAT Pending Orders
        <button
          style={btnStyle('ghost', { padding: '2px 8px', fontSize: 10, marginLeft: 8 })}
          onClick={loadOrders}
          disabled={loading}
        >
          {loading ? '…' : '↻'}
        </button>
      </SectionHdr>

      {loading && <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p>}

      {!loading && orders.length === 0 && (
        <div style={{ padding: '14px 0', fontSize: 12, color: '#9ca3af' }}>
          No pending FIAT orders.
        </div>
      )}

      {orders.map((o) => {
        const key      = `${o.productId}-${o.orderId}`;
        const isRunning = runningId === key;
        const orderLogs = logs[key] ?? [];
        const dl = new Date(Number(o.deadline) * 1000).toLocaleString();
        const isWise = o.platformId === PLATFORM_WISE;

        return (
          <div key={key} style={{
            background: '#fafafa', borderRadius: 8, padding: '12px 14px',
            border: '1px solid #e5e7eb', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>
                  {isWise ? 'Wise' : 'Alipay'}-FIAT
                </span>
                {' '}
                <span style={{ ...MONO, fontSize: 11, color: '#6b7280' }}>
                  P{String(o.productId)} / Ord#{String(o.orderId)}
                </span>
                <Badge v={o.status === 0 ? 'warning' : 'info'} text={STATUS_LABELS[o.status] ?? String(o.status)} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  Buyer: <span style={MONO}>{o.buyer.slice(0, 12)}…</span>
                  {' · '}
                  Amount: <strong>{parseFloat(formatUnits(o.amount, 18)).toFixed(4)} USDT</strong>
                  {' · '}
                  Rate v{o.rateVersion}: {(Number(o.rate) / 1e8).toFixed(4)}
                  {' · '}
                  Deadline: {dl}
                </div>
              </div>
              {walletClient && (
                <button
                  style={btnStyle('primary', { fontSize: 11, padding: '4px 12px' })}
                  onClick={() => handleSubmitProof(o)}
                  disabled={isRunning}
                >
                  {isRunning ? 'Running…' : 'Submit FIAT Proof'}
                </button>
              )}
            </div>
            {orderLogs.length > 0 && (
              <div style={{
                marginTop: 8, background: '#1a1a2e', borderRadius: 6, padding: '8px 10px',
                fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
              }}>
                {orderLogs.map((l, i) => (
                  <div key={i} style={{ color: l.startsWith('❌') ? '#ff6b6b' : l.startsWith('✅') ? '#69db7c' : '#c8d6e5' }}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── MerchantTab ───────────────────────────────────────────────────────────────

function MerchantTab({ address, cryptos, fiats }: {
  address: Hex; cryptos: CryptoAsset[]; fiats: FiatAsset[];
}) {
  const [data, setData]       = useState<MerchantData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const wc = walletByAddr.get(address.toLowerCase());

  const reload = useCallback(async () => {
    if (!isC2CConfigured()) return;
    setLoading(true); setErr(null);
    try {
      setData(await loadMerchantData(address));
    } catch (e: any) {
      console.error('[MerchantTab]', e);
      setErr(e?.shortMessage ?? e?.message ?? 'Load failed');
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => { reload(); }, [reload]);

  if (!isC2CConfigured()) return <p style={{ color: '#9ca3af', fontSize: 14 }}>Deploy contracts first.</p>;
  if (!data && loading) return <p style={{ color: '#9ca3af', fontSize: 14 }}>Loading…</p>;
  if (err)   return <p style={{ color: '#dc2626', fontSize: 13 }}>{err}</p>;
  if (!data) return null;

  const regDate = new Date(Number(data.registeredAt) * 1000).toLocaleDateString();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={btnStyle('ghost')} onClick={reload} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
      </div>

      {/* ── Identity ── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHdr>Identity</SectionHdr>
        <div style={GRID3}>
          <InfoCell label="Address"><CopyAddr address={address} /></InfoCell>
          <InfoCell label="Status">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Fix #2: isActive decoded correctly; tooltip explains meaning */}
              <span title="Whether this merchant is registered and active on the platform">
                <Badge v={data.isActive ? 'success' : 'danger'} text={data.isActive ? 'Active' : 'Inactive'} />
              </span>
              {data.kybVerified && <Badge v="info" text="KYB Verified" />}
              {!data.isActive && (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  (admin must activate)
                </span>
              )}
            </div>
          </InfoCell>
          <InfoCell label="Registered">
            <span style={{ fontSize: 13, color: '#374151' }}>{regDate}</span>
          </InfoCell>
        </div>
      </div>

      {/* ── Balances — Fix #1: USDC uses decimals=6 ── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHdr>Balances</SectionHdr>
        <div style={GRID4}>
          <BalCard label="ETH"  amount={data.eth}  symbol="ETH"  />
          <BalCard label="USDT" amount={data.usdt} symbol="USDT" />
          <BalCard label="USDC" amount={data.usdc} symbol="USDC" decimals={6} />
          <BalCard label="DAI"  amount={data.dai}  symbol="DAI"  />
        </div>
      </div>

      {/* ── Payment Info ── */}
      <div style={{ marginBottom: 20 }}>
        <SectionHdr>Payment Info</SectionHdr>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px', border: '1px solid #f3f4f6' }}>
          <PayInfoForm platform={PLATFORM_WISE}   platformLabel="Wise"   info={data.wise}   walletClient={wc} onDone={reload} />
          <div style={{ borderTop: '1px solid #f0f0f0', margin: '10px 0' }} />
          <PayInfoForm platform={PLATFORM_ALIPAY} platformLabel="Alipay" info={data.alipay} walletClient={wc} onDone={reload} />
        </div>
        {!wc && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Read-only — this address is not a known test account.</p>}
      </div>

      {/* ── FIAT Pending Orders ── */}
      <FiatPendingOrders address={address} products={data.products} walletClient={wc} />

      {/* ── Products ── */}
      <div>
        <SectionHdr>Products</SectionHdr>
        <NewProductForm walletClient={wc} cryptos={cryptos} fiats={fiats} onDone={reload} />
        <ProductTable products={data.products} cryptos={cryptos} fiats={fiats} walletClient={wc} onRefresh={reload} />
      </div>
    </div>
  );
}

// ── MerchantPanel (root) ──────────────────────────────────────────────────────

export function MerchantPanel() {
  const [merchants, setMerchants]     = useState<Hex[]>([]);
  const [tab, setTab]                 = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [cryptos, setCryptos]         = useState<CryptoAsset[]>([]);
  const [fiats, setFiats]             = useState<FiatAsset[]>([]);

  const loadAll = useCallback(async () => {
    if (!isC2CConfigured()) return;
    setListLoading(true);
    try {
      const [addrs, lists] = await Promise.all([
        loadMerchantList(),
        loadSupportLists().catch(() => ({ cryptos: [], fiats: [] })),
      ]);
      setMerchants(addrs);
      setCryptos(lists.cryptos);
      setFiats(lists.fiats);
      setTab((t) => Math.min(t, Math.max(0, addrs.length - 1)));
    } catch (e) {
      console.error('[MerchantPanel]', e);
    } finally { setListLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Merchant Panel</h2>
        <button style={btnStyle('ghost')} onClick={loadAll} disabled={listLoading}>
          {listLoading ? '…' : 'Reload List'}
        </button>
      </div>

      {!isC2CConfigured() && <p style={{ color: '#9ca3af', fontSize: 14 }}>Deploy contracts first.</p>}

      {isC2CConfigured() && merchants.length === 0 && !listLoading && (
        <div style={{ textAlign: 'center', padding: '36px 0', color: '#9ca3af', background: '#fafafa', borderRadius: 8, border: '1px dashed #e5e7eb' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No registered merchants found.</div>
          <div style={{ fontSize: 12 }}>Register merchants via the Admin Panel first.</div>
        </div>
      )}

      {merchants.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid #f0f0f0', paddingBottom: 0, marginBottom: 20 }}>
            {merchants.map((addr, i) => (
              <button
                key={addr} title={addr}
                style={{
                  padding: '6px 14px', border: 'none', borderRadius: '6px 6px 0 0',
                  cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'monospace',
                  background: tab === i ? '#2563eb' : '#f5f5f5',
                  color:      tab === i ? '#fff'    : '#374151',
                }}
                onClick={() => setTab(i)}
              >
                {addr.slice(0, 6)}…{addr.slice(-4)}
              </button>
            ))}
          </div>
          {merchants[tab] && (
            <MerchantTab key={merchants[tab]} address={merchants[tab]} cryptos={cryptos} fiats={fiats} />
          )}
        </>
      )}
    </div>
  );
}
