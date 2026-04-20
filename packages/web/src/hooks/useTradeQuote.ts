import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRateQuery } from '@/hooks/queries/useRateQuery';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';

interface UseTradeQuoteParams {
    isBuy: boolean;
    moneyPair: MoneyPair;
    cryptoPair: CryptoPair;
}

function parseNumberValue(value: string): number | null {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatAmount(value: number): string {
    return Number.parseFloat(value.toFixed(2)).toString();
}

export function useTradeQuote({ isBuy, moneyPair, cryptoPair }: UseTradeQuoteParams) {
    const [amountPay, setAmountPay] = useState('');
    const [amountRecv, setAmountRecv] = useState('');

    const amountPayRef = useRef(amountPay);
    const amountRecvRef = useRef(amountRecv);

    const rateQuery = useRateQuery({ moneyPair, cryptoPair });
    const rate = rateQuery.data ?? null;
    const loading = rateQuery.isLoading || rateQuery.isFetching;
    const dataUpdatedAt = rateQuery.dataUpdatedAt;

    useEffect(() => {
        amountPayRef.current = amountPay;
    }, [amountPay]);

    useEffect(() => {
        amountRecvRef.current = amountRecv;
    }, [amountRecv]);

    const syncByCurrentRate = useCallback((currentRate: number | null, buyMode: boolean) => {
        if (currentRate === null) {
            if (buyMode) {
                setAmountRecv('');
            } else {
                setAmountPay('');
            }
            return;
        }

        if (buyMode) {
            const pay = parseNumberValue(amountPayRef.current);
            if (pay !== null) {
                setAmountRecv(formatAmount(pay / currentRate));
            }
            return;
        }

        const recv = parseNumberValue(amountRecvRef.current);
        if (recv !== null) {
            setAmountPay(formatAmount(recv * currentRate));
        }
    }, []);

    useEffect(() => {
        syncByCurrentRate(rate, isBuy);
    }, [rate, isBuy, syncByCurrentRate]);

    const onPayAmountChange = useCallback((value: string) => {
        setAmountPay(value);
        amountPayRef.current = value;

        const pay = parseNumberValue(value);
        if (pay === null || rate === null) {
            setAmountRecv('');
            amountRecvRef.current = '';
            return;
        }

        const converted = formatAmount(pay / rate);
        setAmountRecv(converted);
        amountRecvRef.current = converted;
    }, [rate]);

    const onReceiveAmountChange = useCallback((value: string) => {
        setAmountRecv(value);
        amountRecvRef.current = value;

        const recv = parseNumberValue(value);
        if (recv === null || rate === null) {
            setAmountPay('');
            amountPayRef.current = '';
            return;
        }

        const converted = formatAmount(recv * rate);
        setAmountPay(converted);
        amountPayRef.current = converted;
    }, [rate]);

    const rateLabel = useMemo(() => {
        if (loading && rate === null) return '...';
        if (rate === null) return '-';
        return rate.toFixed(3);
    }, [loading, rate]);

    const lastUpdatedLabel = useMemo(() => {
        if (!dataUpdatedAt) return '--:--';
        return new Date(dataUpdatedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }, [dataUpdatedAt]);

    return {
        amountPay,
        amountRecv,
        rate,
        loading,
        rateLabel,
        lastUpdatedLabel,
        onPayAmountChange,
        onReceiveAmountChange,
    };
}
