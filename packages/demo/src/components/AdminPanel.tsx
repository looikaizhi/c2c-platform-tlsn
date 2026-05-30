// packages/demo/src/components/AdminPanel.tsx

import React, { useState, useEffect, useCallback, CSSProperties } from 'react';
import { formatUnits, parseUnits, isAddress, parseAbiItem } from 'viem';
import {
  publicClient,
  adminClient,
  ADMIN_ADDRESS,
  merchant1Client,
  merchant2Client,
  merchant3Client,
  user1Client,
  user2Client,
  user3Client,
  user4Client,
  user5Client,
  verifierSignerClient,
  addresses as c2cConfig,
  isConfigured as isC2CConfigured,
} from '../utils/chain';
import { C2C_ADMIN_ABI, C2C_RISK_MANAGER_ABI } from '../utils/abis';
import { loginAsAdmin, logoutAdmin } from '../utils/proof';
import { truncateAddr } from '../utils/lib';
import { CopyButton } from './ui';
import { ReputationBadge } from './ReputationBadge';
import type { ReputationView } from './ReputationBadge';
import { AdminAudit } from './AdminAudit';

// ────────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────────

const ASSET_TYPE_CRYPTO = 0;
const ASSET_TYPE_FIAT   = 1;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

// Map all known hardhat wallet clients by address for acceptAdmin lookup
const ALL_WALLET_CLIENTS = [
  adminClient, merchant1Client, merchant2Client, merchant3Client,
  user1Client, user2Client, user3Client, user4Client, user5Client,
  verifierSignerClient,
];

