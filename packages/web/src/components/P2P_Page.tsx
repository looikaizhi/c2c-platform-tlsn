"use client";

import { useMemo, useReducer, useState } from 'react';
import dynamic from 'next/dynamic';
import type * as dbTypes from '@/server/db_types';
import type { Address } from 'viem';
import { DEFAULT_CRYPTO, DEFAULT_MONEY, getDefaultOptions } from '@/lib/priceModel';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import { useOrderListQuery } from '@/hooks/queries/useOrderListQuery';
import { useRateQuery } from '@/hooks/queries/useRateQuery';
import { useWallet } from '@/hooks/useWallet';
import { AssetType } from '@/lib/orderHelpers';
import P2PFilters from './p2p/P2PFilters';
import P2POrderTable from './p2p/P2POrderTable';
import type { PlaceOrderSuccessResult, SelectedOrderInfo } from './p2p/types';
import {
    initialOrderLifecycleState,
    orderLifecycleReducer,
} from './p2p/orderLifecycle';
import SectionHeader from './ui/SectionHeader';
import StatusPill from './ui/StatusPill';

const PlaceOrderModal = dynamic(() => import('./PlaceOrderModal'));
const P2PPaymentModal = dynamic(() => import('./p2p/P2PPaymentModal'));

const optionsMoney = getDefaultOptions(DEFAULT_MONEY);
const optionsCrypto = getDefaultOptions(DEFAULT_CRYPTO);
const FALLBACK_WALLET_ADDRESS = '0xAbCDeF1234567890fFaBbCcDdEeFf0123456789';

export function P2P_Page() {
    const [isBuy, setIsBuy] = useState(true);
    const [moneyPair, setMoneyPair] = useState<MoneyPair>('CNY');
    const [cryptoPair, setCryptoPair] = useState<CryptoPair>('USDT');
    const [payMethod, setPayMethod] = useState('所有支付方式');
    const [sortKey, setSortKey] = useState('价格');

    const [orderLifecycle, dispatchOrderLifecycle] = useReducer(
        orderLifecycleReducer,
        initialOrderLifecycleState,
    );

    const wallet = useWallet();
    const walletAddress = wallet.address ?? FALLBACK_WALLET_ADDRESS;

    const orderListQuery = useOrderListQuery({
        walletAddress,
        isBuy,
        moneyPair,
        cryptoPair,
    });
    const rateQuery = useRateQuery({ moneyPair, cryptoPair });

    const orderList = orderListQuery.data ?? [];
    const rate = rateQuery.data ?? null;
    const isLoading = orderListQuery.isLoading || rateQuery.isLoading;

    const displayPrice = useMemo(() => rate?.toFixed(2) ?? '-', [rate]);

    const handleTradeClick = (item: dbTypes.OrderList) => {
        const selectedInfo: SelectedOrderInfo = {
            dbOrderId: item.order_id,
            merchant: item.wallet_address as Address,
            productId: 0n,
            minAmount: item.min_order_amount,
            maxAmount: item.max_order_amount,
        };
        dispatchOrderLifecycle({ type: 'ORDER_SELECTED', payload: selectedInfo });
    };

    const handlePlaceOrderSuccess = (result: PlaceOrderSuccessResult) => {
        dispatchOrderLifecycle({
            type: 'ORDER_CREATED',
            payload: result,
        });
    };

    const handleCloseAll = () => {
        dispatchOrderLifecycle({ type: 'FLOW_RESET' });
    };

    const assetType = isBuy ? AssetType.CRYPTO : AssetType.FIAT;

    return (
        <div className="flex w-full flex-col">
            <SectionHeader
                eyebrow="P2P Market"
                title="广告交易区 Orderbook"
                description="浏览商家广告、筛选支付方式并通过状态机流程完成下单、验证和结算。"
                action={<StatusPill label="P2P Live" tone="info" />}
            />

            <P2PFilters
                isBuy={isBuy}
                onToggleBuy={setIsBuy}
                cryptoPair={cryptoPair}
                onCryptoChange={setCryptoPair}
                moneyPair={moneyPair}
                onMoneyChange={setMoneyPair}
                payMethod={payMethod}
                onPayMethodChange={setPayMethod}
                sortKey={sortKey}
                onSortKeyChange={setSortKey}
                cryptoOptions={optionsCrypto}
                moneyOptions={optionsMoney}
            />

            <P2POrderTable
                isLoading={isLoading}
                orderList={orderList}
                displayPrice={displayPrice}
                isBuy={isBuy}
                moneyPair={moneyPair}
                cryptoPair={cryptoPair}
                onTradeClick={handleTradeClick}
            />

            {orderLifecycle.phase === 'place-order' && orderLifecycle.selectedInfo && (
                <PlaceOrderModal
                    merchant={orderLifecycle.selectedInfo.merchant}
                    productId={orderLifecycle.selectedInfo.productId}
                    assetType={assetType}
                    displayRate={rate ?? 0}
                    fiatName={moneyPair}
                    cryptoName={cryptoPair}
                    minAmount={orderLifecycle.selectedInfo.minAmount}
                    maxAmount={orderLifecycle.selectedInfo.maxAmount}
                    onClose={handleCloseAll}
                    onSuccess={handlePlaceOrderSuccess}
                />
            )}

            {orderLifecycle.phase === 'payment' && orderLifecycle.selectedInfo && orderLifecycle.fiatAmount !== null && (
                <P2PPaymentModal
                    dbOrderId={orderLifecycle.selectedInfo.dbOrderId}
                    merchant={orderLifecycle.selectedInfo.merchant}
                    productId={orderLifecycle.selectedInfo.productId}
                    onChainOrderId={orderLifecycle.onChainOrderId}
                    isBuy={isBuy}
                    cryptoName={cryptoPair}
                    fiatCurrency={moneyPair}
                    fiatAmount={orderLifecycle.fiatAmount}
                    onClose={handleCloseAll}
                />
            )}
        </div>
    );
}
