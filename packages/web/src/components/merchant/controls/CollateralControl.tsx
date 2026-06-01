"use client";
import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/Button';

interface Props {
    productId: bigint;
    assetType: number;
    /** Current collateral amount (already wei-scaled). */
    collateralAmount: bigint;
    /** Token decimals (USDT/DAI = 18, USDC = 6). */
    decimals: number;
    /** Optional token symbol for display. */
    tokenSymbol?: string;
    products: ReturnType<typeof useProducts>;
}

export default function CollateralControl({
    productId,
    assetType,
    collateralAmount,
    decimals,
    tokenSymbol,
    products,
}: Props) {
    const [amountStr, setAmountStr] = useState('');

    const parsedAmount = (() => {
        if (!amountStr) return 0n;
        try {
            return parseUnits(amountStr as `${number}`, decimals);
        } catch {
            return 0n;
        }
    })();

    const handleAdd = async () => {
        if (parsedAmount <= 0n) return;
        await products.addCollateral(productId, assetType, parsedAmount);
        setAmountStr('');
    };

    const handleWithdraw = async () => {
        if (parsedAmount <= 0n) return;
        await products.withdrawCollateral(productId, assetType, parsedAmount);
        setAmountStr('');
    };

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Collateral:</span>
            <span className="font-mono">
                {formatUnits(collateralAmount, decimals)} {tokenSymbol ?? ''}
            </span>
            <input
                type="number"
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="amount"
                className="terminal-input h-10 w-32 px-2 text-sm"
            />
            <Button variant="buy"   size="sm" onClick={handleAdd}      disabled={products.status === 'submitting' || parsedAmount <= 0n}>Add</Button>
            <Button variant="ghost" size="sm" onClick={handleWithdraw} disabled={products.status === 'submitting' || parsedAmount <= 0n}>Withdraw</Button>
        </div>
    );
}
