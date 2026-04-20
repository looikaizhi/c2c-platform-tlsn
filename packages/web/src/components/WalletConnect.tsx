"use client";

import { useState } from 'react';
import { ChevronDown, Plug, Unplug, Wallet } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import ActionButton from './ui/ActionButton';
import StatusPill from './ui/StatusPill';

export default function WalletConnect() {
    const {
        address,
        chainId,
        isConnected,
        wallets,
        isConnecting,
        error,
        connect,
        disconnect,
    } = useWallet();
    const [showDropdown, setShowDropdown] = useState(false);

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    if (isConnected && address) {
        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--bg-surface-2)] px-3 text-sm font-medium text-white transition-all duration-[var(--motion-fast)] hover:border-[color:rgb(240_185_11_/_65%)]"
                >
                    <StatusPill label="Wallet" tone="success" />
                    <span>{formatAddress(address)}</span>
                    {chainId && <span className="hidden text-xs text-[var(--text-muted)] sm:inline">#{chainId}</span>}
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                </button>

                {showDropdown && (
                    <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-1.5 shadow-2xl">
                        <div className="break-all rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-1)] px-3 py-2 text-xs text-[var(--text-subtle)]">
                            {address}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                disconnect();
                                setShowDropdown(false);
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--state-danger)] transition-colors hover:bg-[color:rgb(127_29_29_/_34%)]"
                        >
                            <Unplug className="h-4 w-4" />
                            断开连接 Disconnect
                        </button>
                    </div>
                )}
                {error && <div className="absolute right-0 mt-1 whitespace-nowrap text-xs text-[var(--state-danger)]">{error}</div>}
            </div>
        );
    }

    if (wallets.length === 0) {
        return (
            <div className="relative">
                <ActionButton disabled tone="ghost" className="h-11 px-4 text-xs">
                    未检测到钱包 No Wallet
                </ActionButton>
                {error && <div className="absolute right-0 mt-1 whitespace-nowrap text-xs text-[var(--state-danger)]">{error}</div>}
            </div>
        );
    }

    if (wallets.length === 1) {
        return (
            <div className="relative">
                <ActionButton
                    onClick={() => connect(wallets[0])}
                    disabled={isConnecting}
                    className="inline-flex h-11 items-center gap-2 px-4"
                >
                    <Wallet className="h-4 w-4" />
                    {isConnecting ? '连接中...' : '连接钱包 Connect'}
                </ActionButton>
                {error && <div className="absolute right-0 mt-1 whitespace-nowrap text-xs text-[var(--state-danger)]">{error}</div>}
            </div>
        );
    }

    return (
        <div className="relative">
            <ActionButton
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={isConnecting}
                className="inline-flex h-11 items-center gap-2 px-4"
            >
                <Plug className="h-4 w-4" />
                {isConnecting ? '连接中...' : '连接钱包 Connect'}
            </ActionButton>
            {showDropdown && (
                <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-1.5 shadow-2xl">
                    <div className="mb-1 rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-1)] px-3 py-2 text-xs text-[var(--text-muted)]">选择钱包 Select Wallet</div>
                    {wallets.map((w) => (
                        <button
                            type="button"
                            key={w.info.uuid}
                            onClick={() => {
                                connect(w);
                                setShowDropdown(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-white transition-colors hover:bg-[var(--bg-surface-3)]"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={w.info.icon} alt={w.info.name} className="h-6 w-6 rounded" />
                            <span>{w.info.name}</span>
                        </button>
                    ))}
                </div>
            )}
            {error && <div className="absolute right-0 mt-1 whitespace-nowrap text-xs text-[var(--state-danger)]">{error}</div>}
        </div>
    );
}
