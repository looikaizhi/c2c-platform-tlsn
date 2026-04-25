"use client";
import React from 'react';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'buy' | 'sell';

export interface BadgeProps {
  variant: BadgeVariant;
  dot?: boolean;
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

const variantMap: Record<BadgeVariant, { color: string; bg: string }> = {
  success: { color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
  danger:  { color: 'var(--status-danger)',  bg: 'var(--status-danger-bg)' },
  warning: { color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
  info:    { color: 'var(--status-info)',    bg: 'var(--status-info-bg)' },
  muted:   { color: 'var(--status-muted)',   bg: 'var(--status-muted-bg)' },
  buy:     { color: 'var(--color-buy)',      bg: 'var(--color-buy-bg)' },
  sell:    { color: 'var(--color-sell)',     bg: 'var(--color-sell-bg)' },
};

export function Badge({ variant, dot = false, size = 'md', children }: BadgeProps) {
  const { color, bg } = variantMap[variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        color,
        background: bg,
        borderRadius: 'var(--radius-full)',
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
