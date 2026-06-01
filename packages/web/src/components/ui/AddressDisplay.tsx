"use client";
import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { truncateAddr } from '@/lib/formatters';

export interface AddressDisplayProps {
  address: `0x${string}`;
  truncate?: boolean;
  copyable?: boolean;
  linkToExplorer?: boolean;
  explorerUrl?: string;
}

export function AddressDisplay({
  address,
  truncate = true,
  copyable = true,
  linkToExplorer = false,
  explorerUrl,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const display = truncate ? truncateAddr(address) : address;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}
    >
      {linkToExplorer && explorerUrl ? (
        <a
          href={`${explorerUrl}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
        >
          {display}
        </a>
      ) : (
        <span>{display}</span>
      )}
      {copyable && (
        <button
          onClick={handleCopy}
          title="Copy address"
          aria-label="Copy address"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: copied ? 'var(--status-success)' : 'var(--text-tertiary)',
            padding: '0',
            lineHeight: 1,
            transition: 'color var(--motion-fast)',
          }}
        >
          {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
        </button>
      )}
    </span>
  );
}
