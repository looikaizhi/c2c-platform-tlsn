// packages/demo/src/components/UserPanel.tsx
// Shows user tabs with balances (ETH / USDT / USDC / DAI) and active orders.

import { useState, useEffect } from 'react';
import { formatUnits, getAddress } from 'viem';
import type { Hex } from 'viem';
import { publicClient, MERCHANT_ADDRESSES } from '../utils/hardhatAccounts';
import { C2C_ESCROW_ABI, ERC20_ABI } from '../utils/c2cAbi';
import { c2cConfig, isC2CConfigured } from '../utils/c2cContractConfig';

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 24,
};
const TAB_BASE: React.CSSProperties = {
  padding: '0 16px', minHeight: 36, border: 'none',
  borderRadius: '6px 6px 0 0', cursor: 'pointer',
  fontWeight: 600, fontSize: 13, lineHeight: '36px',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: '#767676', marginBottom: 3, fontWeight: 500,
};
const VALUE: React.CSSProperties = {
  fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all',
  fontVariantNumeric: 'tabular-nums',
};
const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 12, marginBottom: 16,
};
const GRID_CELL: React.CSSProperties = {
  background: '#f8f9fa', borderRadius: 8, padding: '10px 12px',
};

// Order status badge colours
const STATUS_STYLE: Record<number, { bg: string; color: string; label: string }> = {
  0: { bg: '#e6f4ff', color: '#1677ff', label: 'PENDING'   },
  1: { bg: '#fff1f0', color: '#ff4d4f', label: 'CANCELLED' },
  2: { bg: '#fff1f0', color: '#ff4d4f', label: 'EXPIRED'   },
  3: { bg: '#f6ffed', color: '#52c41a', label: 'COMPLETED' },
  4: { bg: '#fff7e6', color: '#fa8c16', label: 'WAITING'   },
};

// ── User addresses from deployment env vars (authoritative source) ─────────────
function getUserPanelAddresses(): Hex[] {
  return [
    c2cConfig.user1Address,
    c2cConfig.user2Address,
    c2cConfig.user3Address,
    c2cConfig.user4Address,
    c2cConfig.user5Address,
  ].filter((a) => a.length > 2) as Hex[];
}

// ── Formatting helper ─────────────────────────────────────────────────────────
/** Format a token balance to exactly 4 decimal places using the token's real decimals. */
function fmt4(balance: bigint, decimals: number): string {
  return parseFloat(formatUnits(balance, decimals)).toFixed(4);
}

// ── Data types ────────────────────────────────────────────────────────────────
interface ActiveOrder {
  merchantAddress: Hex;
  productId: bigint;
  assetType: 0 | 1;
  orderId: bigint;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
}

interface UserData {
  eth: bigint;
  usdtBal: bigint;
  usdcBal: bigint;
  daiBal: bigint;
  usdtDecimals: number;
  usdcDecimals: number;
  daiDecimals: number;
  activeOrders: ActiveOrder[];
}

