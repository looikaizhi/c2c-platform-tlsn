"use client";

import Link from 'next/link';
import { useEffect, useMemo, useReducer } from 'react';
import { ArrowLeft, Clock3, X } from 'lucide-react';
import type { Address } from 'viem';
import type * as dbTypes from '@/server/db_types';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWallet } from '@/hooks/useWallet';
import { useOrderPaymentQuery } from '@/hooks/queries/useOrderPaymentQuery';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import TlsnVerifyButton from '@/components/TlsnVerifyButton';
import type { PaymentStep } from './types';

interface P2PPaymentModalProps {
    dbOrderId: number;
    merchant: Address;
    productId: bigint;
    onChainOrderId: bigint;
    isBuy: boolean;
    cryptoName: string;
    fiatCurrency: string;
    fiatAmount: number;
    onClose: () => void;
}

interface PaymentFlowState {
    step: PaymentStep;
    selectedMethod: dbTypes.OrderPayment | null;
}

type PaymentFlowEvent =
    | { type: 'RESET_FOR_ROLE'; isBuy: boolean }
    | { type: 'SELECT_METHOD'; payload: dbTypes.OrderPayment }
    | { type: 'BACK' }
    | { type: 'FIAT_PAYMENT_CONFIRMED' }
    | { type: 'CRYPTO_LOCKED' };

const STEP_LABELS: Record<PaymentStep, string> = {
    'select-method': '选择付款方式',
    'payment-detail': '向卖家付款',
    verify: 'TLSN 验证支付',
    'lock-crypto': '锁定代币',
    'waiting-merchant': '等待商家确认',
};

function createInitialPaymentFlow(isBuy: boolean): PaymentFlowState {
    return { step: isBuy ? 'select-method' : 'lock-crypto', selectedMethod: null };
}

function paymentFlowReducer(state: PaymentFlowState, event: PaymentFlowEvent): PaymentFlowState {
    switch (event.type) {
        case 'RESET_FOR_ROLE':
            return createInitialPaymentFlow(event.isBuy);
        case 'SELECT_METHOD':
            return { step: 'payment-detail', selectedMethod: event.payload };
        case 'BACK':
            if (state.step === 'verify') return { ...state, step: 'payment-detail' };
            if (state.step === 'payment-detail') return { step: 'select-method', selectedMethod: null };
            return state;
        case 'FIAT_PAYMENT_CONFIRMED':
            if (state.step !== 'payment-detail') return state;
            return { ...state, step: 'verify' };
        case 'CRYPTO_LOCKED':
            return { ...state, step: 'waiting-merchant' };
        default:
            return state;
    }
}

