"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type TradingTab = 'express' | 'p2p' | 'bulk';

interface TradingLayoutProps {
  activeTab: TradingTab;
  children: React.ReactNode;
}

const tabs: Array<{ key: TradingTab; label: string; href: string }> = [
  { key: 'express', label: 'Express',   href: '/trade/express' },
  { key: 'p2p',     label: 'P2P',       href: '/trade/p2p' },
  { key: 'bulk',    label: 'Block',     href: '/trade/bulk' },
];

const quickLinks = [
  { label: 'My Orders', href: '/dashboard' },
  { label: 'User Center', href: '/merchant' },
];

export function TradingLayout({ activeTab, children }: TradingLayoutProps) {
  const pathname = usePathname();
  void pathname;

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - var(--header-h))',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          position: 'sticky',
          top: 'var(--header-h)',
          zIndex: 50,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div
          className="trading-tabbar-inner"
          style={{
            maxWidth: 'var(--content-max-w)',
            margin: '0 auto',
            padding: '0 var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 'var(--tab-bar-h)',
          }}
        >
          {/* Mode tabs */}
          <nav role="tablist" aria-label="Trade modes" style={{ display: 'flex', height: '100%' }}>
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  role="tab"
                  aria-selected={isActive}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '100%',
                    padding: '0 var(--space-5)',
                    fontSize: '15px',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderBottom: isActive
                      ? '2px solid var(--color-primary)'
                      : '2px solid transparent',
                    textDecoration: 'none',
                    transition: 'color var(--motion-fast), border-color var(--motion-fast)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Quick actions — hidden on mobile (reachable via header drawer) */}
          <div className="trading-quick-actions" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                  transition: 'color var(--motion-fast)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Page content — fills exactly one viewport on desktop */}
      <div
        className="screen-fixed-tabbed"
        style={{
          maxWidth: 'var(--content-max-w)',
          margin: '0 auto',
          width: '100%',
          padding: 'var(--space-5) var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>

      <style>{`
        @media (max-width: 767px) {
          .trading-quick-actions { display: none !important; }
          .trading-tabbar-inner { padding: 0 var(--space-4) !important; }
        }
      `}</style>
    </div>
  );
}
