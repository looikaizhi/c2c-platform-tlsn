// packages/demo/src/components/ui.tsx
//
// Visual primitives + design tokens shared across panels.
//
// Phase 4 scope: defines the inventory and CSS rules. Existing panels keep
// their inline copies of CopyButton / Spinner / Badge / Modal / etc. until
// Phase 6.X swaps them out one-by-one. The Toast container ships in Phase 5
// (depends on the zustand store introduced there).

import clsx from 'clsx';
import { useState, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { Hex } from 'viem';
import styles from './ui.module.css';
import { tryGetAdapter } from '../utils/platforms';

// ─── Design tokens (single source of truth for the 4 inline token tables
//                   currently scattered across TradingHall / UserPanel /
//                   MerchantPanel / AdminPanel) ────────────────────────────

export const tokens = {
  color: {
    primary:       '#1677ff',
    primaryHover:  '#0958d9',
    success:       '#16a34a',
    successBg:     '#f0fdf4',
    successBorder: '#bbf7d0',
    danger:        '#dc2626',
    dangerBg:      '#fef2f2',
    dangerBorder:  '#fecaca',
    warning:       '#d97706',
    warningBg:     '#fffbeb',
    warningBorder: '#fde68a',
    info:          '#2563eb',
    infoBg:        '#eff6ff',
    infoBorder:    '#bfdbfe',
    text:          '#111827',
    textMuted:     '#6b7280',
    border:        '#e5e7eb',
    bgPage:        '#f5f7fa',
    bgCard:        '#fff',
    bgSoft:        '#f9fafb',
  },
  space:  { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
  radius: { sm: 4, md: 6, lg: 8, xl: 12 },
  shadow: { card: '0 2px 12px rgba(0,0,0,0.08)' },
  fontSz: { xs: 11, sm: 12, base: 13, md: 14, lg: 17 },
  orderStatus: {
    0: { bg: '#e6f4ff', color: '#1677ff', label: 'PENDING'   },
    1: { bg: '#fff7e6', color: '#d46b08', label: 'EXPIRED'   },
    2: { bg: '#f6ffed', color: '#52c41a', label: 'COMPLETED' },
    3: { bg: '#e6f4ff', color: '#1677ff', label: 'WAITING'   },
  },
} as const;

// ─── Card ───────────────────────────────────────────────────────────────────

export interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}
export function Card({ children, style, className }: CardProps) {
  return (
    <div className={clsx(styles.card, className)} style={style}>
      {children}
    </div>
  );
}

// ─── Button ─────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}
export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(styles.btn, styles[`btn--${variant}`], className)}
    >
      {children}
    </button>
  );
}

// ─── CopyButton (replaces 4 inline implementations) ─────────────────────────

export interface CopyButtonProps {
  value: string;
  label?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}
export function CopyButton({ value, label = 'Copy', ariaLabel, style }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore — clipboard API can be unavailable in non-https contexts
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? `Copy ${label}`}
      style={{
        cursor: 'pointer',
        background: 'transparent',
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.sm,
        padding: `${tokens.space[1]}px ${tokens.space[2]}px`,
        fontSize: tokens.fontSz.xs,
        color: copied ? tokens.color.success : tokens.color.textMuted,
        ...style,
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ─── HashRow ────────────────────────────────────────────────────────────────

export interface HashRowProps {
  label: string;
  value: Hex | string;
  truncate?: boolean;
}
export function HashRow({ label, value, truncate = true }: HashRowProps) {
  const display = truncate && value.length > 18
    ? `${value.slice(0, 8)}…${value.slice(-6)}`
    : value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space[2] }}>
      <span style={{ fontSize: tokens.fontSz.xs, color: tokens.color.textMuted }}>{label}</span>
      <code style={{ fontSize: tokens.fontSz.xs }}>{display}</code>
      <CopyButton value={value} label="" ariaLabel={`Copy ${label}`} />
    </div>
  );
}

// ─── Badge (generic variant pill) ───────────────────────────────────────────

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  style?: CSSProperties;
}
export function Badge({ variant = 'neutral', children, style }: BadgeProps) {
  return (
    <span className={clsx(styles.badge, styles[`badge--${variant}`])} style={style}>
      {children}
    </span>
  );
}

// ─── StatusBadge (order status codes 0..3) ──────────────────────────────────

export interface StatusBadgeProps {
  status: 0 | 1 | 2 | 3;
  style?: CSSProperties;
}
export function StatusBadge({ status, style }: StatusBadgeProps) {
  const s = tokens.orderStatus[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: tokens.fontSz.xs,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        ...style,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Spinner ────────────────────────────────────────────────────────────────

export interface SpinnerProps {
  size?: number;
  style?: CSSProperties;
}
export function Spinner({ size = 16, style }: SpinnerProps) {
  return (
    <span
      aria-label="loading"
      className={styles.spinner}
      style={{ width: size, height: size, ...style }}
    />
  );
}

// ─── Skeletons (shimmer placeholders) ───────────────────────────────────────

export interface SkeletonBlockProps {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}
export function SkeletonBlock({ width = '100%', height = 12, style }: SkeletonBlockProps) {
  return <div className={styles.skeleton} style={{ width, height, ...style }} />;
}

export interface SkeletonRowProps {
  widths?: Array<number | string>;
}
export function SkeletonRow({ widths = [120, 80, 60] }: SkeletonRowProps) {
  return (
    <div style={{ display: 'flex', gap: tokens.space[2] }}>
      {widths.map((w, i) => (
        <SkeletonBlock key={i} width={w} />
      ))}
    </div>
  );
}

export interface SkeletonTabProps {
  count?: number;
}
export function SkeletonTab({ count = 3 }: SkeletonTabProps) {
  return (
    <div style={{ display: 'flex', gap: tokens.space[2] }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} width={64} height={24} />
      ))}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number | string;
  children: ReactNode;
}
export function Modal({ open, onClose, title, width = 480, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            style={{
              fontSize: tokens.fontSz.lg,
              fontWeight: 700,
              marginBottom: tokens.space[4],
              color: tokens.color.text,
            }}
          >
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ─── ConfirmDialog ──────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width={420}>
      <div style={{ fontSize: tokens.fontSz.base, color: tokens.color.text, marginBottom: tokens.space[5] }}>
        {message}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space[2] }}>
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ─── PlatformChip (PlatformAdapter-aware label) ─────────────────────────────

export interface PlatformChipProps {
  platformId: Hex;
  showCurrency?: boolean;
  style?: CSSProperties;
}
export function PlatformChip({ platformId, showCurrency = false, style }: PlatformChipProps) {
  const adapter = tryGetAdapter(platformId);
  const label = adapter?.label ?? 'Unknown';
  const currency = adapter?.currency;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: tokens.space[1],
        padding: '2px 8px',
        borderRadius: 9999,
        background: tokens.color.bgSoft,
        border: `1px solid ${tokens.color.border}`,
        fontSize: tokens.fontSz.xs,
        color: tokens.color.text,
        ...style,
      }}
    >
      {label}
      {showCurrency && currency && (
        <span style={{ color: tokens.color.textMuted }}>· {currency}</span>
      )}
    </span>
  );
}
