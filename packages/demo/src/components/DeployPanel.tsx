// packages/demo/src/components/DeployPanel.tsx
// Shows the contract addresses deployed automatically by `npm run dev`.
// Deployment is handled by packages/contracts/scripts/deploy-c2c-demo.ts
// (Node.js / Hardhat) and written to packages/demo/.env before Vite starts.

import React, { useState, useCallback } from 'react';
import { isC2CConfigured, c2cConfig } from '../utils/c2cContractConfig';

// ─── Env helpers ────────────────────────────────────────────────────────────

const env = (import.meta as any).env as Record<string, string>;
const verifierHost = env['VITE_VERIFIER_HOST'] || '';
const useSSL = env['VITE_SSL'] === 'true';
const chainId = env['VITE_CHAIN_ID'] || '';
const verifierUrl = verifierHost
  ? `${useSSL ? 'wss' : 'ws'}://${verifierHost}`
  : '';

// ─── Address helpers ─────────────────────────────────────────────────────────

function truncate(addr: string): string {
  if (!addr || addr.length <= 2) return '';
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function isValidAddr(addr: string): boolean {
  return Boolean(addr && addr.length > 2);
}

// ─── SVG icons ───────────────────────────────────────────────────────────────

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconDot = ({ color }: { color: string }) => (
  <svg width="8" height="8" viewBox="0 0 8 8">
    <circle cx="4" cy="4" r="4" fill={color} />
  </svg>
);

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy address'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        padding: 0,
        border: 'none',
        borderRadius: 6,
        background: copied
          ? '#dcfce7'
          : hovered
          ? '#e2e8f0'
          : 'transparent',
        color: copied ? '#16a34a' : '#64748b',
        cursor: 'pointer',
        transition: 'background 150ms ease, color 150ms ease',
        flexShrink: 0,
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

// ─── AddressRow ───────────────────────────────────────────────────────────────

function AddressRow({ label, address }: { label: string; address: string }) {
  if (!isValidAddr(address)) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid #f1f5f9',
      }}
    >
      <span
        style={{
          width: 88,
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 500,
          color: '#64748b',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
      <code
        title={address}
        style={{
          flex: 1,
          fontSize: 12,
          fontFamily: '"Fira Code", "Courier New", monospace',
          color: '#1e293b',
          letterSpacing: '0.02em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {truncate(address)}
      </code>
      <CopyButton text={address} />
    </div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  accent: string;
  bg: string;
  children: React.ReactNode;
}

function SectionCard({ title, accent, bg, children }: SectionCardProps) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: 10,
        border: `1px solid ${accent}25`,
        borderLeft: `3px solid ${accent}`,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── MetaRow ─────────────────────────────────────────────────────────────────

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
      <span style={{ fontWeight: 500 }}>{label}:</span>
      <span style={{ color: '#334155', fontFamily: mono ? '"Fira Code", monospace' : undefined }}>
        {value}
      </span>
    </div>
  );
}

// ─── DeployPanel ──────────────────────────────────────────────────────────────

export function DeployPanel() {
  const configured = isC2CConfigured();

  const coreContracts: Array<{ label: string; address: string }> = [
    { label: 'Escrow',    address: c2cConfig.escrowAddress },
    { label: 'Admin',     address: c2cConfig.adminAddress },
    { label: 'Verifier',  address: c2cConfig.verifierSignerAddress },
  ].filter(({ address }) => isValidAddr(address));

  const tokens: Array<{ label: string; address: string }> = [
    { label: 'USDT', address: c2cConfig.usdtAddress },
    { label: 'USDC', address: c2cConfig.usdcAddress },
    { label: 'DAI', address: c2cConfig.daiAddress },
  ].filter(({ address }) => isValidAddr(address));

  const merchants: Array<{ label: string; address: string }> = [
    { label: 'Merchant 1', address: c2cConfig.merchant1Address || c2cConfig.merchantAddress },
    { label: 'Merchant 2', address: c2cConfig.merchant2Address },
    { label: 'Merchant 3', address: c2cConfig.merchant3Address },
  ].filter(({ address }) => isValidAddr(address));

  const users: Array<{ label: string; address: string }> = [
    { label: 'User 1', address: c2cConfig.user1Address || c2cConfig.buyerAddress },
    { label: 'User 2', address: c2cConfig.user2Address },
    { label: 'User 3', address: c2cConfig.user3Address },
    { label: 'User 4', address: c2cConfig.user4Address },
    { label: 'User 5', address: c2cConfig.user5Address },
  ].filter(({ address }) => isValidAddr(address));

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: '20px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        marginBottom: 24,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            Deploy Panel
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
            Contracts deployed automatically via{' '}
            <code style={{ fontSize: 12, background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
              npm run dev
            </code>
            . Restart to redeploy.
          </p>
        </div>

        {/* Status badge */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: configured ? '#dcfce7' : '#f1f5f9',
              color: configured ? '#16a34a' : '#94a3b8',
            }}
          >
            <IconDot color={configured ? '#22c55e' : '#94a3b8'} />
            {configured ? 'Deployed' : 'Not Deployed'}
          </div>
          {chainId && (
            <span
              style={{
                fontSize: 11,
                color: '#94a3b8',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '2px 7px',
              }}
            >
              Chain ID: {chainId}
            </span>
          )}
        </div>
      </div>

      {/* ── Verifier meta ── */}
      {verifierUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 16,
            padding: '8px 12px',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <MetaRow label="Verifier" value={verifierUrl} mono />
          <MetaRow label="Protocol" value={useSSL ? 'wss (TLS)' : 'ws (plain)'} />
        </div>
      )}

      {configured ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>

          {/* Core Contracts */}
          {coreContracts.length > 0 && (
            <SectionCard title="Core Contracts" accent="#2563eb" bg="#eff6ff">
              {coreContracts.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}

          {/* Tokens */}
          {tokens.length > 0 && (
            <SectionCard title="Tokens" accent="#059669" bg="#f0fdf4">
              {tokens.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}

          {/* Merchants */}
          {merchants.length > 0 && (
            <SectionCard title="Merchants" accent="#7c3aed" bg="#f5f3ff">
              {merchants.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}

          {/* Users */}
          {users.length > 0 && (
            <SectionCard title="Users" accent="#d97706" bg="#fffbeb">
              {users.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 16px',
            background: '#fffbeb',
            borderRadius: 10,
            border: '1px solid #fde68a',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 2 }}>
              No contracts deployed
            </div>
            <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
              Run{' '}
              <code style={{ fontSize: 12, background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>
                npm run dev
              </code>{' '}
              to deploy automatically (requires a Hardhat node on port 8545).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
