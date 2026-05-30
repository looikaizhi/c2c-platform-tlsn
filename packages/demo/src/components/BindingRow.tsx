// packages/demo/src/components/BindingRow.tsx
//
// Shared per-platform binding row used by UserPanel (buyer self-bind) and
// TradingHall's ProductDetailModal (inline bind-then-order flow). Wraps
// setUserPlatformBinding and surfaces tx status, hash preview, and the
// localStorage-cached plaintext.

import { useEffect, useState } from 'react';
import type { Hex, WalletClient } from 'viem';
import {
  setUserPlatformBinding,
  type BindingView,
} from '../utils/services';

// ─── Design tokens (kept local so this component is drop-in self-contained) ──

const CLR = {
  success: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  danger:  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  neutral: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
  info:    { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
} as const;
type BadgeVariant = keyof typeof CLR;

const MONO: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

const FORM_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#475569',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  lineHeight: 1.4,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  color: '#0f172a',
  background: '#fff',
  transition: 'border-color 150ms ease-out, box-shadow 150ms ease-out',
};

function btnStyle(
  variant: 'primary' | 'ghost' = 'primary',
  extra: React.CSSProperties = {},
): React.CSSProperties {
  const base: React.CSSProperties = {
    minHeight: 36,
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1,
    transition: 'background 150ms ease-out, opacity 150ms ease-out',
  };
  if (variant === 'ghost') {
    return {
      ...base,
      background: 'transparent',
      color: '#475569',
      border: '1px solid #e2e8f0',
      ...extra,
    };
  }
  return { ...base, background: '#2563eb', color: '#fff', ...extra };
}

// ─── Reusable atoms ──────────────────────────────────────────────────────────

function Badge({ v, text }: { v: BadgeVariant; text: string }) {
  const c = CLR[v];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 9999,
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.text, flexShrink: 0 }} />
      {text}
    </span>
  );
}

function HashPreview({ label, hash }: { label: string; hash: Hex }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.6 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, minWidth: 48, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ ...MONO, fontSize: 11, color: '#475569' }} title={hash}>
        {hash.slice(0, 18)}…{hash.slice(-6)}
      </span>
    </div>
  );
}

// ─── BindingRow ──────────────────────────────────────────────────────────────

export interface BindingRowProps {
  /** Current on-chain + cached plaintext view. */
  binding: BindingView;
  /** Wallet client signing the setPlatformBinding tx; undefined = read-only. */
  walletClient: WalletClient | undefined;
  /** Called after a successful bind tx so the parent can refresh state. */
  onChange: () => void;
  /** Start with the inline form open (used when a caller wants "set now"). */
  defaultOpen?: boolean;
  /** Hide the row's status row and only render the form (modal/inline use). */
  compact?: boolean;
}

export function BindingRow({ binding, walletClient, onChange, defaultOpen, compact }: BindingRowProps) {
  const [open, setOpen]       = useState(!!defaultOpen);
  const [name, setName]       = useState(binding.plaintext?.name   ?? '');
  const [handle, setHandle]   = useState(binding.plaintext?.handle ?? '');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Auto-clear the "Saved" toast after a moment
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  const submit = async () => {
    if (!walletClient || !name.trim() || !handle.trim()) return;
    setLoading(true); setErr(null);
    try {
      await setUserPlatformBinding(walletClient, binding.platformId, name, handle);
      setJustSaved(true);
      setOpen(false);
      // small delay so the chain has time to surface the read in the next reload
      setTimeout(onChange, 400);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const placeholderName   = binding.platformLabel === 'Wise' ? 'e.g. JOHN DOE' : 'e.g. 张三';
  const placeholderHandle = binding.platformLabel === 'Wise' ? '@handle'        : 'phone or email';

  // ── Status row (hidden in compact mode) ──
  const statusRow = !compact && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 28 }}>
      <span style={{
        fontSize: 13,
        fontWeight: 700,
        color: '#0f172a',
        minWidth: 64,
        letterSpacing: '0.01em',
      }}>
        {binding.platformLabel}
      </span>
      <Badge v={binding.isSet ? 'success' : 'neutral'} text={binding.isSet ? 'Set' : 'Not set'} />
      {justSaved && <Badge v="info" text="Just saved" />}

      {binding.isSet && binding.plaintext && (
        <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.4 }}>
          {binding.plaintext.name}
          <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
          <span style={MONO}>{binding.plaintext.handle}</span>
        </span>
      )}
      {binding.isSet && !binding.plaintext && (
        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
          plaintext not cached in this browser — hash only
        </span>
      )}
      {walletClient && (
        <button
          aria-label={open ? `Cancel editing ${binding.platformLabel} binding` : `${binding.isSet ? 'Update' : 'Set'} ${binding.platformLabel} binding`}
          style={btnStyle('ghost', { marginLeft: 'auto', padding: '6px 12px', fontSize: 12 })}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Cancel' : binding.isSet ? 'Update' : 'Set'}
        </button>
      )}
    </div>
  );

  // ── Hash detail strip (collapsed view, only when set & not editing) ──
  const hashStrip = !compact && binding.isSet && !open && (
    <div style={{
      marginTop: 8,
      marginLeft: 76,
      background: '#f8fafc',
      borderRadius: 8,
      padding: '10px 12px',
      border: '1px solid #f1f5f9',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <HashPreview label="Name" hash={binding.nameHash} />
      <HashPreview label="ID"   hash={binding.idHash} />
    </div>
  );

  // ── Form ──
  const form = (open || compact) && (
    <div style={{
      marginTop: compact ? 0 : 12,
      background: compact ? '#fff' : '#f8fafc',
      borderRadius: 10,
      padding: compact ? 0 : 16,
      border: compact ? 'none' : '1px solid #e2e8f0',
    }}>
      {compact && (
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: 12,
          letterSpacing: '0.01em',
        }}>
          Set your {binding.platformLabel} payment account
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={FORM_LABEL}>Real Name</label>
          <input
            style={INPUT_STYLE}
            value={name}
            placeholder={placeholderName}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
        <div>
          <label style={FORM_LABEL}>
            {binding.platformLabel === 'Wise' ? 'Wise Handle / Email' : 'Alipay Account'}
          </label>
          <input
            style={INPUT_STYLE}
            value={handle}
            placeholder={placeholderHandle}
            onChange={(e) => setHandle(e.target.value)}
            disabled={loading}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          style={btnStyle('primary', {
            opacity: (loading || !walletClient || !name.trim() || !handle.trim()) ? 0.55 : 1,
            cursor: (loading || !walletClient || !name.trim() || !handle.trim()) ? 'not-allowed' : 'pointer',
          })}
          onClick={submit}
          disabled={loading || !walletClient || !name.trim() || !handle.trim()}
        >
          {loading
            ? 'Submitting…'
            : `${binding.isSet ? 'Update' : 'Save'} ${binding.platformLabel} Info`}
        </button>
        {compact && !loading && (
          <button style={btnStyle('ghost')} onClick={() => setOpen(false)}>Cancel</button>
        )}
        {err && (
          <span style={{
            fontSize: 12,
            color: '#b91c1c',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            padding: '4px 10px',
            borderRadius: 6,
            lineHeight: 1.4,
          }}>
            {err}
          </span>
        )}
      </div>
      <p style={{
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 12,
        marginBottom: 0,
        lineHeight: 1.55,
      }}>
        Name and account are hashed (keccak256) on-chain. Plaintext is cached in
        this browser only so this device can display it later.
      </p>
    </div>
  );

  return (
    <div>
      {statusRow}
      {hashStrip}
      {form}
    </div>
  );
}
