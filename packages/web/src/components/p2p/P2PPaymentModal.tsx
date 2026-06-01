"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Clock3, Globe2, X } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWallet } from '@/hooks/useWallet';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { ProofPanel } from '@/components/proof/ProofPanel';
import { PayeeCard } from '@/components/binding/PayeeCard';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';
import type { Address as ViemAddress } from 'viem';

interface P2PPaymentModalProps {
    dbOrderId: number;
    merchant: Address;
    productId: bigint;
    onChainOrderId: bigint;
    /** 0=CRYPTO product (user is buying crypto, paying fiat) · 1=FIAT product (user is selling crypto, awaiting fiat). */
    assetType: 0 | 1;
    isBuy: boolean;
    cryptoName: string;
    fiatCurrency: string;
    fiatAmount: number;
    /** Unix seconds — from OrderPlaced event. */
    deadline: bigint;
    /** keccak256("wise" | "alipay") — fixed by the merchant's product. */
    platformId: Hex;
    onClose: () => void;
    /** Fired when the buyer-side proof has been submitted on-chain (or sell-side has been settled). */
    onCompleted?: () => void;
    /** Token address for BondVault claim (V4). Defaults to zero address if not provided. */
    bondTokenAddress?: ViemAddress;
}

function formatFiatAmount(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function resolvePlatform(platformId: Hex): { key: 'wise' | 'alipay'; label: string; Icon: typeof Globe2 } | null {
    if (platformId === PLATFORM_WISE) return { key: 'wise', label: 'Wise', Icon: Globe2 };
    if (platformId === PLATFORM_ALIPAY) return { key: 'alipay', label: 'Alipay', Icon: BadgeDollarSign };
    return null;
}

export default function P2PPaymentModal({
    dbOrderId,
    merchant,
    productId,
    onChainOrderId,
    assetType,
    isBuy,
    cryptoName,
    fiatCurrency,
    fiatAmount,
    deadline,
    platformId,
    onClose,
    onCompleted,
    bondTokenAddress = '0x0000000000000000000000000000000000000000',
}: P2PPaymentModalProps) {
    const orderFlow = useOrderFlow();
    const wallet = useWallet();
    const { network } = useNetwork();
    const [isExpired, setIsExpired] = useState(false);
    const [nowOffsetSeconds, setNowOffsetSeconds] = useState(0);

    const formattedAmount = useMemo(() => formatFiatAmount(fiatAmount, fiatCurrency), [fiatAmount, fiatCurrency]);
    const platform = useMemo(() => resolvePlatform(platformId), [platformId]);

    // Hardhat / anvil block.timestamp can drift ahead of wall-clock; compute skew once
    // so the Countdown matches what the contract will enforce via block.timestamp.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const client = getPublicClient(network.chainId);
                const block = await client.getBlock({ blockTag: 'latest' });
                if (cancelled) return;
                const chainTs = Number(block.timestamp);
                const localTs = Math.floor(Date.now() / 1000);
                setNowOffsetSeconds(chainTs - localTs);
            } catch { /* fall back to wall-clock */ }
        })();
        return () => { cancelled = true; };
    }, [network]);

    const canClaimRefund = bondTokenAddress !== '0x0000000000000000000000000000000000000000';

    const handleClaimRefund = async () => {
        if (!canClaimRefund) return;
        await orderFlow.claimRefund(bondTokenAddress as ViemAddress);
    };

    const title = isBuy ? `Buy ${cryptoName}` : `Sell ${cryptoName}`;
    const subtitle = isBuy
        ? isExpired
            ? 'Order expired'
            : 'Awaiting your payment'
        : isExpired
            ? 'Order expired'
            : 'Awaiting merchant confirmation';

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            padding: 'var(--space-4)',
        }}>
            <Card variant="elevated" padding="none" style={{ width: '100%', maxWidth: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="p2p-payment-title"
                    style={{
                        borderBottom: '1px solid var(--border-default)',
                        padding: 'var(--space-4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        flexShrink: 0,
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 id="p2p-payment-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            {title} · Order #{onChainOrderId.toString()}
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {subtitle}
                        </p>
                    </div>
                    {deadline > 0n && (
                        <Countdown
                            deadline={deadline}
                            nowOffsetSeconds={nowOffsetSeconds}
                            onExpire={() => setIsExpired(true)}
                        />
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close payment flow"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body — scroll if it overflows */}
                <div style={{
                    padding: 'var(--space-5)',
                    display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
                    overflowY: 'auto',
                }}>
                    {/* Amount card */}
                    <div style={{
                        padding: 'var(--space-4)',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
                    }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {isBuy ? 'Amount to pay' : 'Amount to receive'}
                        </span>
                        <span style={{
                            fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)',
                            fontFamily: 'var(--font-mono)',
                        }}>
                            {formattedAmount}
                        </span>
                        {platform && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--space-2)' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>via</span>
                                <Badge variant="info">
                                    <platform.Icon size={12} style={{ marginRight: 4 }} />
                                    {platform.label}
                                </Badge>
                            </div>
                        )}
                    </div>

                    {/* Buy-side (CRYPTO product): user pays fiat, then proves */}
                    {isBuy && assetType === 0 && (
                        <>
                            {/* Counterparty (merchant) Wise/Alipay identity, anchored on-chain */}
                            <PayeeCard
                                role="payee"
                                merchant={merchant}
                                productId={productId}
                                assetType={0}
                                orderId={onChainOrderId}
                            />
                            {isExpired ? (
                                <div role="alert" style={{
                                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                                    fontSize: '13px', color: 'var(--status-danger)',
                                }}>
                                    This order has expired. You can resume claim/refund from the Dashboard.
                                </div>
                            ) : (
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                                    Transfer the amount above to the merchant on {platform?.label ?? 'the payment platform'},
                                    then click below — the plugin will detect this transfer and submit an on-chain proof.
                                </p>
                            )}

                            {platform ? (
                                <ProofPanel
                                    platform={platform.key}
                                    direction="crypto"
                                    merchant={merchant}
                                    productId={productId}
                                    orderId={onChainOrderId}
                                    assetType={0}
                                    disabled={isExpired}
                                    onProofSubmitted={() => onCompleted?.()}
                                />
                            ) : (
                                <div role="alert" style={{
                                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)',
                                    fontSize: '13px', color: 'var(--status-warning)',
                                }}>
                                    Unsupported platform on this product: {platformId.slice(0, 10)}…
                                </div>
                            )}
                        </>
                    )}

                    {/* Sell-side (FIAT product): user has locked crypto, waits for merchant proof */}
                    {!isBuy && assetType === 1 && (
                        <>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                                Your {cryptoName} is locked in escrow. The merchant must pay you on{' '}
                                {platform?.label ?? 'the platform'} and submit an on-chain proof before the deadline.
                            </p>

                            <div style={{
                                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                                background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)',
                                fontSize: '12px', color: 'var(--status-warning)',
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}>
                                <Clock3 size={14} />
                                If the merchant does not confirm in time, you can claim a 2× timeout compensation.
                            </div>

                            {orderFlow.txHash && (
                                <div aria-live="polite" style={{
                                    padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--status-success-bg)', border: '1px solid var(--status-success)',
                                    fontSize: '12px', color: 'var(--status-success)', wordBreak: 'break-all',
                                }}>
                                    Lock TX: {orderFlow.txHash}
                                </div>
                            )}

                            {orderFlow.error && (
                                <div role="alert" aria-live="assertive" style={{
                                    padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                                    fontSize: '12px', color: 'var(--status-danger)', wordBreak: 'break-all',
                                }}>
                                    {orderFlow.error}
                                </div>
                            )}

                            <Button
                                variant="danger"
                                fullWidth
                                onClick={handleClaimRefund}
                                disabled={orderFlow.status === 'claiming' || !canClaimRefund || !isExpired}
                            >
                                {orderFlow.status === 'claiming'
                                    ? 'Processing…'
                                    : !canClaimRefund
                                        ? 'Compensation token address not configured'
                                        : isExpired
                                            ? 'Claim timeout compensation (2×)'
                                            : 'Claim available after deadline'}
                            </Button>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    borderTop: '1px solid var(--border-default)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        You can resume this order from the Dashboard.
                    </span>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        {dbOrderId > 0 && (
                            <Link
                                href={`/orders/${dbOrderId}`}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    height: '32px', padding: '0 12px', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-default)',
                                    fontSize: '12px', color: 'var(--text-secondary)',
                                    textDecoration: 'none',
                                }}
                            >
                                View order detail
                            </Link>
                        )}
                        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
