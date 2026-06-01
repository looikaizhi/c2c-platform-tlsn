"use client";

import { useEffect, useRef } from 'react';
import { X, Wallet } from 'lucide-react';
import WalletConnect from '@/components/WalletConnect';
import { Card } from '@/components/ui/Card';

interface WalletGateModalProps {
    onClose: () => void;
}

export default function WalletGateModal({ onClose }: WalletGateModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    // Close on ESC
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Focus trap: move focus into dialog on mount
    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                padding: 'var(--space-4)',
                animation: 'walletGateFadeIn 0.15s ease-out',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <style>{`
                @keyframes walletGateFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>

            <Card
                variant="elevated"
                padding="none"
                style={{ width: '100%', maxWidth: '400px', outline: 'none' }}
            >
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="wallet-gate-title"
                    tabIndex={-1}
                    style={{ outline: 'none' }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: 'var(--space-4)', borderBottom: '1px solid var(--border-default)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <Wallet style={{ width: '16px', height: '16px', color: 'var(--text-subtle)' }} />
                            <h3 id="wallet-gate-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                Connect Wallet
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                minWidth: '44px', minHeight: '44px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                            A wallet connection is required to perform this action.
                        </p>

                        <WalletConnect />

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cancel"
                            style={{
                                minHeight: '44px', width: '100%',
                                background: 'none', border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                color: 'var(--text-secondary)', fontSize: '14px',
                                transition: 'border-color var(--motion-fast), color var(--motion-fast)',
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-active)';
                                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
                                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