// ── Data loader ───────────────────────────────────────────────────────────────
async function loadUser(userAddress: Hex): Promise<UserData> {
  const checkedAddress = getAddress(userAddress);

  const fetchBalance = (tokenAddr: Hex) =>
    tokenAddr.length > 2
      ? publicClient.readContract({
          address: tokenAddr, abi: ERC20_ABI,
          functionName: 'balanceOf', args: [checkedAddress],
        }).catch(() => 0n)
      : Promise.resolve(0n);

  const fetchDecimals = (tokenAddr: Hex): Promise<number> =>
    tokenAddr.length > 2
      ? publicClient.readContract({
          address: tokenAddr, abi: ERC20_ABI,
          functionName: 'decimals',
        }).then(Number).catch(() => 18)
      : Promise.resolve(18);

  const [eth, usdtBal, usdcBal, daiBal, usdtDecimals, usdcDecimals, daiDecimals] = await Promise.all([
    publicClient.getBalance({ address: checkedAddress }),
    fetchBalance(c2cConfig.usdtAddress),
    fetchBalance(c2cConfig.usdcAddress),
    fetchBalance(c2cConfig.daiAddress),
    fetchDecimals(c2cConfig.usdtAddress),
    fetchDecimals(c2cConfig.usdcAddress),
    fetchDecimals(c2cConfig.daiAddress),
  ]);

  // Check all (merchant × productId × assetType) combinations for active orders
  const activeOrders: ActiveOrder[] = [];
  const combos: Array<{ merchantAddress: Hex; productId: bigint; assetType: 0 | 1 }> = [];
  for (const m of MERCHANT_ADDRESSES as Hex[]) {
    for (const pid of [0n, 1n]) {
      for (const at of [0, 1] as Array<0 | 1>) {
        combos.push({ merchantAddress: m, productId: pid, assetType: at });
      }
    }
  }

  const hasActive = await Promise.all(
    combos.map(({ merchantAddress, productId, assetType }) =>
      publicClient.readContract({
        address: c2cConfig.escrowAddress, abi: C2C_ESCROW_ABI,
        functionName: 'hasActiveOrder',
        args: [checkedAddress, merchantAddress, assetType, productId],
      }).catch(() => false),
    ),
  );

  for (let i = 0; i < combos.length; i++) {
    if (!hasActive[i]) continue;
    const { merchantAddress, productId, assetType } = combos[i];
    for (let oid = 0n; oid < 20n; oid++) {
      try {
        const order: any = await publicClient.readContract({
          address: c2cConfig.escrowAddress, abi: C2C_ESCROW_ABI,
          functionName: 'getOrder', args: [merchantAddress, productId, assetType, oid],
        });
        if (
          getAddress(order.buyer) === checkedAddress &&
          (Number(order.status) === 0 || Number(order.status) === 4)
        ) {
          activeOrders.push({
            merchantAddress, productId, assetType, orderId: oid,
            amount: order.amount, rate: order.rate,
            deadline: order.deadline, status: Number(order.status),
            rateVersion: Number(order.rateVersion),
          });
          break;
        }
      } catch {
        break;
      }
    }
  }

  return {
    eth: eth as bigint,
    usdtBal: usdtBal as bigint,
    usdcBal: usdcBal as bigint,
    daiBal: daiBal as bigint,
    usdtDecimals,
    usdcDecimals,
    daiDecimals,
    activeOrders,
  };
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
const shimmerKeyframes = `
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}`;

function SkeletonBlock({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div style={{
      width, height,
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
      backgroundSize: '800px 100%',
      animation: 'shimmer 1.4s infinite linear',
      borderRadius: 4,
    }} />
  );
}

function SkeletonTab() {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ width: 72, height: 36, borderRadius: 6, background: '#f0f0f0' }} />
      </div>
      <div style={GRID}>
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} style={GRID_CELL}>
            <SkeletonBlock width={60} height={10} />
            <div style={{ marginTop: 6 }}><SkeletonBlock height={14} /></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        {[1, 2].map((k) => (
          <div key={k} style={{ height: 48, borderRadius: 6, background: '#f0f0f0', marginBottom: 8 }} />
        ))}
      </div>
    </>
  );
}

// ── Copy helper ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy address'}
      title={copied ? 'Copied!' : 'Copy'}
      style={{
        marginLeft: 6, padding: '2px 6px', fontSize: 11,
        border: '1px solid #d9d9d9', borderRadius: 4,
        cursor: 'pointer', background: copied ? '#f6ffed' : '#fff',
        color: copied ? '#52c41a' : '#595959',
        transition: 'all 150ms ease-out',
      }}
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: number }) {
  const style = STATUS_STYLE[status] ?? { bg: '#f5f5f5', color: '#595959', label: String(status) };
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px', borderRadius: 10,
      background: style.bg, color: style.color,
      fontSize: 11, fontWeight: 600, lineHeight: '18px',
    }}>
      {style.label}
    </span>
  );
}

