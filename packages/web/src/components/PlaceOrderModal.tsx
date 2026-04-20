"use client";

import { useState } from 'react';
import { X } from 'lucide-react';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWallet } from '@/hooks/useWallet';
import { AssetType, calculateDeadline, generateSalt, toRate, toTokenAmount } from '@/lib/orderHelpers';
import ActionButton from '@/components/ui/ActionButton';
import SurfaceCard from '@/components/ui/SurfaceCard';
import type { Address } from 'viem';
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
    const [amount, setAmount] = useState<string>('');

    const numAmount = parseFloat(amount) || 0;
    const tokenAmount = displayRate > 0 ? numAmount / displayRate : 0;
    const isValid = numAmount >= minAmount && numAmount <= maxAmount && wallet.isConnected;

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

    const isProcessing = orderFlow.status === 'signing' || orderFlow.status === 'placing';

    const statusLabel = (() => {
        switch (orderFlow.status) {
            case 'signing': return '请在钱包中签名...';
            case 'placing': return '正在提交上链...';
            case 'success': return '下单成功!';
            case 'error': return '下单失败';
            default: return null;
        }
    })();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <SurfaceCard elevated className="w-full max-w-lg">
                <div
                    className="border-b border-[var(--line-soft)] p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="place-order-title"
                >
                    <div className="flex items-center justify-between">
                        <h3 id="place-order-title" className="font-[var(--font-heading)] text-lg text-white">
                            {assetType === AssetType.CRYPTO ? '买入 Buy' : '卖出 Sell'} {cryptoName}
                        </h3>
                        <button type="button" onClick={onClose} aria-label="关闭下单弹窗" className="text-[var(--text-subtle)] hover:text-white">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="space-y-4 p-5">
                    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[var(--text-subtle)]">汇率 Rate</span>
                            <span className="font-semibold text-[var(--accent-cta)]">
                                1 {cryptoName} = {displayRate.toFixed(2)} {fiatName}
                            </span>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="place-order-amount" className="mb-1.5 block text-xs uppercase tracking-[0.1em] text-[var(--text-muted)]">
                            金额 Amount ({fiatName})
                        </label>
                        <input
                            id="place-order-amount"
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder={`${minAmount} - ${maxAmount}`}
                            className="terminal-input w-full"
                            min={minAmount}
                            max={maxAmount}
                            disabled={isProcessing}
                        />
                        {numAmount > 0 && numAmount < minAmount && (
                            <p role="alert" className="mt-1 text-xs text-[var(--state-danger)]">最小金额 {minAmount} {fiatName}</p>
                        )}
                        {numAmount > maxAmount && (
                            <p role="alert" className="mt-1 text-xs text-[var(--state-danger)]">最大金额 {maxAmount} {fiatName}</p>
                        )}
                    </div>

                    {numAmount > 0 && displayRate > 0 && (
                        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-surface-1)] p-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--text-subtle)]">
                                    {assetType === AssetType.CRYPTO ? '预计获得' : '需要支付'}
                                </span>
                                <span className="font-semibold text-white">
                                    {tokenAmount.toFixed(4)} {cryptoName}
                                </span>
                            </div>
                        </div>
                    )}

                    {!wallet.isConnected && (
                        <div role="alert" aria-live="assertive" className="rounded-lg border border-[color:rgb(245_158_11_/_45%)] bg-[color:rgb(113_63_18_/_28%)] p-2 text-xs text-amber-200">
                            请先连接钱包
                        </div>
                    )}

                    {statusLabel && (
                        <div aria-live="polite" className={`rounded-lg border p-2 text-sm ${
                            orderFlow.status === 'error'
                                ? 'border-[color:rgb(239_68_68_/_45%)] bg-[color:rgb(127_29_29_/_28%)] text-red-200'
                                : orderFlow.status === 'success'
                                ? 'border-[color:rgb(34_197_94_/_45%)] bg-[color:rgb(20_83_45_/_26%)] text-green-200'
                                : 'border-[color:rgb(245_158_11_/_45%)] bg-[color:rgb(113_63_18_/_28%)] text-amber-200'
                        }`}>
                            {statusLabel}
                        </div>
                    )}

                    {orderFlow.error && (
                        <div role="alert" aria-live="assertive" className="break-all rounded-lg border border-[color:rgb(239_68_68_/_45%)] bg-[color:rgb(127_29_29_/_28%)] p-2 text-xs text-red-200">
                            {orderFlow.error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <ActionButton
                            onClick={handlePlaceOrder}
                            disabled={!isValid || isProcessing}
                            className="w-full"
                        >
                            {isProcessing
                                ? '处理中...'
                                : orderFlow.status === 'success'
                                ? '下单成功'
                                : '确认下单'}
                        </ActionButton>

                        <ActionButton tone="ghost" onClick={onClose} className="w-full">取消</ActionButton>
                    </div>
                </div>
            </SurfaceCard>
        </div>
    );
}
