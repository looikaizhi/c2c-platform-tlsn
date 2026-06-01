"use client";
import { useState } from 'react';
import { Check, Copy, Wallet as WalletIcon } from 'lucide-react';
import { type Address } from 'viem';
import { useWallet } from '@/hooks/useWallet';
import { useNetwork } from '@/contexts/NetworkContext';
import { Card } from '@/components/ui/Card';

interface Props {
    address: Address;
}

function shortAddress(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function UserWalletCard({ address }: Props) {
    const wallet = useWallet();
    const { network, walletChainId, isChainMismatch } = useNetwork();
    const [copied, setCopied] = useState(false);

    const walletName = wallet.selectedWallet?.info.name ?? 'Browser wallet';
    const walletIcon = wallet.selectedWallet?.info.icon;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard denied */ }
    };

    return (
        <Card padding="none" className="card-glow flex flex-wrap items-center gap-3 px-4 py-2.5">
            {/* Wallet provider icon — EIP-6963 if available, else generic Wallet icon */}
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[var(--line-soft)] bg-[var(--bg-surface-2)]">
                {walletIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={walletIcon} alt={walletName} className="h-4 w-4 rounded" />
                ) : (
                    <WalletIcon size={14} className="text-[var(--text-muted)]" />
                )}
            </div>

            {/* Wallet provider name */}
            <span className="text-sm font-semibold text-[var(--text-primary)]">{walletName}</span>

            <span className="text-[var(--text-muted)]">·</span>

            {/* Address + copy button */}
            <button
                type="button"
                onClick={handleCopy}
                title="Copy address"
                aria-label={`Copy ${address}`}
                className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cta)]"
            >
                <span className="tabular-nums">{shortAddress(address)}</span>
                {copied
                    ? <Check size={12} className="text-[var(--status-success)]" />
                    : <Copy  size={12} className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" />}
            </button>

            {/* Network badge */}
            <span
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
                style={{
                    color:      isChainMismatch ? 'var(--status-danger)' : 'var(--status-success)',
                    background: isChainMismatch ? 'var(--status-danger-bg)' : 'var(--status-success-bg)',
                    borderColor: isChainMismatch ? 'var(--status-danger)' : 'transparent',
                }}
            >
                <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                        background: isChainMismatch ? 'var(--status-danger)' : 'var(--status-success)',
                        boxShadow:  isChainMismatch ? '0 0 6px var(--status-danger)' : '0 0 6px var(--status-success)',
                    }}
                />
                <span>{network.name}</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="font-mono tabular-nums text-[var(--text-muted)]">#{walletChainId ?? network.chainId}</span>
            </span>
        </Card>
    );
}