// ── Per-user tab ──────────────────────────────────────────────────────────────
function UserTab({ address }: { address: Hex }) {
  const [data, setData]       = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const checkedAddress = getAddress(address);

  async function reload() {
    if (!isC2CConfigured()) return;
    setLoading(true);
    try {
      setData(await loadUser(address));
    } catch (e) {
      console.error('[UserPanel] load error', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, [address]);

  if (!isC2CConfigured()) {
    return <p style={{ color: '#767676', fontSize: 14 }}>Deploy contracts first.</p>;
  }

  if (loading && !data) return <SkeletonTab />;

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#767676', fontSize: 14 }}>
        <div style={{ marginBottom: 8 }}>No data loaded</div>
        <button
          onClick={reload}
          aria-label="Load user data"
          style={{
            padding: '0 16px', minHeight: 36, borderRadius: 6,
            border: '1px solid #1677ff', cursor: 'pointer',
            background: '#e6f4ff', color: '#1677ff', fontSize: 13, fontWeight: 600,
          }}
        >
          Load
        </button>
      </div>
    );
  }

  const balances = [
    { label: 'ETH',  value: fmt4(data.eth,     18)                  },
    { label: 'USDT', value: fmt4(data.usdtBal, data.usdtDecimals)   },
    { label: 'USDC', value: fmt4(data.usdcBal, data.usdcDecimals)   },
    { label: 'DAI',  value: fmt4(data.daiBal,  data.daiDecimals)    },
  ];

  return (
    <div>
      <style>{shimmerKeyframes}</style>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={reload}
          disabled={loading}
          aria-label="Refresh user data"
          style={{
            padding: '0 16px', minHeight: 36, borderRadius: 6,
            border: '1px solid #d9d9d9', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500,
            background: loading ? '#f5f5f5' : '#fff',
            color: loading ? '#bfbfbf' : '#333',
            opacity: loading ? 0.65 : 1,
            transition: 'all 150ms ease-out',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Address */}
      <div style={{ ...GRID_CELL, marginBottom: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <div style={{ flex: '0 0 auto', ...LABEL, marginBottom: 0, marginRight: 8 }}>Address</div>
        <div style={{ flex: 1, ...VALUE, fontSize: 12 }}>{checkedAddress}</div>
        <CopyButton text={checkedAddress} />
      </div>

      {/* Balances */}
      <div style={GRID}>
        {balances.map(({ label, value }) => (
          <div key={label} style={GRID_CELL}>
            <div style={LABEL}>{label}</div>
            <div style={{ ...VALUE, fontSize: 14, fontWeight: 600, color: '#111' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Active orders */}
      <div>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 8 }}>Active Orders</div>
        {data.activeOrders.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '20px 0',
            color: '#767676', fontSize: 13, background: '#fafafa',
            borderRadius: 8, border: '1px dashed #e8e8e8',
          }}>
            No active orders for this user
          </div>
        ) : data.activeOrders.map((o) => {
          const merchantIdx =
            (MERCHANT_ADDRESSES as string[]).findIndex(
              (m) => m.toLowerCase() === o.merchantAddress.toLowerCase(),
            ) + 1;
          const platform  = o.productId === 0n ? 'Wise' : 'Alipay';
          const direction = o.assetType === 0 ? 'Crypto' : 'Fiat';
          return (
            <div
              key={`${o.merchantAddress}-${o.productId}-${o.assetType}-${o.orderId}`}
              style={{
                background: '#fafafa', borderRadius: 8,
                padding: '10px 14px', marginBottom: 8,
                border: '1px solid #f0f0f0',
                display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                Order #{String(o.orderId)}
              </span>
              <span style={{ fontSize: 12, color: '#595959' }}>
                {platform}-{direction} · M{merchantIdx}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmt4(o.amount, data.usdtDecimals)} USDT
              </span>
              <StatusBadge status={o.status} />
              <span style={{ fontSize: 11, color: '#767676', marginLeft: 'auto' }}>
                Deadline: {new Date(Number(o.deadline) * 1000).toLocaleTimeString()}
                {' · '}RateV: {o.rateVersion}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Panel shell ───────────────────────────────────────────────────────────────
export function UserPanel() {
  const [tab, setTab] = useState(0);
  const addresses = getUserPanelAddresses();

  if (addresses.length === 0) {
    return (
      <div style={CARD}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>User Panel</h2>
        <p style={{ color: '#767676', fontSize: 14 }}>Deploy contracts first to load user addresses.</p>
      </div>
    );
  }

  const activeTab = Math.min(tab, addresses.length - 1);

  return (
    <div style={CARD}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>User Panel</h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {addresses.map((_, i) => (
          <button
            key={i}
            aria-label={`User ${i + 1}`}
            aria-pressed={activeTab === i}
            style={{
              ...TAB_BASE,
              background: activeTab === i ? '#1677ff' : '#f5f5f5',
              color: activeTab === i ? '#fff' : '#333',
              transition: 'background 150ms ease-out, color 150ms ease-out',
            }}
            onClick={() => setTab(i)}
          >
            User {i + 1}
          </button>
        ))}
      </div>

      <UserTab address={addresses[activeTab]} />
    </div>
  );
}
