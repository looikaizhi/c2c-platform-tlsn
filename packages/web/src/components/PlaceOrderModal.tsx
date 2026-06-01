"use client";

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import {
    formatUnits,
    type Address,
    type Address as ViemAddress,
    type Hex,
} from 'viem';
const ZERO_PLATFORM_ID = ('0x' + '0'.repeat(64)) as Hex;
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWallet } from '@/hooks/useWallet';
import { useNetwork } from '@/contexts/NetworkContext';
import { useMyBinding } from '@/hooks/useMyBinding';
import { AssetType, toTokenAmount } from '@/lib/orderHelpers';
import { C2C_RISK_MANAGER_ABI } from '@/lib/contractAbi';
import { getPublicClient } from '@/chain/clients';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { BindingSetupModal } from '@/components/binding/BindingSetupModal';
import type { PlaceOrderSuccessResult } from './p2p/types';

function platformLabel(platformId: Hex | null): string {
    if (!platformId) return 'platform';
    if (platformId.toLowerCase() === PLATFORM_WISE.toLowerCase()) return 'Wise';
    if (platformId.toLowerCase() === PLATFORM_ALIPAY.toLowerCase()) return 'Alipay';
    return 'platform';
}

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
    /** ERC-20 token address used for approve before placeOrder (V4). Zero address if unknown. */
    bondTokenAddress?: ViemAddress;
    /** Token decimal places — 18 for USDT, 6 for USDC. Defaults to 18. */
    tokenDecimals?: number;
    /** keccak256("wise" | "alipay") — product's platformId, baked into onSuccess so the next step knows which plugin to launch. */
    platformId?: Hex;
}

