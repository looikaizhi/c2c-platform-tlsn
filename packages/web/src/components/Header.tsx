"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Globe, Moon, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import WalletConnect from "./WalletConnect";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/trade/express",
    label: "Trade",
    isActive: (pathname) => pathname === "/" || pathname.startsWith("/trade"),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    isActive: (pathname) => pathname.startsWith("/dashboard"),
  },
  {
    href: "/merchant",
    label: "Merchant",
    isActive: (pathname) => pathname.startsWith("/merchant"),
  },
  {
    href: "/admin",
    label: "Admin",
    isActive: (pathname) => pathname.startsWith("/admin"),
  },
];

function IconAction({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-soft)] hover:bg-[var(--bg-surface-1)] hover:text-white"
    >
      {children}
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line-soft)] bg-[color:rgb(24_26_32_/_97%)]">
      <div className="flex w-full justify-center px-4 sm:px-6">
        <div className="flex h-16 w-full max-w-[1280px] items-center gap-3">
          <Link href="/trade/express" className="flex min-w-fit items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:rgb(240_185_11_/_40%)] bg-[color:rgb(240_185_11_/_12%)] text-[var(--accent-cta)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent-cta)]">ZKTLS</p>
              <p className="text-sm font-medium text-white">C2C Exchange</p>
            </div>
          </Link>

          <nav className="ml-6 flex flex-1 items-center gap-3" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-11 w-[124px] items-center justify-center rounded-lg border text-[15px] font-medium transition-all duration-[var(--motion-fast)] ${
                    active
                      ? "border-[color:rgb(240_185_11_/_48%)] bg-[color:rgb(240_185_11_/_12%)] text-white"
                      : "border-transparent text-[var(--text-secondary)] hover:border-[var(--line-soft)] hover:bg-[var(--bg-surface-2)] hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <IconAction label="Search">
              <Search className="h-4 w-4" />
            </IconAction>
            <IconAction label="Notifications">
              <Bell className="h-4 w-4" />
            </IconAction>
            <IconAction label="Language">
              <Globe className="h-4 w-4" />
            </IconAction>
            <IconAction label="Theme">
              <Moon className="h-4 w-4" />
            </IconAction>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMoreOpen((prev) => !prev)}
                aria-expanded={isMoreOpen}
                aria-haspopup="menu"
                aria-label="Open More Menu"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-transparent px-2.5 text-sm text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-soft)] hover:bg-[var(--bg-surface-1)] hover:text-white"
              >
                More
                <ChevronDown className="h-4 w-4" />
              </button>

              {isMoreOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-44 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-1.5 shadow-2xl"
                >
                  <a
                    href="#"
                    role="menuitem"
                    className="block rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-3)] hover:text-white"
                  >
                    Docs 文档
                  </a>
                  <a
                    href="#"
                    role="menuitem"
                    className="block rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-3)] hover:text-white"
                  >
                    Community 社区
                  </a>
                </div>
              )}
            </div>

            <div className="ml-1">
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
