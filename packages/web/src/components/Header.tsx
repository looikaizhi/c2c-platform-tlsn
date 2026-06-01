"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import WalletConnect from "./WalletConnect";
import NetworkSelector from "./NetworkSelector";
import { useIsAdmin } from "@/hooks/useIsAdmin";

type NavItem = {
  href: string;
  label: string;
  match: RegExp;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { label: 'Trade',     href: '/trade/express', match: /^\/trade/ },
  { label: 'Dashboard', href: '/dashboard',      match: /^\/dashboard/ },
  { label: 'Merchant',  href: '/merchant',       match: /^\/merchant/ },
  { label: 'Admin',     href: '/admin',          match: /^\/admin/, adminOnly: true },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useIsAdmin();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 'var(--header-h)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-6)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          maxWidth: 'var(--content-max-w)',
          margin: '0 auto',
          gap: 'var(--space-8)',
        }}
      >
        {/* Logo */}
        <Link
          href="/trade/express"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(80,210,193,0.12)',
              border: '1px solid rgba(80,210,193,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)',
            }}
          >
            <ShieldCheck size={18} strokeWidth={1.5} />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '15px',
              color: 'var(--color-primary)',
              letterSpacing: '0.02em',
            }}
          >
            zkTLS <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>C2C</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="Primary"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flex: 1 }}
          className="header-desktop-nav"
        >
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const active = item.match.test(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 'var(--header-h)',
                  padding: '0 var(--space-4)',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom: active
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                  textDecoration: 'none',
                  transition: 'color var(--motion-fast), border-color var(--motion-fast)',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Wallet + mobile hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginLeft: 'auto' }}>
          <span className="header-network-desktop" style={{ display: 'inline-flex' }}>
            <NetworkSelector />
          </span>
          <WalletConnect />

          {/* Mobile hamburger */}
          <button
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="header-mobile-btn"
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <Menu size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed',
            top: 'var(--header-h)',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-surface)',
            zIndex: 99,
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {/* Network selector lives in the drawer on mobile (hidden in the bar) */}
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <NetworkSelector />
          </div>
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const active = item.match.test(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '15px',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-primary)' : 'var(--text-primary)',
                  background: active ? 'rgba(80,210,193,0.10)' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .header-desktop-nav { display: none !important; }
          .header-mobile-btn  { display: flex !important; }
          .header-network-desktop { display: none !important; }
        }
      `}</style>
    </header>
  );
}