function formatFiatAmount(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

export default function P2PPaymentModal({
    dbOrderId,
    merchant,
    productId,
    onChainOrderId,
    isBuy,
    cryptoName,
    fiatCurrency,
    fiatAmount,
    onClose,
}: P2PPaymentModalProps) {
    const [flowState, dispatchFlow] = useReducer(paymentFlowReducer, createInitialPaymentFlow(isBuy));
    const orderFlow = useOrderFlow();
    const wallet = useWallet();
    const orderPaymentQuery = useOrderPaymentQuery(dbOrderId);
    const orderPayment = orderPaymentQuery.data ?? [];

    useEffect(() => {
        dispatchFlow({ type: 'RESET_FOR_ROLE', isBuy });
    }, [isBuy]);

    const totalSteps = isBuy ? 3 : 2;
    const currentStepIndex = useMemo(() => {
        if (isBuy) {
            if (flowState.step === 'select-method') return 1;
            if (flowState.step === 'payment-detail') return 2;
            return 3;
        }
        if (flowState.step === 'lock-crypto') return 1;
        return 2;
    }, [isBuy, flowState.step]);

    const progressPercent = Math.round((currentStepIndex / totalSteps) * 100);
    const canGoBack = isBuy && (flowState.step === 'payment-detail' || flowState.step === 'verify');
    const formattedAmount = useMemo(() => formatFiatAmount(fiatAmount, fiatCurrency), [fiatAmount, fiatCurrency]);
    const selectedMethod = flowState.selectedMethod;

    const handleLockCrypto = async () => {
        const result = await orderFlow.payByCrypto(merchant, productId, onChainOrderId, wallet.selectedWallet?.provider);
        if (result.ok) dispatchFlow({ type: 'CRYPTO_LOCKED' });
    };

    const handleVerifySuccess = () => {
        // keep modal open for user to review result
    };

    const handleClaimRefund = async () => {
        await orderFlow.claimRefund(merchant, productId, onChainOrderId, wallet.selectedWallet?.provider);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            padding: 'var(--space-4)',
        }}>
            <Card variant="elevated" padding="none" style={{ width: '100%', maxWidth: '520px' }}>
                {/* Header */}
                <div style={{
                    borderBottom: '1px solid var(--border-default)',
                    padding: 'var(--space-4)',
                }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="p2p-payment-title"
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                        <div style={{ width: '32px' }}>
                            {canGoBack && (
                                <button
                                    type="button"
                                    onClick={() => dispatchFlow({ type: 'BACK' })}
                                    aria-label="返回上一步"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                >
                                    <ArrowLeft size={20} />
                                </button>
                            )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h3 id="p2p-payment-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                {isBuy ? `购买 ${cryptoName}` : `卖出 ${cryptoName}`}
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {STEP_LABELS[flowState.step]}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="关闭支付流程弹窗"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', width: '32px' }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div style={{ height: '4px', background: 'var(--bg-base)', borderRadius: 'var(--radius-full)' }}>
                        <div style={{
                            height: '4px', borderRadius: 'var(--radius-full)',
                            background: 'var(--color-primary)',
                            width: `${progressPercent}%`,
                            transition: 'width var(--motion-mid)',
                        }} />
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

                    {flowState.step === 'lock-crypto' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div>
                                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                    锁定 {cryptoName}
                                </h4>
                                <p style={{ marginTop: '4px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                    将您的 {cryptoName} 锁定到托管合约，等待商家确认法币收款。
                                </p>
                            </div>

                            {orderFlow.status !== 'idle' && orderFlow.status !== 'success' && (
                                <div role="alert" aria-live="assertive" style={{
                                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px',
                                    background: orderFlow.status === 'error' ? 'var(--status-danger-bg)' : 'var(--status-warning-bg)',
                                    color: orderFlow.status === 'error' ? 'var(--status-danger)' : 'var(--status-warning)',
                                    border: `1px solid ${orderFlow.status === 'error' ? 'var(--status-danger)' : 'var(--status-warning)'}`,
                                }}>
                                    {orderFlow.status === 'paying-crypto' && '请在钱包中确认交易...'}
                                    {orderFlow.status === 'error' && orderFlow.error}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                <Button
                                    variant="primary"
                                    fullWidth
                                    onClick={handleLockCrypto}
                                    disabled={orderFlow.status === 'paying-crypto'}
                                >
                                    {orderFlow.status === 'paying-crypto' ? '处理中...' : `锁定 ${cryptoName} 到托管合约`}
                                </Button>
                                <Button variant="ghost" fullWidth onClick={onClose}>取消</Button>
                            </div>
                        </div>
                    )}

                    {flowState.step === 'select-method' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>订单金额</h4>
                                <Badge variant="warning">{formattedAmount}</Badge>
                            </div>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>请选择付款方式</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                {orderPaymentQuery.isLoading ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
                                ) : orderPaymentQuery.isError ? (
                                    <div role="alert" style={{ textAlign: 'center', fontSize: '13px', color: 'var(--status-danger)' }}>
                                        付款方式加载失败，请稍后重试
                                    </div>
                                ) : (
                                    orderPayment.map((payment) => (
                                        <button
                                            type="button"
                                            key={payment.method_name}
                                            onClick={() => dispatchFlow({ type: 'SELECT_METHOD', payload: payment })}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: 'var(--space-3) var(--space-4)',
                                                background: 'var(--bg-base)',
                                                border: '1px solid var(--border-default)',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                color: 'var(--text-primary)',
                                                transition: 'border-color var(--motion-fast)',
                                                textAlign: 'left',
                                            }}
                                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-active)')}
                                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)')}
                                        >
                                            <span>{payment.method_name}</span>
                                            <span style={{ color: 'var(--text-tertiary)' }}>›</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {flowState.step === 'payment-detail' && selectedMethod && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div>
                                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>向卖家付款</h4>
                                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                    {formattedAmount}
                                </p>
                            </div>
                            <div style={{
                                padding: 'var(--space-4)', background: 'var(--bg-base)',
                                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                                display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                            }}>
                                <InfoRow label="付款方式" value={selectedMethod.method_name} />
                                <InfoRow label="收款人姓名" value={selectedMethod.account_holder_name} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>账号</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{selectedMethod.account_number_hash}</span>
                                        <button
                                            type="button"
                                            onClick={() => void navigator.clipboard.writeText(selectedMethod.account_number_hash)}
                                            aria-label="复制收款账号"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}
                                        >
                                            复制
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                padding: 'var(--space-3)', background: 'var(--bg-base)',
                                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                                display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                            }}>
                                <InfoRow label="商家地址" value={`${merchant.slice(0, 6)}...${merchant.slice(-4)}`} />
                                <InfoRow label="链上订单 ID" value={String(onChainOrderId)} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                <Button variant="primary" fullWidth onClick={() => dispatchFlow({ type: 'FIAT_PAYMENT_CONFIRMED' })}>
                                    我已完成付款，进行 Verify
                                </Button>
                                <Button variant="ghost" fullWidth onClick={onClose}>取消订单</Button>
                            </div>
                        </div>
                    )}

                    {flowState.step === 'verify' && (
                        <div>
                            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>验证支付</h4>
                            <p style={{ marginTop: '4px', marginBottom: 'var(--space-4)', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                使用 TLSN 扩展验证转账记录，并提交链上证明。
                            </p>
                            <TlsnVerifyButton
                                contractAction={{
                                    type: 'payOrderByFiat',
                                    merchant,
                                    productId,
                                    orderId: onChainOrderId,
                                }}
                                onSuccess={handleVerifySuccess}
                            />
                            <div style={{ marginTop: 'var(--space-3)' }}>
                                <Button variant="ghost" fullWidth onClick={onClose}>稍后验证</Button>
                            </div>
                        </div>
                    )}

                    {flowState.step === 'waiting-merchant' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div>
                                <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>等待商家确认</h4>
                                <p style={{ marginTop: '4px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                    您的 {cryptoName} 已锁定。商家需在 15 分钟内进行 TLSN 验证并确认收款。
                                </p>
                            </div>

                            <div style={{
                                padding: 'var(--space-4)', background: 'var(--bg-base)',
                                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                                display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>状态</span>
                                    <Badge variant="warning" dot>WAITING</Badge>
                                </div>
                                <InfoRow label="商家地址" value={`${merchant.slice(0, 6)}...${merchant.slice(-4)}`} />
                                <InfoRow label="链上订单" value={String(onChainOrderId)} />
                            </div>

                            {orderFlow.txHash && (
                                <div aria-live="polite" style={{
                                    padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--status-success-bg)', border: '1px solid var(--status-success)',
                                    fontSize: '12px', color: 'var(--status-success)', wordBreak: 'break-all',
                                }}>
                                    锁定 TX: {orderFlow.txHash}
                                </div>
                            )}

                            <div style={{
                                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                                background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)',
                                fontSize: '12px', color: 'var(--status-warning)',
                                display: 'flex', alignItems: 'center', gap: '8px',
                            }}>
                                <Clock3 size={14} />
                                如果商家 15 分钟内未确认，您可以申请超时赔偿（2x）。
                            </div>

                            {orderFlow.error && (
                                <div role="alert" aria-live="assertive" style={{
                                    padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                                    fontSize: '12px', color: 'var(--status-danger)', wordBreak: 'break-all',
                                }}>
                                    {orderFlow.error}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                <Button
                                    variant="danger"
                                    fullWidth
                                    onClick={handleClaimRefund}
                                    disabled={orderFlow.status === 'claiming'}
                                >
                                    {orderFlow.status === 'claiming' ? '处理中...' : '申请超时赔偿 (2x)'}
                                </Button>
                                <Button variant="ghost" fullWidth onClick={onClose}>关闭</Button>
                                <Link
                                    href={`/orders/${dbOrderId}`}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        height: '40px', borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-default)',
                                        fontSize: '14px', color: 'var(--text-secondary)',
                                        textDecoration: 'none', transition: 'all var(--motion-fast)',
                                    }}
                                >
                                    查看订单详情
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ color: 'var(--text-primary)' }}>{value}</span>
        </div>
    );
}
