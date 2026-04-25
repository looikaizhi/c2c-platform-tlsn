"use client";
import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer
      style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-default)',
        padding: 'var(--space-6)',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--content-max-w)',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '14px' }}>
            zkTLS
          </span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
            C2C Exchange · Semi-decentralized · Powered by TLSNotary
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 'var(--space-6)' }}>
          {[
            { label: 'Trade', href: '/trade/express' },
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Merchant', href: '/merchant' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          © {new Date().getFullYear()} zkTLS C2C
        </span>
      </div>
    </footer>
  );
}