function findClientByAddress(addr: string) {
  return ALL_WALLET_CLIENTS.find(
    (c) => c.account?.address.toLowerCase() === addr.toLowerCase(),
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

interface CryptoInfo {
  id: bigint;
  tokenSymbol: string;
  tokenAddress: string;
  assetType: number;
  isActive: boolean;
}
interface FiatInfo {
  id: bigint;
  fiatName: string;
  assetType: number;
  isActive: boolean;
}
interface MerchantEntry {
  address: string;
  isActive: boolean;
  registeredAt: bigint;
  sellCryptoAmount: bigint;
  sellFiatAmount: bigint;
}
type ToastType  = 'success' | 'error' | 'info';
type ModalType  =
  | 'addCrypto'
  | 'addFiat'
  | 'registerMerchant'
  | 'setAuthCaller'
  | 'proposeAdmin'
  | null;

// ────────────────────────────────────────────────────────────────────────────────
// Design tokens
// ────────────────────────────────────────────────────────────────────────────────

const C = {
  primary:   '#2563EB',
  success:   '#16A34A',
  error:     '#DC2626',
  warning:   '#F97316',
  muted:     '#64748B',
  border:    '#E2E8F0',
  bg:        '#F8FAFC',
  text:      '#1E293B',
  textMuted: '#64748B',
} as const;

const S: Record<string, CSSProperties> = {
  panel: {
    background: '#fff',
    borderRadius: 14,
    padding: '20px 24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    position: 'relative',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: '20px 0 8px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: C.text,
    letterSpacing: '0.01em',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    color: C.text,
  },
  th: {
    textAlign: 'left',
    padding: '7px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: C.textMuted,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderBottom: `1px solid ${C.border}`,
    background: C.bg,
  },
  td: {
    padding: '9px 10px',
    borderBottom: `1px solid ${C.border}`,
    fontFamily: '"Fira Code", "Courier New", monospace',
    fontSize: 12,
    color: C.text,
  },
  tdPlain: {
    padding: '9px 10px',
    borderBottom: `1px solid ${C.border}`,
    fontSize: 13,
    color: C.text,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${C.border}`,
    borderRadius: 7,
    padding: '7px 10px',
    fontSize: 13,
    color: C.text,
    outline: 'none',
    fontFamily: 'inherit',
    background: '#fff',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: C.textMuted,
    marginBottom: 4,
  },
  formGroup: {
    marginBottom: 14,
  },
};

// ────────────────────────────────────────────────────────────────────────────────
// SVG icons (inline, no emoji)
// ────────────────────────────────────────────────────────────────────────────────

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconX = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ────────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ────────────────────────────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: active ? '#dcfce7' : '#f1f5f9',
      color: active ? C.success : C.muted,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? C.success : '#94a3b8',
        display: 'inline-block',
      }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Toast
// ────────────────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  const palette = {
    success: { bg: '#f0fdf4', border: '#86efac', color: '#15803d', icon: '✓' },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626', icon: '✗' },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#2563eb', icon: 'i' },
  }[type];

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '11px 14px', borderRadius: 9,
      background: palette.bg, border: `1px solid ${palette.border}`,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      minWidth: 240, maxWidth: 380, fontSize: 13, color: palette.color,
    }}>
      <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1 }}>{palette.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.5 }}>{message}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.color, padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}
      >
        <IconX />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Modal
// ────────────────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: '22px 24px',
        width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 4 }}>
            <IconX />
          </button>
        </div>
        {children}
        {footer && (
          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Btn
// ────────────────────────────────────────────────────────────────────────────────

function Btn({ children, onClick, disabled, variant = 'primary', small = false, danger = false }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  small?: boolean;
  danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const accent = danger ? C.error : C.primary;
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: small ? '4px 10px' : '6px 14px',
    borderRadius: 7, fontSize: small ? 12 : 13, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'background 150ms, border-color 150ms',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };
  const styles: Record<string, CSSProperties> = {
    primary: { ...base, background: hov && !disabled ? (danger ? '#b91c1c' : '#1d4ed8') : accent, color: '#fff',    border: 'none' },
    outline: { ...base, background: hov && !disabled ? `${accent}12` : 'transparent',              color: accent,    border: `1px solid ${accent}` },
    ghost:   { ...base, background: hov && !disabled ? C.bg : 'transparent',                       color: C.muted,   border: '1px solid transparent' },
  };

  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// KpiCard
// ────────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: '12px 14px', minWidth: 0,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.textMuted,
        letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// RiskConfigPanel — read + update C2CRiskManager parameters
// ────────────────────────────────────────────────────────────────────────────────

function RiskConfigPanel() {
  type RiskCfg = {
    min: number; base: number; max: number; step: number;
    reset: number; freezeThr: number; rewardThr: number; freezeDays: number;
  };
  const [cfg, setCfg]           = useState<RiskCfg | null>(null);
  const [loading, setLoading]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ min: '', base: '', max: '', step: '', reset: '', freezeThr: '', rewardThr: '', decayDays: '' });
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [ok, setOk]             = useState(false);

  const load = useCallback(async () => {
    if (!isC2CConfigured()) return;
    if (!c2cConfig.riskManagerAddress || c2cConfig.riskManagerAddress.length <= 2) return;
    setLoading(true);
    try {
      const [min, base, max, step, reset, freezeThr, rewardThr, freezeDays] = await Promise.all([
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'minBondBps'              }).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'baseBondBps'             }).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'maxBondBps'              }).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'stepBps'                 }).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'resetThreshold'          }).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'freezeThreshold'         }).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'rewardCompletedThreshold'}).then((r) => Number(r)).catch(() => 0),
        publicClient.readContract({ address: c2cConfig.riskManagerAddress, abi: C2C_RISK_MANAGER_ABI, functionName: 'decayIntervalDays'       }).then((r) => Number(r)).catch(() => 0),
      ]);
      setCfg({ min, base, max, step, reset, freezeThr, rewardThr, freezeDays });
    } catch { /* not deployed */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openForm() {
    if (!cfg) return;
    setForm({
      min: String(cfg.min), base: String(cfg.base), max: String(cfg.max), step: String(cfg.step),
      reset: String(cfg.reset), freezeThr: String(cfg.freezeThr),
      rewardThr: String(cfg.rewardThr), decayDays: String(cfg.freezeDays),
    });
    setErr(null); setOk(false); setShowForm(true);
  }

  async function save() {
    setSaving(true); setErr(null); setOk(false);
    try {
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.riskManagerAddress,
        abi: C2C_RISK_MANAGER_ABI,
        functionName: 'setRiskConfig',
        args: [
          Number(form.min), Number(form.base), Number(form.max), Number(form.step),
          Number(form.reset), Number(form.freezeThr), Number(form.rewardThr), Number(form.decayDays),
        ],
        account: adminClient.account!,
      });
      await adminClient.writeContract(request);
      setOk(true); setShowForm(false);
      await load();
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setSaving(false); }
  }

  const bpsLabel = (v: number) => `${v} bps (${(v / 100).toFixed(2)}%)`;

  return (
    <div style={{ marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>Risk Manager Config</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {ok && <span style={{ fontSize: 12, color: C.success }}>Saved</span>}
          <Btn small variant="outline" onClick={load} disabled={loading}>{loading ? '…' : <><IconRefresh /> Refresh</>}</Btn>
          {cfg && <Btn small variant="outline" onClick={openForm}>Edit Config</Btn>}
        </div>
      </div>

      {cfg && !showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {[
            { label: 'Min Bond BPS',       value: bpsLabel(cfg.min) },
            { label: 'Base Bond BPS',      value: bpsLabel(cfg.base) },
            { label: 'Max Bond BPS',       value: bpsLabel(cfg.max) },
            { label: 'Step BPS',           value: bpsLabel(cfg.step) },
            { label: 'Reset Threshold',    value: `${cfg.reset} completions` },
            { label: 'Freeze Threshold',   value: `${cfg.freezeThr} consecutive timeouts` },
            { label: 'Reward Threshold',   value: `${cfg.rewardThr} completions` },
            { label: 'Freeze / Decay Days',value: `${cfg.freezeDays} days` },
          ].map(({ label, value }) => (
            <KpiCard key={label} label={label}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{value}</div>
            </KpiCard>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ background: C.bg, borderRadius: 9, padding: 14, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
            {([
              ['Min Bond BPS',     'min'        ],
              ['Base Bond BPS',    'base'       ],
              ['Max Bond BPS',     'max'        ],
              ['Step BPS',         'step'       ],
              ['Reset Threshold',  'reset'      ],
              ['Freeze Threshold', 'freezeThr'  ],
              ['Reward Threshold', 'rewardThr'  ],
              ['Decay Days',       'decayDays'  ],
            ] as [string, keyof typeof form][]).map(([label, key]) => (
              <div key={key} style={S.formGroup}>
                <label style={S.label}>{label}</label>
                <input
                  style={{ ...S.input, padding: '5px 8px', fontSize: 13 }}
                  type="number" min="0" step="1"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Config'}</Btn>
            <Btn variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Btn>
            {err && <span style={{ fontSize: 12, color: C.error }}>{err}</span>}
          </div>
        </div>
      )}

      {!cfg && !loading && (
        <p style={{ fontSize: 13, color: C.textMuted }}>RiskManager not deployed or not configured.</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// UserRiskManager — query reputation, blacklist, manual unfreeze
// ────────────────────────────────────────────────────────────────────────────────

function UserRiskManager() {
  const [addr, setAddr]       = useState('');
  const [rep, setRep]         = useState<ReputationView | null>(null);
  const [querying, setQuerying] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [result, setResult]   = useState<string | null>(null);

  async function handleQuery() {
    if (!isAddress(addr)) { setErr('Invalid address'); return; }
    if (!c2cConfig.riskManagerAddress || c2cConfig.riskManagerAddress.length <= 2) {
      setErr('RiskManager contract not deployed');
      return;
    }
    setQuerying(true); setErr(null); setRep(null); setResult(null);
    try {
      const raw = await publicClient.readContract({
        address: c2cConfig.riskManagerAddress,
        abi: C2C_RISK_MANAGER_ABI,
        functionName: 'getReputation',
        args: [addr as `0x${string}`],
      });
      setRep(raw as ReputationView);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Query failed');
    } finally { setQuerying(false); }
  }

  async function handleBlacklist(blacklist: boolean) {
    if (!isAddress(addr)) return;
    const label = blacklist ? 'blacklist' : 'unblacklist';
    setActionLoading(label); setErr(null); setResult(null);
    try {
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.riskManagerAddress,
        abi: C2C_RISK_MANAGER_ABI,
        functionName: 'setBlacklist',
        args: [addr as `0x${string}`, blacklist],
        account: adminClient.account!,
      });
      await adminClient.writeContract(request);
      setResult(`${blacklist ? 'Blacklisted' : 'Unblacklisted'}: ${addr}`);
      await handleQuery();
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setActionLoading(null); }
  }

  async function handleUnfreeze() {
    if (!isAddress(addr)) return;
    setActionLoading('unfreeze'); setErr(null); setResult(null);
    try {
      const { request } = await publicClient.simulateContract({
        address: c2cConfig.riskManagerAddress,
        abi: C2C_RISK_MANAGER_ABI,
        functionName: 'manualUnfreeze',
        args: [addr as `0x${string}`],
        account: adminClient.account!,
      });
      await adminClient.writeContract(request);
      setResult(`Unfrozen: ${addr}`);
      await handleQuery();
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Failed');
    } finally { setActionLoading(null); }
  }

  return (
    <div style={{ marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: C.text }}>User Reputation Management</h3>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={S.label}>User Address</label>
          <input
            style={S.input}
            placeholder="0x…"
            value={addr}
            onChange={(e) => { setAddr(e.target.value); setRep(null); setResult(null); setErr(null); }}
          />
        </div>
        <Btn onClick={handleQuery} disabled={querying || !addr}>{querying ? 'Querying…' : 'Query Reputation'}</Btn>
      </div>

      {err    && <div style={{ fontSize: 12, color: C.error, marginBottom: 8 }}>{err}</div>}
      {result && <div style={{ fontSize: 12, color: C.success, marginBottom: 8 }}>{result}</div>}

      {rep && (
        <div style={{ marginBottom: 12 }}>
          <ReputationBadge reputation={rep} />
        </div>
      )}

      {rep && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn
            small danger variant="outline"
            disabled={!!actionLoading || rep.blacklisted}
            onClick={() => handleBlacklist(true)}
          >
            {actionLoading === 'blacklist' ? '…' : 'Blacklist'}
          </Btn>
          {rep.blacklisted && (
            <Btn
              small variant="outline"
              disabled={!!actionLoading}
              onClick={() => handleBlacklist(false)}
            >
              {actionLoading === 'unblacklist' ? '…' : 'Remove Blacklist'}
            </Btn>
          )}
          {rep.temporarilyFrozen && (
            <Btn
              small variant="outline"
              disabled={!!actionLoading}
              onClick={handleUnfreeze}
            >
              {actionLoading === 'unfreeze' ? '…' : 'Manual Unfreeze'}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// AdminPanel
// ────────────────────────────────────────────────────────────────────────────────

export function AdminPanel() {
  // ── Read state ───────────────────────────────────────────────────────────────
  const [ethBalance,       setEthBalance]       = useState<bigint | null>(null);
  const [maxOrder,         setMaxOrder]         = useState<bigint | null>(null);
  const [cryptoList,       setCryptoList]       = useState<CryptoInfo[]>([]);
  const [fiatList,         setFiatList]         = useState<FiatInfo[]>([]);
  const [merchantList,     setMerchantList]     = useState<MerchantEntry[]>([]);
  const [contractAdmin,    setContractAdmin]    = useState<string>('');
  const [pendingAdminAddr, setPendingAdminAddr] = useState<string>('');
  const [loading,          setLoading]          = useState(false);

  // ── Toast ────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // ── Confirm dialog ───────────────────────────────────────────────────────────
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // ── Modal ────────────────────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState('');

  // Form fields
  const [cryptoAddrInput,   setCryptoAddrInput]   = useState('');
  const [cryptoActiveInput, setCryptoActiveInput] = useState(true);
  const [fiatNameInput,     setFiatNameInput]     = useState('');
  const [fiatActiveInput,   setFiatActiveInput]   = useState(true);
  const [merchantAddrInput, setMerchantAddrInput] = useState('');
  const [authCallerInput,   setAuthCallerInput]   = useState('');
  const [authCallerGrant,   setAuthCallerGrant]   = useState(true);
  const [proposeAdminInput, setProposeAdminInput] = useState('');

  // ── Inline max order edit ────────────────────────────────────────────────────
  const [editMaxOrder,   setEditMaxOrder]   = useState(false);
  const [maxOrderInput,  setMaxOrderInput]  = useState('');
  const [savingMaxOrder, setSavingMaxOrder] = useState(false);

  // ── Verifier audit (Admin Key for /proofs) ──────────────────────────────────
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [adminKeyLoggedIn, setAdminKeyLoggedIn] = useState(
    () => typeof window !== 'undefined' && !!sessionStorage.getItem('tlsn:adminKey'),
  );
  const handleAdminKeyLogin = () => {
    const k = adminKeyInput.trim();
    if (!k) {
      showToast('Admin Key cannot be empty', 'error');
      return;
    }
    loginAsAdmin(k);
    setAdminKeyLoggedIn(true);
    showToast('Admin Key set — audit panel unlocked', 'success');
  };
  const handleAdminKeyLogout = () => {
    logoutAdmin();
    setAdminKeyLoggedIn(false);
    setAdminKeyInput('');
    showToast('Admin Key cleared', 'info');
  };

  // ── Reload ───────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!isC2CConfigured()) return;
    setLoading(true);
    try {
      // ── Static reads ────────────────────────────────────────────────────────
      const [bal, max, cryptos, fiats, adminAddr, pendingAddr] = await Promise.all([
        publicClient.getBalance({ address: ADMIN_ADDRESS }),
        publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'maxOrderAmount' }),
        publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getSupportCryptoList' }),
        publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'getSupportFiatList' }),
        publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'admin' }),
        publicClient.readContract({ address: c2cConfig.adminAddress, abi: C2C_ADMIN_ABI, functionName: 'pendingAdmin' }),
      ]);

      // ── Merchant list: discover via MerchantRegistered events ───────────────
      const logs = await publicClient.getLogs({
        address: c2cConfig.adminAddress,
        event: parseAbiItem('event MerchantRegistered(address indexed merchant, uint256 registeredAt)'),
        fromBlock: 0n,
      });
      // Deduplicate (same address can't be registered twice due to AlreadyRegistered revert, but be safe)
      const seen = new Set<string>();
      const uniqueLogs = logs.filter((l) => {
        const addr = (l.args.merchant as string).toLowerCase();
        if (seen.has(addr)) return false;
        seen.add(addr);
        return true;
      });
      // For each registered address, read the Merchant struct for product counts
      const merchantDetails = await Promise.all(
        uniqueLogs.map((l) =>
          publicClient.readContract({
            address: c2cConfig.adminAddress,
            abi: C2C_ADMIN_ABI,
            functionName: 'merchants',
            args: [l.args.merchant as `0x${string}`],
          }),
        ),
      );
      const merchants: MerchantEntry[] = uniqueLogs.map((l, i) => {
        // viem decodes multi-output functions as a tuple array at runtime,
        // not a named object — access by index: [isActive, kybVerified, registeredAt, sellCryptoAmount, sellFiatAmount]
        const d = merchantDetails[i] as unknown as readonly [boolean, boolean, bigint, bigint, bigint];
        return {
          address:          l.args.merchant as string,
          isActive:         Boolean(d[0]),
          registeredAt:     d[2],
          sellCryptoAmount: d[3],
          sellFiatAmount:   d[4],
        };
      });

      setEthBalance(bal as bigint);
      setMaxOrder(max as bigint);
      setCryptoList(cryptos as unknown as CryptoInfo[]);
      setFiatList(fiats as unknown as FiatInfo[]);
      setContractAdmin(adminAddr as string);
      setPendingAdminAddr(pendingAddr as string);
      setMerchantList(merchants);
    } catch (e) {
      console.error('[AdminPanel] reload error', e);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { reload(); }, [reload]);

  // ── Write helper ─────────────────────────────────────────────────────────────
  const execWrite = useCallback(async (
    fn: () => Promise<`0x${string}`>,
    successMsg: string,
  ) => {
    const hash = await fn();
    await publicClient.waitForTransactionReceipt({ hash });
    showToast(successMsg, 'success');
    await reload();
  }, [showToast, reload]);

  // ── Modal helpers ────────────────────────────────────────────────────────────
  function openModal(type: NonNullable<ModalType>) {
    setFormError('');
    setFormLoading(false);
    setCryptoAddrInput(''); setCryptoActiveInput(true);
    setFiatNameInput('');   setFiatActiveInput(true);
    setMerchantAddrInput('');
    setAuthCallerInput(''); setAuthCallerGrant(true);
    setProposeAdminInput('');
    setActiveModal(type);
  }

  function closeModal() {
    if (formLoading) return;
    setActiveModal(null);
    setFormError('');
  }

  // ── Max order amount ─────────────────────────────────────────────────────────
  function startEditMaxOrder() {
    setMaxOrderInput(maxOrder !== null ? formatUnits(maxOrder, 18) : '');
    setEditMaxOrder(true);
  }

  async function saveMaxOrder() {
    const val = maxOrderInput.trim();
    if (!val || isNaN(Number(val)) || Number(val) <= 0) {
      showToast('Enter a valid positive amount', 'error');
      return;
    }
    setSavingMaxOrder(true);
    try {
      await execWrite(
        () => (adminClient as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'setMaxOrderAmount',
          args: [parseUnits(val, 18)],
        }),
        'Max order amount updated',
      );
      setEditMaxOrder(false);
    } catch (e: any) {
      showToast(e.shortMessage || e.message || 'Failed', 'error');
    } finally {
      setSavingMaxOrder(false);
    }
  }

  // ── Asset toggle ─────────────────────────────────────────────────────────────
  function confirmToggleAsset(id: bigint, assetType: number, currentlyActive: boolean) {
    const kind   = assetType === ASSET_TYPE_CRYPTO ? 'crypto' : 'fiat';
    const action = currentlyActive ? 'deactivate' : 'activate';
    setConfirm({
      message: `Are you sure you want to ${action} this ${kind} asset?`,
      onConfirm: async () => {
        setConfirm(null);
        const fnName = currentlyActive ? 'deactivateAsset' : 'activateAsset';
        try {
          await execWrite(
            () => (adminClient as any).writeContract({
              address: c2cConfig.adminAddress,
              abi: C2C_ADMIN_ABI,
              functionName: fnName,
              args: [id, assetType],
            }),
            `Asset ${currentlyActive ? 'deactivated' : 'activated'}`,
          );
        } catch (e: any) {
          showToast(e.shortMessage || e.message || 'Failed', 'error');
        }
      },
    });
  }

  // ── Add crypto ───────────────────────────────────────────────────────────────
  async function handleAddCrypto() {
    if (!isAddress(cryptoAddrInput)) { setFormError('Invalid token address'); return; }
    setFormLoading(true); setFormError('');
    try {
      await execWrite(
        () => (adminClient as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'addCryptoInfo',
          args: [cryptoAddrInput as `0x${string}`, cryptoActiveInput],
        }),
        'Crypto asset added',
      );
      closeModal();
    } catch (e: any) {
      setFormError(e.shortMessage || e.message || 'Transaction failed');
    } finally { setFormLoading(false); }
  }

  // ── Add fiat ─────────────────────────────────────────────────────────────────
  async function handleAddFiat() {
    if (!fiatNameInput.trim()) { setFormError('Currency code is required'); return; }
    setFormLoading(true); setFormError('');
    try {
      await execWrite(
        () => (adminClient as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'addFiatInfo',
          args: [fiatNameInput.trim(), fiatActiveInput],
        }),
        'Fiat asset added',
      );
      closeModal();
    } catch (e: any) {
      setFormError(e.shortMessage || e.message || 'Transaction failed');
    } finally { setFormLoading(false); }
  }

  // ── Register merchant ────────────────────────────────────────────────────────
  async function handleRegisterMerchant() {
    if (!isAddress(merchantAddrInput)) { setFormError('Invalid merchant address'); return; }
    setFormLoading(true); setFormError('');
    try {
      await execWrite(
        () => (adminClient as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'registerMerchantByAdmin',
          args: [merchantAddrInput as `0x${string}`],
        }),
        'Merchant registered',
      );
      closeModal();
    } catch (e: any) {
      setFormError(e.shortMessage || e.message || 'Transaction failed');
    } finally { setFormLoading(false); }
  }

  // ── Set authorized caller ────────────────────────────────────────────────────
  async function handleSetAuthCaller() {
    if (!isAddress(authCallerInput)) { setFormError('Invalid address'); return; }
    setFormLoading(true); setFormError('');
    try {
      await execWrite(
        () => (adminClient as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'setAuthorizedCaller',
          args: [authCallerInput as `0x${string}`, authCallerGrant],
        }),
        `Caller ${authCallerGrant ? 'authorized' : 'revoked'}`,
      );
      closeModal();
    } catch (e: any) {
      setFormError(e.shortMessage || e.message || 'Transaction failed');
    } finally { setFormLoading(false); }
  }

  // ── Propose admin ────────────────────────────────────────────────────────────
  async function handleProposeAdmin() {
    if (!isAddress(proposeAdminInput)) { setFormError('Invalid address'); return; }
    setFormLoading(true); setFormError('');
    try {
      await execWrite(
        () => (adminClient as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'proposeAdmin',
          args: [proposeAdminInput as `0x${string}`],
        }),
        'Transfer proposed — pending admin must call acceptAdmin()',
      );
      closeModal();
    } catch (e: any) {
      setFormError(e.shortMessage || e.message || 'Transaction failed');
    } finally { setFormLoading(false); }
  }

  // ── Accept admin ─────────────────────────────────────────────────────────────
  async function handleAcceptAdmin() {
    const client = findClientByAddress(pendingAdminAddr);
    if (!client) {
      showToast('Pending admin is not a known hardhat account — call acceptAdmin() externally', 'error');
      return;
    }
    try {
      await execWrite(
        () => (client as any).writeContract({
          address: c2cConfig.adminAddress,
          abi: C2C_ADMIN_ABI,
          functionName: 'acceptAdmin',
          args: [],
        }),
        'Admin transfer completed',
      );
    } catch (e: any) {
      showToast(e.shortMessage || e.message || 'Failed', 'error');
    }
  }

  // ── Not configured ────────────────────────────────────────────────────────────
  if (!isC2CConfigured()) {
    return (
      <div style={S.panel}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: C.text }}>Admin Panel</h2>
        <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>Deploy contracts first.</p>
      </div>
    );
  }

  const hasPending =
    pendingAdminAddr &&
    pendingAdminAddr !== ZERO_ADDR &&
    pendingAdminAddr !== '';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.panel}>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Confirm dialog ─────────────────────────────────────────────────── */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '22px 24px', maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
              <span style={{ color: C.warning, flexShrink: 0, marginTop: 1 }}><IconAlert /></span>
              <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{confirm.message}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="outline" onClick={() => setConfirm(null)}>Cancel</Btn>
              <Btn danger onClick={confirm.onConfirm}>Confirm</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Crypto modal ───────────────────────────────────────────────── */}
      {activeModal === 'addCrypto' && (
        <Modal
          title="Add Crypto Asset"
          onClose={closeModal}
          footer={<>
            <Btn variant="outline" onClick={closeModal} disabled={formLoading}>Cancel</Btn>
            <Btn onClick={handleAddCrypto} disabled={formLoading}>{formLoading ? 'Adding…' : 'Add Asset'}</Btn>
          </>}
        >
          <div style={S.formGroup}>
            <label style={S.label}>Token Address *</label>
            <input
              style={S.input}
              placeholder="0x…"
              value={cryptoAddrInput}
              onChange={(e) => setCryptoAddrInput(e.target.value)}
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>
              ERC-20 contract address — symbol is fetched on-chain automatically
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Initial Status</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={cryptoActiveInput} onChange={(e) => setCryptoActiveInput(e.target.checked)} />
              Active on creation
            </label>
          </div>
          {formError && <div style={{ fontSize: 12, color: C.error, marginTop: 4 }}>{formError}</div>}
        </Modal>
      )}

      {/* ── Add Fiat modal ─────────────────────────────────────────────────── */}
      {activeModal === 'addFiat' && (
        <Modal
          title="Add Fiat Asset"
          onClose={closeModal}
          footer={<>
            <Btn variant="outline" onClick={closeModal} disabled={formLoading}>Cancel</Btn>
            <Btn onClick={handleAddFiat} disabled={formLoading}>{formLoading ? 'Adding…' : 'Add Asset'}</Btn>
          </>}
        >
          <div style={S.formGroup}>
            <label style={S.label}>Currency Code *</label>
            <input
              style={S.input}
              placeholder="e.g. MYR, SGD, USD"
              value={fiatNameInput}
              onChange={(e) => setFiatNameInput(e.target.value)}
            />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Initial Status</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={fiatActiveInput} onChange={(e) => setFiatActiveInput(e.target.checked)} />
              Active on creation
            </label>
          </div>
          {formError && <div style={{ fontSize: 12, color: C.error, marginTop: 4 }}>{formError}</div>}
        </Modal>
      )}

      {/* ── Register Merchant modal ────────────────────────────────────────── */}
      {activeModal === 'registerMerchant' && (
        <Modal
          title="Register Merchant"
          onClose={closeModal}
          footer={<>
            <Btn variant="outline" onClick={closeModal} disabled={formLoading}>Cancel</Btn>
            <Btn onClick={handleRegisterMerchant} disabled={formLoading}>{formLoading ? 'Registering…' : 'Register'}</Btn>
          </>}
        >
          <div style={S.formGroup}>
            <label style={S.label}>Merchant Address *</label>
            <input
              style={S.input}
              placeholder="0x…"
              value={merchantAddrInput}
              onChange={(e) => setMerchantAddrInput(e.target.value)}
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>
              Bypasses KYB verification and registers the address directly as an active merchant
            </div>
          </div>
          {formError && <div style={{ fontSize: 12, color: C.error, marginTop: 4 }}>{formError}</div>}
        </Modal>
      )}

      {/* ── Set Authorized Caller modal ────────────────────────────────────── */}
      {activeModal === 'setAuthCaller' && (
        <Modal
          title="Set Authorized Caller"
          onClose={closeModal}
          footer={<>
            <Btn variant="outline" onClick={closeModal} disabled={formLoading}>Cancel</Btn>
            <Btn onClick={handleSetAuthCaller} disabled={formLoading}>{formLoading ? 'Saving…' : 'Save'}</Btn>
          </>}
        >
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#9a3412', lineHeight: 1.6 }}>
            Authorized callers can invoke{' '}
            <code style={{ background: '#fef3c7', padding: '0 3px', borderRadius: 3 }}>incrementSellCount</code>.
            {' '}Typically this should be the C2CEscrow contract address.
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Contract Address *</label>
            <input
              style={S.input}
              placeholder="0x…"
              value={authCallerInput}
              onChange={(e) => setAuthCallerInput(e.target.value)}
            />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Permission</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: C.text }}>
                <input type="radio" checked={authCallerGrant} onChange={() => setAuthCallerGrant(true)} />
                Grant
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: C.text }}>
                <input type="radio" checked={!authCallerGrant} onChange={() => setAuthCallerGrant(false)} />
                Revoke
              </label>
            </div>
          </div>
          {formError && <div style={{ fontSize: 12, color: C.error, marginTop: 4 }}>{formError}</div>}
        </Modal>
      )}

      {/* ── Propose Admin modal ────────────────────────────────────────────── */}
      {activeModal === 'proposeAdmin' && (
        <Modal
          title="Propose Admin Transfer"
          onClose={closeModal}
          footer={<>
            <Btn variant="outline" onClick={closeModal} disabled={formLoading}>Cancel</Btn>
            <Btn danger onClick={handleProposeAdmin} disabled={formLoading}>{formLoading ? 'Proposing…' : 'Propose Transfer'}</Btn>
          </>}
        >
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '9px 12px', marginBottom: 16, fontSize: 12, color: '#991b1b', lineHeight: 1.6 }}>
            The new admin must call{' '}
            <code style={{ background: '#fee2e2', padding: '0 3px', borderRadius: 3 }}>acceptAdmin()</code>
            {' '}to complete the transfer. Current admin retains control until then.
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>New Admin Address *</label>
            <input
              style={S.input}
              placeholder="0x…"
              value={proposeAdminInput}
              onChange={(e) => setProposeAdminInput(e.target.value)}
            />
          </div>
          {formError && <div style={{ fontSize: 12, color: C.error, marginTop: 4 }}>{formError}</div>}
        </Modal>
      )}

      {/* ── Panel Header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Admin Panel</h2>
        <Btn variant="outline" small onClick={reload} disabled={loading}>
          {loading ? '…' : <><IconRefresh /> Refresh</>}
        </Btn>
      </div>

      {/* ── KPI Bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 4 }}>

        {/* Admin Address */}
        <KpiCard label="Admin Address">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <code style={{
              fontSize: 12, color: C.text,
              fontFamily: '"Fira Code", monospace',
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {truncateAddr(contractAdmin || ADMIN_ADDRESS, 10, 6)}
            </code>
            <CopyButton value={contractAdmin || ADMIN_ADDRESS} iconOnly />
          </div>
        </KpiCard>

        {/* ETH Balance */}
        <KpiCard label="ETH Balance">
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
            {ethBalance !== null
              ? `${parseFloat(formatUnits(ethBalance, 18)).toFixed(4)} ETH`
              : '…'}
          </div>
        </KpiCard>

        {/* Max Order Amount */}
        <KpiCard label="Max Order Amount">
          {editMaxOrder ? (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input
                style={{ ...S.input, padding: '4px 8px', fontSize: 13, flex: 1 }}
                value={maxOrderInput}
                onChange={(e) => setMaxOrderInput(e.target.value)}
                placeholder="USDT amount"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  saveMaxOrder();
                  if (e.key === 'Escape') setEditMaxOrder(false);
                }}
              />
              <Btn small onClick={saveMaxOrder} disabled={savingMaxOrder}>
                {savingMaxOrder ? '…' : <IconCheck />}
              </Btn>
              <Btn small variant="ghost" onClick={() => setEditMaxOrder(false)} disabled={savingMaxOrder}>
                <IconX />
              </Btn>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                {maxOrder !== null ? `${formatUnits(maxOrder, 18)} USDT` : '…'}
              </span>
              <button
                onClick={startEditMaxOrder}
                title="Edit max order amount"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 2, borderRadius: 4 }}
              >
                <IconPencil />
              </button>
            </div>
          )}
        </KpiCard>
      </div>

      {/* ── Supported Crypto ───────────────────────────────────────────────── */}
      <div style={S.sectionHeader}>
        <h3 style={S.sectionTitle}>Supported Crypto</h3>
        <Btn small variant="outline" onClick={() => openModal('addCrypto')}><IconPlus /> Add Crypto</Btn>
      </div>
      <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 4 }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 40 }}>ID</th>
              <th style={S.th}>Symbol</th>
              <th style={S.th}>Token Address</th>
              <th style={S.th}>Status</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cryptoList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...S.tdPlain, textAlign: 'center', color: C.textMuted, padding: '18px 10px', fontSize: 13 }}>
                  No crypto assets yet — click Add Crypto to add one
                </td>
              </tr>
            ) : cryptoList.map((c) => (
              <tr key={String(c.id)}>
                <td style={S.td}>{String(c.id)}</td>
                <td style={{ ...S.tdPlain, fontWeight: 600 }}>{c.tokenSymbol}</td>
                <td style={S.td} title={c.tokenAddress}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {truncateAddr(c.tokenAddress, 10, 6)}
                    <CopyButton value={c.tokenAddress} iconOnly />
                  </div>
                </td>
                <td style={S.tdPlain}><StatusBadge active={c.isActive} /></td>
                <td style={{ ...S.tdPlain, textAlign: 'right' }}>
                  <Btn small variant="outline" danger={c.isActive} onClick={() => confirmToggleAsset(c.id, ASSET_TYPE_CRYPTO, c.isActive)}>
                    {c.isActive ? 'Deactivate' : 'Activate'}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Supported Fiat ─────────────────────────────────────────────────── */}
      <div style={S.sectionHeader}>
        <h3 style={S.sectionTitle}>Supported Fiat</h3>
        <Btn small variant="outline" onClick={() => openModal('addFiat')}><IconPlus /> Add Fiat</Btn>
      </div>
      <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 4 }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 40 }}>ID</th>
              <th style={S.th}>Currency</th>
              <th style={S.th}>Status</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fiatList.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...S.tdPlain, textAlign: 'center', color: C.textMuted, padding: '18px 10px', fontSize: 13 }}>
                  No fiat assets yet — click Add Fiat to add one
                </td>
              </tr>
            ) : fiatList.map((f) => (
              <tr key={String(f.id)}>
                <td style={S.td}>{String(f.id)}</td>
                <td style={{ ...S.tdPlain, fontWeight: 600 }}>{f.fiatName}</td>
                <td style={S.tdPlain}><StatusBadge active={f.isActive} /></td>
                <td style={{ ...S.tdPlain, textAlign: 'right' }}>
                  <Btn small variant="outline" danger={f.isActive} onClick={() => confirmToggleAsset(f.id, ASSET_TYPE_FIAT, f.isActive)}>
                    {f.isActive ? 'Deactivate' : 'Activate'}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Merchants ──────────────────────────────────────────────────────── */}
      <div style={S.sectionHeader}>
        <h3 style={S.sectionTitle}>Merchants</h3>
        <Btn small variant="outline" onClick={() => openModal('registerMerchant')}><IconPlus /> Register Merchant</Btn>
      </div>
      <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 4 }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 36 }}>#</th>
              <th style={S.th}>Address</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Registered</th>
              <th style={{ ...S.th, textAlign: 'center' }}>Crypto Products</th>
              <th style={{ ...S.th, textAlign: 'center' }}>Fiat Products</th>
            </tr>
          </thead>
          <tbody>
            {merchantList.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: C.textMuted, padding: '18px 10px' }}>
                  No merchants registered yet — click Register Merchant to add one
                </td>
              </tr>
            ) : merchantList.map((m, i) => (
              <tr key={m.address}>
                <td style={{ ...S.tdPlain, fontWeight: 600 }}>{i + 1}</td>
                <td style={S.td} title={m.address}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {truncateAddr(m.address, 10, 6)}
                    <CopyButton value={m.address} iconOnly />
                  </div>
                </td>
                <td style={S.tdPlain}><StatusBadge active={m.isActive} /></td>
                <td style={S.tdPlain}>
                  {m.registeredAt > 0n
                    ? new Date(Number(m.registeredAt) * 1000).toLocaleDateString()
                    : <span style={{ color: C.textMuted }}>—</span>}
                </td>
                <td style={{ ...S.tdPlain, textAlign: 'center' }}>{String(m.sellCryptoAmount)}</td>
                <td style={{ ...S.tdPlain, textAlign: 'center' }}>{String(m.sellFiatAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── V4 Risk Manager Config ─────────────────────────────────────────── */}
      <RiskConfigPanel />

      {/* ── V4 User Reputation Management ─────────────────────────────────── */}
      <UserRiskManager />

      {/* ── Access Control ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <span style={{ color: C.muted }}><IconShield /></span>
          <h3 style={{ ...S.sectionTitle, margin: 0 }}>Access Control</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>

          {/* Authorized Callers */}
          <div style={{
            background: '#fff7ed', borderRadius: 9,
            border: '1px solid #fed7aa', borderLeft: `3px solid ${C.warning}`,
            padding: '13px 15px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
              Authorized Callers
            </div>
            <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 12px', lineHeight: 1.6 }}>
              Grant or revoke a contract's permission to call{' '}
              <code style={{ background: '#fef3c7', padding: '0 3px', borderRadius: 3, fontSize: 11 }}>incrementSellCount</code>.
              {' '}Typically the C2CEscrow address.
            </p>
            <Btn small variant="outline" onClick={() => openModal('setAuthCaller')}>
              <IconPlus /> Set Authorized Caller
            </Btn>
          </div>

          {/* Admin Transfer */}
          <div style={{
            background: '#fef2f2', borderRadius: 9,
            border: '1px solid #fca5a5', borderLeft: `3px solid ${C.error}`,
            padding: '13px 15px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
              Admin Transfer (2-step)
            </div>

            <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 10, lineHeight: 1.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontWeight: 600, width: 52, flexShrink: 0 }}>Current:</span>
                <code style={{ fontSize: 11, fontFamily: '"Fira Code", monospace' }}>
                  {truncateAddr(contractAdmin || ADMIN_ADDRESS, 10, 6)}
                </code>
                <CopyButton value={contractAdmin || ADMIN_ADDRESS} iconOnly />
              </div>
              {hasPending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontWeight: 600, width: 52, flexShrink: 0 }}>Pending:</span>
                  <code style={{ fontSize: 11, fontFamily: '"Fira Code", monospace' }}>
                    {truncateAddr(pendingAdminAddr, 10, 6)}
                  </code>
                  <CopyButton value={pendingAdminAddr} iconOnly />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <Btn small danger variant="outline" onClick={() => openModal('proposeAdmin')}>
                Propose Transfer
              </Btn>
              {hasPending && (
                <Btn small danger onClick={handleAcceptAdmin}>
                  Accept Transfer
                </Btn>
              )}
            </div>

            {hasPending && (
              <div style={{ fontSize: 11, color: '#991b1b', marginTop: 9, lineHeight: 1.5 }}>
                Pending acceptance. "Accept Transfer" works for known hardhat accounts. For external addresses, the new admin must call{' '}
                <code style={{ background: '#fee2e2', padding: '0 3px', borderRadius: 3 }}>acceptAdmin()</code> directly.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Verifier Audit (TLSN Proof Store) ─────────────────────────────── */}
      <div style={{ marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <span style={{ color: C.muted }}><IconShield /></span>
          <h3 style={{ ...S.sectionTitle, margin: 0 }}>Verifier Audit (TLSN Proof Store)</h3>
        </div>

        <div style={{
          background: '#eff6ff', borderRadius: 9,
          border: '1px solid #bfdbfe', borderLeft: `3px solid ${C.primary}`,
          padding: '13px 15px',
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
            Admin Key — required to load /proofs
          </div>
          <p style={{ fontSize: 12, color: '#1e3a8a', margin: '0 0 10px', lineHeight: 1.6 }}>
            Paste the <code style={{ background: '#dbeafe', padding: '0 3px', borderRadius: 3, fontSize: 11 }}>PROOF_API_KEYS</code> super-admin key configured in <code style={{ background: '#dbeafe', padding: '0 3px', borderRadius: 3, fontSize: 11 }}>packages/verifier/.env</code>.
          </p>
          {!adminKeyLoggedIn ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...S.input, flex: 1 }}
                type="password"
                placeholder="admin-demo-key"
                value={adminKeyInput}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdminKeyLogin(); }}
              />
              <Btn onClick={handleAdminKeyLogin}>Login</Btn>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>● Admin Key active</span>
              <Btn small variant="outline" onClick={handleAdminKeyLogout}>Logout</Btn>
            </div>
          )}
        </div>

        <AdminAudit />
      </div>
    </div>
  );
}
