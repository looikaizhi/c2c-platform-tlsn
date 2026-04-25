"use client";

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Address } from 'viem';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWallet } from '@/hooks/useWallet';
import { AssetType, calculateDeadline, generateSalt, toRate, toTokenAmount } from '@/lib/orderHelpers';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { PlaceOrderSuccessResult } from './p2p/types';

interface PlaceOrderModalProps {
    merchant: Address;
    productId: bigint;
    assetType: AssetType;
    displayRate: number;
    fiatName: string;
    cryptoName: string;
    minAmount: number;
    maxAmount: number;
    onClose: () => void;
    onSuccess: (result: PlaceOrderSuccessResult) => void;
}

type ModalPhase = 'idle' | 'signing' | 'placing' | 'success' | 'error';

export default function PlaceOrderModal({
    merchant,
    productId,
    assetType,
    displayRate,
    fiatName,
    cryptoName,
    minAmount,
    maxAmount,
    onClose,
    onSuccess,
}: PlaceOrderModalProps) {
    const orderFlow = useOrderFlow();
    const wallet = useWallet();
    const [amount, setAmount] = useState('');

    const numAmount = parseFloat(amount) || 0;
    const tokenAmount = displayRate > 0 ? numAmount / displayRate : 0;
    const isValid = numAmount >= minAmount && numAmount <= maxAmount && wallet.isConnected;

    const isBuy = assetType === AssetType.CRYPTO;
    const phase: ModalPhase = orderFlow.status === 'idle' ? 'idle'
        : orderFlow.status === 'signing' ? 'signing'
        : orderFlow.status === 'placing' ? 'placing'
        : orderFlow.status === 'success' ? 'success'
        : orderFlow.status === 'error' ? 'error'
        : 'idle';

    const isProcessing = phase === 'signing' || phase === 'placing';

    const handlePlaceOrder = async () => {
        if (!wallet.address || !isValid) return;
        const order = {
            merchant,
            buyer: wallet.address as Address,
            productID: productId,
            assetType,
            amount: toTokenAmount(tokenAmount),
            rate: toRate(displayRate),
            salt: generateSalt(),
            deadline: calculateDeadline(15),
        };
        const result = await orderFlow.placeOrder(order, wallet.selectedWallet?.provider);
        if (result.ok) {
            onSuccess({ orderId: 0n, fiatAmount: numAmount });
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            padding: 'var(--space-4)',
        }}>
            <Card variant="elevated" padding="none" style={{ width: '100%', maxWidth: '480px' }}>

                {/* ── Header ──────────────────────────────────────────── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-4)', borderBottom: '1px solid var(--border-default)',
                }}
                    role="dialog" aria-modal="true" aria-labelledby="place-order-title"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <h3 id="place-order-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            {isBuy ? 'Buy' : 'Sell'} {cryptoName}
                        </h3>
                        <Badge variant={isBuy ? 'buy' : 'sell'}>{isBuy ? 'Buy' : 'Sell'}</Badge>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* ── Body ────────────────────────────────────────────── */}
                <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

                    {/* Merchant info row */}
                    <div style={{
                        padding: 'var(--space-3)', background: 'var(--bg-base)',
                        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px',
                    }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Merchant</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                            {merchant.slice(0, 6)}…{merchant.slice(-4)}
                        </span>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border-default)' }} />

                    {/* You pay input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            You pay ({fiatName})
                        </label>
                        <div style={{
                            display: 'flex', alignItems: 'center', height: '48px',
                            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            transition: 'border-color var(--motion-fast)',
                        }}
                            onFocusCapture={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-active)'; }}
                            onBlurCapture={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)'; }}
                        >
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder={`${minAmount} – ${maxAmount}`}
                                disabled={isProcessing}
                                style={{
                                    flex: 1, height: '100%', padding: '0 var(--space-3)',
                                    background: 'transparent', border: 'none', outline: 'none',
                                    fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-mono)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                            <span style={{
                                padding: '0 var(--space-3)', color: 'var(--text-secondary)',
                                fontSize: '13px', fontWeight: 600, flexShrink: 0,
                            }}>
                                {fiatName}
                            </span>
                        </div>
                        {numAmount > 0 && numAmount < minAmount && (
                            <span role="alert" style={{ fontSize: '12px', color: 'var(--status-danger)' }}>
                                Min {minAmount} {fiatName}
                            </span>
                        )}
                        {numAmount > maxAmount && (
                            <span role="alert" style={{ fontSize: '12px', color: 'var(--status-danger)' }}>
                                Max {maxAmount} {fiatName}
                            </span>
                        )}
                    </div>

                    {/* You get row */}
                    {numAmount > 0 && displayRate > 0 && (
                        <div style={{
                            padding: 'var(--space-3)', background: 'var(--bg-base)',
                            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                You {isBuy ? 'get' : 'pay'}
                            </span>
                            <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700,
                                color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)',
                            }}>
                                {tokenAmount.toFixed(4)} {cryptoName}
                            </span>
                        </div>
                    )}

                    {/* Rate + limits info */}
                    <div style={{
                        padding: 'var(--space-3)', background: 'var(--bg-base)',
                        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: '13px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Rate</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>
                                1 {cryptoName} = {displayRate.toFixed(2)} {fiatName}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Limits</span>
                            <span style={{ color: 'var(--text-primary)' }}>
                                {minAmount.toLocaleString()} – {maxAmount.toLocaleString()} {fiatName}
                            </span>
                        </div>
                    </div>

                    {/* Wallet not connected */}
                    {!wallet.isConnected && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)',
                            fontSize: '13px', color: 'var(--status-warning)',
                        }}>
                            Connect wallet to place order
                        </div>
                    )}

                    {/* Status messages */}
                    {phase === 'signing' && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-info-bg)', border: '1px solid var(--status-info)',
                            fontSize: '13px', color: 'var(--status-info)',
                        }}>
                            <Spinner size="sm" />
                            Confirm in wallet…
                        </div>
                    )}

                    {phase === 'placing' && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-info-bg)', border: '1px solid var(--status-info)',
                            fontSize: '13px', color: 'var(--status-info)',
                        }}>
                            <Spinner size="sm" />
                            Submitting to chain…
                        </div>
                    )}

                    {phase === 'success' && (
                        <div style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-success-bg)', border: '1px solid var(--status-success)',
                            fontSize: '13px', color: 'var(--status-success)',
                        }}>
                            Order placed! View in Dashboard →
                        </div>
                    )}

                    {phase === 'error' && orderFlow.error && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                            fontSize: '13px', color: 'var(--status-danger)',
                        }}>
                            {orderFlow.error}
                        </div>
                    )}

                    <div style={{ height: '1px', background: 'var(--border-default)' }} />

                    {/* CTA buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {phase === 'success' ? (
                            <Button variant="ghost" fullWidth onClick={onClose}>Close</Button>
                        ) : (
                            <>
                                <Button
                                    variant={isBuy ? 'buy' : 'sell'}
                                    size="lg"
                                    fullWidth
                                    onClick={handlePlaceOrder}
                                    disabled={!isValid || isProcessing}
                                    loading={isProcessing}
                                >
                                    {isProcessing ? 'Processing…' : `Confirm Order →`}
                                </Button>
                                <Button variant="ghost" fullWidth onClick={onClose} disabled={isProcessing}>
                                    Cancel
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