type ModalPhase = 'idle' | 'placing' | 'success' | 'error';

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
    bondTokenAddress,
    tokenDecimals = 18,
    platformId,
}: PlaceOrderModalProps) {
    const orderFlow = useOrderFlow();
    const wallet = useWallet();
    const { network } = useNetwork();
    const [amount, setAmount] = useState('');
    const [bondBps, setBondBps] = useState<number | null>(null);
    const [bondBpsError, setBondBpsError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [bindModalOpen, setBindModalOpen] = useState(false);

    const numAmount = parseFloat(amount) || 0;
    const tokenAmount = displayRate > 0 ? numAmount / displayRate : 0;
    const hasBondToken = !!bondTokenAddress && bondTokenAddress !== '0x0000000000000000000000000000000000000000';
    const isBuy = assetType === AssetType.CRYPTO;

    // R4: defensive self-trade check (合约 also reverts SelfTradeNotAllowed)
    const isSelf = useMemo(
        () => !!wallet.address && wallet.address.toLowerCase() === merchant.toLowerCase(),
        [wallet.address, merchant],
    );

    // R3: buyer must have an on-chain binding on this product's platform before
    // the contract will accept placeOrder. We auto-fill BuyerPaymentInfo from
    // the buyer's own binding commits (no plaintext entry — the user already
    // bound through BindingSetupModal).
    const effectivePlatformId: Hex | null =
        platformId && platformId !== ZERO_PLATFORM_ID ? platformId : null;
    const platformName = platformLabel(effectivePlatformId);
    const { binding, isLoading: bindingLoading } = useMyBinding(effectivePlatformId);
    const needsBinding = !!effectivePlatformId && !bindingLoading && !binding;

    const fiatFieldsOk = assetType !== AssetType.FIAT || !!binding;
    const isValid = numAmount >= minAmount
        && numAmount <= maxAmount
        && wallet.isConnected
        && hasBondToken
        && !bondBpsError
        && !isSelf
        && !needsBinding
        && fiatFieldsOk;

    // CRYPTO path: query requiredBondBps for current user.
    useEffect(() => {
        if (assetType !== AssetType.CRYPTO || !wallet.address) {
            setBondBps(null);
            setBondBpsError(null);
            return;
        }
        if (!network.contracts.c2cRiskManager || network.contracts.c2cRiskManager.length <= 2) return;
        const client = getPublicClient(network.chainId);
        client.readContract({
            address: network.contracts.c2cRiskManager,
            abi: C2C_RISK_MANAGER_ABI,
            functionName: 'requiredBondBps',
            args: [wallet.address as Address],
        }).then((bps) => {
            setBondBps(Number(bps));
            setBondBpsError(null);
        }).catch((err: any) => {
            const msg = err?.message ?? '';
            if (msg.includes('UserBlacklisted')) setBondBpsError('Account is blacklisted — cannot place order');
            else if (msg.includes('UserTemporarilyFrozen')) setBondBpsError('Account temporarily frozen — please wait');
            else setBondBpsError('Risk parameter lookup failed');
            setBondBps(null);
        });
    }, [wallet.address, assetType, network]);
    const phase: ModalPhase = orderFlow.status === 'idle' ? 'idle'
        : orderFlow.status === 'placing' ? 'placing'
        : orderFlow.status === 'success' ? 'success'
        : orderFlow.status === 'error' ? 'error'
        : 'idle';

    const isProcessing = phase === 'placing';

    const handlePlaceOrder = () => {
        if (!wallet.address || !isValid || !bondTokenAddress) return;
        setShowConfirm(true);
    };

    const handleConfirmed = async () => {
        if (!wallet.address || !isValid || !bondTokenAddress) return;
        setShowConfirm(false);

        let buyerInfo: { nameHash: Hex; idHash: Hex } | undefined;
        if (assetType === AssetType.FIAT) {
            // Contract requires _buyerInfo == buyer's on-chain platformBinding,
            // so we reuse the commits the user already set during binding.
            if (!binding) return;
            buyerInfo = {
                nameHash: binding.nameCommit,
                idHash:   binding.idCommit,
            };
        }

        const result = await orderFlow.placeOrder({
            merchant,
            productId,
            assetType,
            amount: toTokenAmount(tokenAmount, tokenDecimals),
            bondTokenAddress,
            buyerInfo,
        });
        if (result.ok) {
            onSuccess({
                orderId: result.orderId ?? 0n,
                fiatAmount: numAmount,
                deadline: result.deadline ?? 0n,
                platformId: platformId ?? ZERO_PLATFORM_ID,
            });
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

                    {/* Bond estimation (CRYPTO path) */}
                    {assetType === AssetType.CRYPTO && bondBps !== null && numAmount > 0 && (
                        <div style={{
                            padding: 'var(--space-3)', background: 'var(--bg-base)',
                            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px',
                        }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Estimated bond</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-warning)', fontWeight: 600 }}>
                                {formatUnits((toTokenAmount(tokenAmount, tokenDecimals) * BigInt(bondBps)) / 10000n, tokenDecimals)} {cryptoName}{' '}
                                <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({(bondBps / 100).toFixed(2)}%)</span>
                            </span>
                        </div>
                    )}
                    {bondBpsError && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                            fontSize: '13px', color: 'var(--status-danger)',
                        }}>
                            ⚠ {bondBpsError}
                        </div>
                    )}

                    {/* Self-trade defensive gate (contract reverts SelfTradeNotAllowed) */}
                    {isSelf && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                            fontSize: '13px', color: 'var(--status-danger)',
                        }}>
                            You cannot place an order on your own listing.
                        </div>
                    )}

                    {/* Binding gate — buyer must be bound on this platform before placeOrder */}
                    {!isSelf && needsBinding && (
                        <div style={{
                            padding: 'var(--space-3)',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-2)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ShieldAlert size={14} style={{ color: '#e0c060' }} />
                                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                                    {platformName} binding required
                                </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Bind your {platformName} account once and this order (plus all future {platformName} orders)
                                can be placed. Plaintext stays on the server; only the commit hash goes on-chain.
                            </p>
                            <div>
                                <Button variant="primary" size="sm" onClick={() => setBindModalOpen(true)}>
                                    Bind {platformName} now
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* FIAT path: show auto-filled buyer payment identity (from binding) */}
                    {!isSelf && !needsBinding && assetType === AssetType.FIAT && binding && (
                        <div style={{
                            padding: 'var(--space-3)',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            fontSize: '13px',
                        }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                Your {platformName} payment identity (from your binding)
                            </span>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Name</span>
                                <code style={{ color: 'var(--text-primary)' }}>{binding.plaintextName}</code>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Handle</span>
                                <code style={{ color: 'var(--text-primary)' }}>{binding.plaintextHandle}</code>
                            </div>
                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                The on-chain {`{nameHash, idHash}`} are committed at bind time; this order will reuse them.
                            </p>
                        </div>
                    )}

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

                    {/* Bond token address missing */}
                    {wallet.isConnected && !hasBondToken && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                            background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                            fontSize: '13px', color: 'var(--status-danger)',
                        }}>
                            Bond token address is unavailable — order cannot be placed
                        </div>
                    )}

                    {/* Status messages */}
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

            {effectivePlatformId && (
                <BindingSetupModal
                    open={bindModalOpen}
                    onClose={() => setBindModalOpen(false)}
                    platformId={effectivePlatformId}
                    platformLabel={platformName}
                />
            )}

            {showConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                    padding: 'var(--space-4)',
                }}>
                    <Card variant="elevated" padding="none" style={{ width: '100%', maxWidth: '420px' }}>
                        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-default)' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Confirm order
                            </h3>
                        </div>
                        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: '13px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Direction</span>
                                <span style={{ color: 'var(--text-primary)' }}>{isBuy ? 'Buy' : 'Sell'} {cryptoName}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Amount</span>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>{numAmount.toFixed(2)} {fiatName} → {tokenAmount.toFixed(4)} {cryptoName}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Rate</span>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>{displayRate.toFixed(2)} {fiatName} / {cryptoName}</span>
                            </div>
                            {assetType === AssetType.CRYPTO && bondBps !== null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Estimated bond</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-warning)' }}>
                                        {formatUnits((toTokenAmount(tokenAmount, tokenDecimals) * BigInt(bondBps)) / 10000n, tokenDecimals)} {cryptoName}
                                    </span>
                                </div>
                            )}
                            <p style={{ marginTop: 'var(--space-3)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Please confirm in your wallet. Approve + placeOrder may require two signatures.
                            </p>
                        </div>
                        <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 'var(--space-2)' }}>
                            <Button variant="ghost" fullWidth onClick={() => setShowConfirm(false)}>Cancel</Button>
                            <Button variant={isBuy ? 'buy' : 'sell'} fullWidth onClick={handleConfirmed}>Confirm</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
