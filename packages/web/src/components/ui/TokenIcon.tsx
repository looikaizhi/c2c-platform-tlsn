"use client";
import React, { useState } from 'react';

export interface TokenIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 16, md: 24, lg: 32 };

const tokenColors: Record<string, string> = {
  USDT: '#26A17B',
  USDC: '#2775CA',
  DAI: '#F5AC37',
  ETH: '#627EEA',
  BTC: '#F7931A',
  BNB: '#F0B90B',
};

export function TokenIcon({ symbol, size = 'md', className }: TokenIconProps) {
  const [imgError, setImgError] = useState(false);
  const px = sizeMap[size];
  const upper = symbol.toUpperCase();
  const bg = tokenColors[upper] ?? 'var(--bg-elevated)';

  if (!imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/icons/${symbol.toLowerCase()}.svg`}
        alt={symbol}
        width={px}
        height={px}
        className={className}
        style={{ borderRadius: '50%', flexShrink: 0 }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: px,
        height: px,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        fontSize: Math.floor(px * 0.45),
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {upper[0]}
    </span>
  );
}
