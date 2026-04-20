"use client";

import Link from 'next/link';
import { useEffect, useMemo, useReducer } from 'react';
import { ArrowLeft, Clock3, X } from 'lucide-react';
import type { Address } from 'viem';
import type * as dbTypes from '@/server/db_types';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWallet } from '@/hooks/useWallet';
import { useOrderPaymentQuery } from '@/hooks/queries/useOrderPaymentQuery';
import ActionButton from '@/components/ui/ActionButton';
import StatusPill from '@/components/ui/StatusPill';
import SurfaceCard from '@/components/ui/SurfaceCard';
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
    return {
        step: isBuy ? 'select-method' : 'lock-crypto',
        selectedMethod: null,
    };
}

function paymentFlowReducer(
    state: PaymentFlowState,
    event: PaymentFlowEvent,
): PaymentFlowState {
    switch (event.type) {
        case 'RESET_FOR_ROLE':
            return createInitialPaymentFlow(event.isBuy);
        case 'SELECT_METHOD':
            return { step: 'payment-detail', selectedMethod: event.payload };
        case 'BACK':
            if (state.step === 'verify') {
                return { ...state, step: 'payment-detail' };
            }
            if (state.step === 'payment-detail') {
                return { step: 'select-method', selectedMethod: null };
            }
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
        if (result.ok) {
            dispatchFlow({ type: 'CRYPTO_LOCKED' });
        }
    };

    const handleVerifySuccess = () => {
        // keep modal open for user to review tx result
    };

    const handleClaimRefund = async () => {
        await orderFlow.claimRefund(merchant, productId, onChainOrderId, wallet.selectedWallet?.provider);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4">
            <SurfaceCard elevated className="w-full max-w-xl">
                <div
                    className="border-b border-[var(--line-soft)] p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="p2p-payment-title"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="w-8">
                            {canGoBack && (
                                <button
                                    type="button"
                                    onClick={() => dispatchFlow({ type: 'BACK' })}
                                    aria-label="返回上一步"
                                    className="text-[var(--text-subtle)] transition-colors hover:text-white"
                                >
                                    <ArrowLeft />
                                </button>
                            )}
                        </div>
                        <div className="text-center">
                            <h3 id="p2p-payment-title" className="font-[var(--font-heading)] text-lg text-white">{isBuy ? `购买 ${cryptoName}` : `卖出 ${cryptoName}`}</h3>
                            <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{STEP_LABELS[flowState.step]}</p>
                        </div>
                        <button type="button" onClick={onClose} aria-label="关闭支付流程弹窗" className="w-8 text-[var(--text-subtle)] transition-colors hover:text-white">
                            <X />
                        </button>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--bg-surface-1)]">
                        <div className="h-2 rounded-full bg-[var(--accent-primary)] transition-all duration-[var(--motion-mid)]" style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>

                <div className="space-y-4 p-5">
                    {flowState.step === 'lock-crypto' && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-[var(--font-heading)] text-lg text-white">锁定 {cryptoName}</h4>
                                <p className="mt-1 text-sm text-[var(--text-subtle)]">
                                    将您的 {cryptoName} 锁定到托管合约，等待商家确认法币收款。
                                </p>
                            </div>

                            {orderFlow.status !== 'idle' && orderFlow.status !== 'success' && (
                                <div
                                    role="alert"
                                    aria-live="assertive"
                                    className={`rounded-lg border p-3 text-sm ${
                                        orderFlow.status === 'error'
                                            ? 'border-[color:rgb(239_68_68_/_45%)] bg-[color:rgb(127_29_29_/_32%)] text-red-200'
                                            : 'border-[color:rgb(245_158_11_/_45%)] bg-[color:rgb(113_63_18_/_32%)] text-amber-200'
                                    }`}
                                >
                                    {orderFlow.status === 'paying-crypto' && '请在钱包中确认交易...'}
                                    {orderFlow.status === 'error' && orderFlow.error}
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <ActionButton
                                    onClick={handleLockCrypto}
                                    disabled={orderFlow.status === 'paying-crypto'}
                                    className="w-full"
                                >
                                    {orderFlow.status === 'paying-crypto' ? '处理中...' : `锁定 ${cryptoName} 到托管合约`}
                                </ActionButton>
                                <ActionButton tone="ghost" onClick={onClose} className="w-full">取消</ActionButton>
                            </div>
                        </div>
                    )}

                    {flowState.step === 'select-method' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="font-[var(--font-heading)] text-lg">订单金额</h4>
                                <StatusPill label={formattedAmount} tone="warning" />
                            </div>
                            <p className="text-sm text-[var(--text-subtle)]">请选择付款方式</p>
                            <div className="space-y-2">
                                {orderPaymentQuery.isLoading ? (
                                    <div className="text-center text-[var(--text-subtle)]">加载中...</div>
                                ) : orderPaymentQuery.isError ? (
                                    <div role="alert" className="text-center text-sm text-[var(--state-danger)]">付款方式加载失败，请稍后重试</div>
                                ) : (
                                    orderPayment.map((payment) => (
                                        <button
                                            type="button"
                                            key={payment.method_name}
                                            onClick={() => dispatchFlow({ type: 'SELECT_METHOD', payload: payment })}
                                            className="flex w-full items-center justify-between rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] px-4 py-3 text-left text-sm transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)]"
                                        >
                                            <span>{payment.method_name}</span>
                                            <span className="text-[var(--text-muted)]">&gt;</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {flowState.step === 'payment-detail' && selectedMethod && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-[var(--font-heading)] text-lg">向卖家付款</h4>
                                <p className="mt-1 text-2xl font-semibold text-[var(--accent-cta)]">{formattedAmount}</p>
                            </div>
                            <div className="space-y-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-4 text-sm">
                                <InfoRow label="付款方式" value={selectedMethod.method_name} />
                                <InfoRow label="收款人姓名" value={selectedMethod.account_holder_name} />
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-subtle)]">账号</span>
                                    <div className="flex items-center gap-2">
                                        <span>{selectedMethod.account_number_hash}</span>
                                        <button
                                            type="button"
                                            onClick={() => void navigator.clipboard.writeText(selectedMethod.account_number_hash)}
                                            aria-label="复制收款账号"
                                            className="text-xs font-semibold text-[var(--accent-primary)]"
                                        >
                                            复制
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-3 text-xs">
                                <InfoRow label="商家地址" value={`${merchant.slice(0, 6)}...${merchant.slice(-4)}`} />
                                <InfoRow label="链上订单 ID" value={String(onChainOrderId)} />
                            </div>

                            <div className="flex flex-col gap-2">
                                <ActionButton onClick={() => dispatchFlow({ type: 'FIAT_PAYMENT_CONFIRMED' })} className="w-full">
                                    我已完成付款，进行 Verify
                                </ActionButton>
                                <ActionButton tone="ghost" onClick={onClose} className="w-full">取消订单</ActionButton>
                            </div>
                        </div>
                    )}

                    {flowState.step === 'verify' && (
                        <div>
                            <h4 className="font-[var(--font-heading)] text-lg">验证支付</h4>
                            <p className="mb-4 mt-1 text-sm text-[var(--text-subtle)]">
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
                            <div className="mt-3">
                                <ActionButton tone="ghost" onClick={onClose} className="w-full">稍后验证</ActionButton>
                            </div>
                        </div>
                    )}

                    {flowState.step === 'waiting-merchant' && (
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-[var(--font-heading)] text-lg">等待商家确认</h4>
                                <p className="mt-1 text-sm text-[var(--text-subtle)]">
                                    您的 {cryptoName} 已锁定。商家需在 15 分钟内进行 TLSN 验证并确认收款。
                                </p>
                            </div>

                            <div className="space-y-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-4 text-sm">
                                <InfoRow label="状态" value="WAITING" valueTone="warning" />
                                <InfoRow label="商家地址" value={`${merchant.slice(0, 6)}...${merchant.slice(-4)}`} />
                                <InfoRow label="链上订单" value={String(onChainOrderId)} />
                            </div>

                            {orderFlow.txHash && (
                                <div aria-live="polite" className="break-all rounded-lg border border-[color:rgb(34_197_94_/_45%)] bg-[color:rgb(20_83_45_/_26%)] p-2 text-xs text-green-200">
                                    锁定 TX: {orderFlow.txHash}
                                </div>
                            )}

                            <div className="rounded-lg border border-[color:rgb(245_158_11_/_45%)] bg-[color:rgb(113_63_18_/_26%)] p-3 text-xs text-amber-200">
                                <div className="flex items-center gap-2">
                                    <Clock3 className="h-4 w-4" />
                                    如果商家 15 分钟内未确认，您可以申请超时赔偿（2x）。
                                </div>
                            </div>

                            {orderFlow.error && (
                                <div role="alert" aria-live="assertive" className="break-all rounded-lg border border-[color:rgb(239_68_68_/_45%)] bg-[color:rgb(127_29_29_/_32%)] p-2 text-xs text-red-200">
                                    {orderFlow.error}
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <ActionButton
                                    tone="danger"
                                    onClick={handleClaimRefund}
                                    disabled={orderFlow.status === 'claiming'}
                                    className="w-full"
                                >
                                    {orderFlow.status === 'claiming' ? '处理中...' : '申请超时赔偿 (2x)'}
                                </ActionButton>

                                <ActionButton tone="ghost" onClick={onClose} className="w-full">关闭</ActionButton>

                                <Link
                                    href={`/orders/${dbOrderId}`}
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--line-soft)] text-sm text-[var(--text-secondary)] transition-all duration-[var(--motion-fast)] hover:border-[var(--line-strong)] hover:text-white"
                                >
                                    查看订单详情
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </SurfaceCard>
        </div>
    );
}

function InfoRow({
    label,
    value,
    valueTone = 'default',
}: {
    label: string;
    value: string;
    valueTone?: 'default' | 'warning';
}) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-[var(--text-subtle)]">{label}</span>
            <span className={valueTone === 'warning' ? 'text-[var(--state-warning)]' : 'text-white'}>{value}</span>
        </div>
    );
}
