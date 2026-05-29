// packages/demo/src/components/DeployPanel.tsx
//
// Shows the contract addresses deployed automatically by `npm run dev`.
// Deployment is handled by packages/contracts/scripts/deploy-c2c-demo.ts
// (Node.js / Hardhat) and written to packages/demo/.env before Vite starts.
//
// Phase 6.1 refactor:
//   - chain.addresses / chain.isConfigured replace c2cContractConfig shim
//   - env reader → utils/lib.env
//   - inline truncate / CopyButton / IconCopy / IconCheck → ui.tsx primitives
//     (CopyButton uses the new iconOnly mode added in this commit for the
//      28x28 icon button look used by address rows)
//   - SectionCard / AddressRow / MetaRow / IconDot remain inline (DeployPanel-
//     only sub-components; not worth promoting to ui.tsx)

import React from 'react';
import { addresses, isConfigured } from '../utils/chain';
import { env } from '../utils/lib';
import { truncateAddr } from '../utils/lib';
import { CopyButton } from './ui';

// ─── Env helpers ────────────────────────────────────────────────────────────

const verifierHost = env['VITE_VERIFIER_HOST'] || '';
const useSSL       = env['VITE_SSL'] === 'true';
const chainId      = env['VITE_CHAIN_ID'] || '';
const verifierUrl  = verifierHost ? `${useSSL ? 'wss' : 'ws'}://${verifierHost}` : '';

// ─── Address helper ─────────────────────────────────────────────────────────

function isValidAddr(addr: string): boolean {
  return Boolean(addr && addr.length > 2);
}

// ─── IconDot (status pip) ───────────────────────────────────────────────────

function IconDot({ color }: { color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8">
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  );
}

// ─── AddressRow ─────────────────────────────────────────────────────────────

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
        {truncateAddr(address, 10, 6)}
      </code>
      <CopyButton value={address} iconOnly />
    </div>
  );
}

// ─── SectionCard ────────────────────────────────────────────────────────────

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

// ─── MetaRow ────────────────────────────────────────────────────────────────

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

// ─── DeployPanel ────────────────────────────────────────────────────────────

export function DeployPanel() {
  const configured = isConfigured();

  const coreContracts = [
    { label: 'Escrow',      address: addresses.escrowAddress },
    { label: 'Admin',       address: addresses.adminAddress },
    { label: 'Verifier',    address: addresses.verifierSignerAddress },
    { label: 'RiskManager', address: addresses.riskManagerAddress },
    { label: 'BondVault',   address: addresses.bondVaultAddress },
  ].filter(({ address }) => isValidAddr(address));

  const tokenList = [
    { label: 'USDT', address: addresses.usdtAddress },
    { label: 'USDC', address: addresses.usdcAddress },
    { label: 'DAI',  address: addresses.daiAddress },
  ].filter(({ address }) => isValidAddr(address));

  const merchants = [
    { label: 'Merchant 1', address: addresses.merchant1Address || addresses.merchantAddress },
    { label: 'Merchant 2', address: addresses.merchant2Address },
    { label: 'Merchant 3', address: addresses.merchant3Address },
  ].filter(({ address }) => isValidAddr(address));

  const users = [
    { label: 'User 1', address: addresses.user1Address || addresses.buyerAddress },
    { label: 'User 2', address: addresses.user2Address },
    { label: 'User 3', address: addresses.user3Address },
    { label: 'User 4', address: addresses.user4Address },
    { label: 'User 5', address: addresses.user5Address },
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
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
            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 7px' }}>
              Chain ID: {chainId}
            </span>
          )}
        </div>
      </div>

      {verifierUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <MetaRow label="Verifier" value={verifierUrl} mono />
          <MetaRow label="Protocol" value={useSSL ? 'wss (TLS)' : 'ws (plain)'} />
        </div>
      )}

      {configured ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {coreContracts.length > 0 && (
            <SectionCard title="Core Contracts" accent="#2563eb" bg="#eff6ff">
              {coreContracts.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}
          {tokenList.length > 0 && (
            <SectionCard title="Tokens" accent="#059669" bg="#f0fdf4">
              {tokenList.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}
          {merchants.length > 0 && (
            <SectionCard title="Merchants" accent="#7c3aed" bg="#f5f3ff">
              {merchants.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}
          {users.length > 0 && (
            <SectionCard title="Users" accent="#d97706" bg="#fffbeb">
              {users.map(({ label, address }) => (
                <AddressRow key={label} label={label} address={address} />
              ))}
            </SectionCard>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
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
