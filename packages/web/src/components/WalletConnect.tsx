"use client";
import { useState } from 'react';
import { Power } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { truncateAddr } from '@/lib/formatters';

export default function WalletConnect() {
  const { address, chainId, isConnected, wallets, isConnecting, error, connect, disconnect } =
    useWallet();
  const [showDropdown, setShowDropdown] = useState(false);

  if (isConnected && address) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setShowDropdown((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            height: '36px',
            padding: '0 var(--space-3)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'border-color var(--motion-fast)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
          }}
        >
          <Badge variant="success" size="sm">●</Badge>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {truncateAddr(address)}
          </span>
          {chainId && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>#{chainId}</span>
          )}
          <span style={{ color: 'var(--text-tertiary)' }}>▾</span>
        </button>

        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 6px)',
              zIndex: 200,
              width: '280px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                marginBottom: 'var(--space-1)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                wordBreak: 'break-all',
              }}
            >
              {address}
            </div>
            <button
              type="button"
              onClick={() => { disconnect(); setShowDropdown(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                background: 'none',
                border: 'none',
                color: 'var(--status-danger)',
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background var(--motion-fast)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--status-danger-bg)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Power size={13} strokeWidth={1.5} /> Disconnect
              </span>
            </button>
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', fontSize: '12px', color: 'var(--status-danger)', whiteSpace: 'nowrap' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div style={{ position: 'relative' }}>
        <Button variant="ghost" size="sm" disabled>
          No Wallet
        </Button>
        {error && (
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', fontSize: '12px', color: 'var(--status-danger)', whiteSpace: 'nowrap' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  if (wallets.length === 1) {
    return (
      <div style={{ position: 'relative' }}>
        <Button
          variant="primary"
          size="sm"
          loading={isConnecting}
          onClick={() => connect(wallets[0].id)}
        >
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </Button>
        {error && (
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', fontSize: '12px', color: 'var(--status-danger)', whiteSpace: 'nowrap' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <Button
        variant="primary"
        size="sm"
        loading={isConnecting}
        onClick={() => setShowDropdown((v) => !v)}
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </Button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 200,
            width: '240px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              padding: 'var(--space-2) var(--space-3)',
              marginBottom: 'var(--space-1)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
            }}
          >
            Select Wallet
          </div>
          {wallets.map((w) => (
            <button
              type="button"
              key={w.id}
              onClick={() => { connect(w.id); setShowDropdown(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background var(--motion-fast)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              {w.icon && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={w.icon} alt={w.name} width={24} height={24} style={{ borderRadius: 'var(--radius-sm)' }} />
              )}
              <span>{w.name}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', fontSize: '12px', color: 'var(--status-danger)', whiteSpace: 'nowrap' }}>
          {error}
        </div>
      )}
    </div>
  );
}
