"use client";
import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { useNetwork, isNetworkConfigured } from '@/contexts/NetworkContext';

export default function NetworkSelector() {
    const { network, walletChainId, isChainMismatch, switchNetwork, availableNetworks } = useNetwork();
    const [showDropdown, setShowDropdown] = useState(false);

    const configured = availableNetworks.filter(isNetworkConfigured);
    const unconfigured = availableNetworks.filter((n) => !isNetworkConfigured(n));

    const handleSelect = async (chainId: number) => {
        setShowDropdown(false);
        await switchNetwork(chainId);
    };

    const triggerLabel = isChainMismatch ? 'Wrong Network' : network.name;
    const triggerColor = isChainMismatch ? 'var(--status-warning, #f59e0b)' : 'var(--text-primary)';
    const triggerBorder = isChainMismatch ? 'rgba(245,158,11,0.5)' : 'var(--border-default)';

    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setShowDropdown((v) => !v)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    height: '36px',
                    padding: '0 var(--space-3)',
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${triggerBorder}`,
                    borderRadius: 'var(--radius-md)',
                    color: triggerColor,
                    fontFamily: 'var(--font-ui)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'border-color var(--motion-fast)',
                    whiteSpace: 'nowrap',
                }}
            >
                <span
                    style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: isChainMismatch
                            ? 'var(--status-warning, #f59e0b)'
                            : network.isTestnet
                                ? 'var(--status-info, #3b82f6)'
                                : 'var(--status-success, #22c55e)',
                        flexShrink: 0,
                    }}
                />
                {isChainMismatch && <AlertTriangle size={13} strokeWidth={1.5} />}
                {triggerLabel}
                <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
            </button>

            {showDropdown && (
                <>
                    {/* backdrop to close on outside click */}
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                        onClick={() => setShowDropdown(false)}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 'calc(100% + 6px)',
                            zIndex: 200,
                            minWidth: '220px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-2)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}
                    >
                        {isChainMismatch && walletChainId !== null && (
                            <div
                                style={{
                                    padding: 'var(--space-2) var(--space-3)',
                                    marginBottom: 'var(--space-1)',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(245,158,11,0.1)',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    fontSize: '11px',
                                    color: 'var(--status-warning, #f59e0b)',
                                    lineHeight: 1.4,
                                }}
                            >
                                Wallet is on chain {walletChainId}; app is set to {network.name}
                            </div>
                        )}

                        {configured.length > 0 && (
                            <>
                                <div
                                    style={{
                                        padding: '4px var(--space-3)',
                                        fontSize: '11px',
                                        color: 'var(--text-tertiary)',
                                        fontWeight: 600,
                                        letterSpacing: '0.05em',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Deployed
                                </div>
                                {configured.map((n) => (
                                    <NetworkOption
                                        key={n.chainId}
                                        name={n.name}
                                        chainId={n.chainId}
                                        isTestnet={n.isTestnet}
                                        isActive={n.chainId === network.chainId}
                                        disabled={false}
                                        onSelect={handleSelect}
                                    />
                                ))}
                            </>
                        )}

                        {unconfigured.length > 0 && (
                            <>
                                <div
                                    style={{
                                        padding: '4px var(--space-3)',
                                        marginTop: configured.length > 0 ? 'var(--space-2)' : 0,
                                        fontSize: '11px',
                                        color: 'var(--text-tertiary)',
                                        fontWeight: 600,
                                        letterSpacing: '0.05em',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Not configured
                                </div>
                                {unconfigured.map((n) => (
                                    <NetworkOption
                                        key={n.chainId}
                                        name={n.name}
                                        chainId={n.chainId}
                                        isTestnet={n.isTestnet}
                                        isActive={false}
                                        disabled
                                        onSelect={handleSelect}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function NetworkOption({
    name,
    chainId,
    isTestnet,
    isActive,
    disabled,
    onSelect,
}: {
    name: string;
    chainId: number;
    isTestnet: boolean;
    isActive: boolean;
    disabled: boolean;
    onSelect: (id: number) => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onSelect(chainId)}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                background: isActive ? 'rgba(80,210,193,0.10)' : 'none',
                border: 'none',
                color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: disabled ? 0.5 : 1,
            }}
        >
            <span
                style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: disabled
                        ? 'var(--text-tertiary)'
                        : isTestnet
                            ? 'var(--status-info, #3b82f6)'
                            : 'var(--status-success, #22c55e)',
                }}
            />
            <span style={{ flex: 1 }}>{name}</span>
            {isTestnet && !disabled && (
                <span
                    style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'rgba(59,130,246,0.15)',
                        color: 'var(--status-info, #3b82f6)',
                        fontWeight: 600,
                    }}
                >
                    TESTNET
                </span>
            )}
            {isActive && (
                <Check size={13} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />
            )}
        </button>
    );
}
