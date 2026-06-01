"use client";

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Shield } from 'lucide-react';
import WalletConnect from '@/components/WalletConnect';

export interface NotConnectedFeature {
    icon: LucideIcon;
    label: string;
}

interface NotConnectedPlaceholderProps {
    title?: string;
    description?: string;
    features?: NotConnectedFeature[];
    footerNote?: string;
}

export default function NotConnectedPlaceholder({
    title = 'Connect your wallet',
    description = 'Connect your wallet to continue.',
    features = [],
    footerNote = 'zkTLS · Hardhat Local',
}: NotConnectedPlaceholderProps) {
    return (
        <main className="ambient-page screen-fixed flex w-full items-center justify-center px-4 py-5 sm:px-6">
            <section
                aria-labelledby="notconnected-title"
                style={{
                    width: '100%',
                    maxWidth: '460px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-8)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: 'var(--space-4)',
                }}
            >
                <div
                    aria-hidden="true"
                    style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: 'var(--radius-full)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(80, 210, 193, 0.08)',
                        border: '1px solid rgba(80, 210, 193, 0.24)',
                        boxShadow: '0 0 32px rgba(80, 210, 193, 0.18)',
                    }}
                >
                    <Shield size={36} strokeWidth={1.5} color="var(--color-primary)" />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <h2
                        id="notconnected-title"
                        style={{
                            margin: 0,
                            fontSize: '17px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.01em',
                        }}
                    >
                        {title}
                    </h2>
                    <p
                        style={{
                            margin: 0,
                            fontSize: '13px',
                            lineHeight: 1.55,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {description}
                    </p>
                </div>

                <div style={{ marginTop: 'var(--space-1)' }}>
                    <WalletConnect />
                </div>

                {features.length > 0 && (
                    <>
                        <div
                            aria-hidden="true"
                            style={{
                                width: '100%',
                                height: '1px',
                                background: 'var(--line-soft)',
                                marginTop: 'var(--space-2)',
                            }}
                        />
                        <ul
                            style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 'var(--space-2)',
                                textAlign: 'left',
                            }}
                        >
                            {features.map(({ icon: Icon, label }) => (
                                <li
                                    key={label}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-3)',
                                        fontSize: '13px',
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    <Icon
                                        size={16}
                                        strokeWidth={1.75}
                                        color="var(--color-primary)"
                                        aria-hidden="true"
                                    />
                                    <span>{label}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {footerNote && (
                    <div
                        style={{
                            marginTop: 'var(--space-2)',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            letterSpacing: '0.02em',
                        }}
                    >
                        {footerNote}
                    </div>
                )}
            </section>
        </main>
    );
}
