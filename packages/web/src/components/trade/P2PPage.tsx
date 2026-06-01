"use client";

import React, { useMemo, useReducer, useState } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';
import type { Address, Hex } from 'viem';
import { platformDisplay } from '@/constants/platforms';
import { moneyOptions as registryMoneyOptions, cryptoOptions as registryCryptoOptions } from '@/lib/assetRegistry';
import type { CryptoPair, MoneyPair } from '@/lib/assetRegistry';
import { useOrderListQuery, type P2PProduct } from '@/hooks/queries/useOrderListQuery';
import { useRateQuery } from '@/hooks/queries/useRateQuery';
import { useWallet } from '@/hooks/useWallet';
import { AssetType } from '@/lib/orderHelpers';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import type { Column } from '@/components/ui/Table';
import type { PlaceOrderSuccessResult, SelectedOrderInfo } from '@/components/p2p/types';
import {
  initialOrderLifecycleState,
  orderLifecycleReducer,
} from '@/components/p2p/orderLifecycle';
import { truncateAddr, formatOnChainRate, formatAvailableAmount } from '@/lib/formatters';

const PlaceOrderModal = dynamic(() => import('@/components/PlaceOrderModal'));
const P2PPaymentModal = dynamic(() => import('@/components/p2p/P2PPaymentModal'));

const moneyOptions = [
  { value: 'All', text: 'All' },
  ...registryMoneyOptions(),
];
const cryptoOptions = registryCryptoOptions();
const FALLBACK_WALLET = '0xAbCDeF1234567890fFaBbCcDdEeFf0123456789';

const PAYMENT_METHODS = ['All', 'Wise', 'Alipay', 'Bank Transfer'];

// selectedInfo carries extra fields, used by PlaceOrderModal
interface ExtendedSelectedOrderInfo extends SelectedOrderInfo {
  bondTokenAddress: Address;
  tokenDecimals: number;
  onChainRate: number;
  platformId: Hex;
}

export function P2PPage() {
  const [isBuy, setIsBuy] = useState(true);
  const [cryptoPair, setCryptoPair] = useState<CryptoPair>('USDT');
  const [moneyPair, setMoneyPair] = useState<MoneyPair>('All');
  const [payMethod, setPayMethod] = useState('All');
  const [sortKey, setSortKey] = useState<'rate' | 'availableAmount' | 'merchant'>('rate');

  const [orderLifecycle, dispatchOrderLifecycle] = useReducer(
    orderLifecycleReducer,
    initialOrderLifecycleState,
  );

  // Extended selectedInfo for passing bondTokenAddress to modals
  const [extendedInfo, setExtendedInfo] = useState<ExtendedSelectedOrderInfo | null>(null);

  const wallet = useWallet();
  const walletAddress = wallet.address ?? FALLBACK_WALLET;

  const orderListQuery = useOrderListQuery({ walletAddress, isBuy, moneyPair, cryptoPair });
  const rateQuery = useRateQuery({ moneyPair, cryptoPair });

  const orderList = useMemo(() => {
    const list = (orderListQuery.data ?? []).slice();
    list.sort((a, b) => {
      if (sortKey === 'rate') {
        // For buy (fiat→crypto): lower rate is better. For sell: higher rate is better.
        return isBuy ? Number(a.rate - b.rate) : Number(b.rate - a.rate);
      }
      if (sortKey === 'availableAmount') {
        return Number(b.availableAmount - a.availableAmount);
      }
      return a.merchant.localeCompare(b.merchant);
    });
    return list;
  }, [orderListQuery.data, sortKey, isBuy]);
  const rate = rateQuery.data ?? null;
  // Decoupled: orderbook never waits on the price oracle.
  const isLoading = orderListQuery.isLoading;
  const displayPrice = useMemo(() => {
    if (rateQuery.isLoading) return '…';
    if (rate == null)        return '—';
    return rate.toFixed(2);
  }, [rate, rateQuery.isLoading]);

  const handleTradeClick = (item: P2PProduct) => {
    // R4 defensive: contract reverts SelfTradeNotAllowed anyway, but skip the
    // wallet/tx round-trip if the user clicked into their own listing somehow.
    if (wallet.address && item.merchant.toLowerCase() === wallet.address.toLowerCase()) {
      return;
    }
    const onChainRate = Number(item.rate) / 1e8;
    const availableTokens = Number(item.availableAmount) / 10 ** item.tokenDecimals;
    const maxFiat = availableTokens * onChainRate;

    const selectedInfo: SelectedOrderInfo = {
      dbOrderId: 0,
      merchant: item.merchant,
      productId: item.productId,
      minAmount: 1,
      maxAmount: Math.floor(maxFiat),
    };
    const extended: ExtendedSelectedOrderInfo = {
      ...selectedInfo,
      bondTokenAddress: item.tokenAddress,
      tokenDecimals: item.tokenDecimals,
      onChainRate,
      platformId: item.platformId as Hex,
    };
    setExtendedInfo(extended);
    dispatchOrderLifecycle({ type: 'ORDER_SELECTED', payload: selectedInfo });
  };

  const handlePlaceOrderSuccess = (result: PlaceOrderSuccessResult) => {
    dispatchOrderLifecycle({ type: 'ORDER_CREATED', payload: result });
  };

  const handleCloseAll = () => {
    dispatchOrderLifecycle({ type: 'FLOW_RESET' });
    setExtendedInfo(null);
  };

  const assetType = isBuy ? AssetType.CRYPTO : AssetType.FIAT;

  const columns: Column<P2PProduct>[] = [
    {
      key: 'merchant',
      header: 'Merchant',
      render: (_val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
            {truncateAddr(row.merchant)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {row.cryptoSymbol} · {row.fiatName}
          </span>
        </div>
      ),
    },
    {
      key: 'rate',
      header: `Price (${moneyPair})`,
      sortable: true,
      align: 'right',
      render: (_val, row) => (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '15px',
          fontWeight: 600,
          color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)',
        }}>
          {formatOnChainRate(row.rate)}
        </span>
      ),
    },
    {
      key: 'availableAmount',
      header: `Available (${cryptoPair})`,
      align: 'right',
      render: (_val, row) => (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {formatAvailableAmount(row.availableAmount, row.tokenDecimals)}
        </span>
      ),
    },
    {
      key: 'limits',
      header: 'Limits',
      render: (_val, row) => {
        const tokens = Number(row.availableAmount) / 10 ** row.tokenDecimals;
        const maxFiat = (tokens * Number(row.rate) / 1e8).toFixed(0);
        return (
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            1 – {Number(maxFiat).toLocaleString()} {moneyPair}
          </span>
        );
      },
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (_val, row) => {
        const platform = platformDisplay(row.platformId);
        if (!platform) {
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <Badge variant="muted" size="sm">Unknown</Badge>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: platform.color, background: platform.bg }}
            >
              {platform.label}
            </span>
          </div>
        );
      },
    },
    {
      key: 'action',
      header: 'Action',
      align: 'center',
      width: '120px',
      render: (_val, row) => {
        const isSelf =
          !!wallet.address &&
          row.merchant.toLowerCase() === wallet.address.toLowerCase();
        if (isSelf) {
          return (
            <Badge variant="muted" size="sm">
              Your listing
            </Badge>
          );
        }
        return (
          <Button
            variant={isBuy ? 'buy' : 'sell'}
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleTradeClick(row); }}
          >
            {isBuy ? 'Buy' : 'Sell'} {cryptoPair}
          </Button>
        );
      },
    },
  ];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >

      {/* ── Filter bar (two rows; clear visual hierarchy) ────────────── */}
      <Card variant="default" padding="md">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >

          {/* Row 1 — Buy/Sell + Crypto asset chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div style={{
                display: 'inline-flex',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                overflow: 'hidden',
              }}>
                <button
                  type="button"
                  onClick={() => setIsBuy(true)}
                  style={{
                    height: '36px',
                    padding: '0 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background var(--motion-fast), color var(--motion-fast)',
                    background: isBuy ? 'var(--color-buy)' : 'transparent',
                    color: isBuy ? 'var(--color-primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setIsBuy(false)}
                  style={{
                    height: '36px',
                    padding: '0 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background var(--motion-fast), color var(--motion-fast)',
                    background: !isBuy ? 'var(--color-sell)' : 'transparent',
                    color: !isBuy ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  Sell
                </button>
              </div>

              <Badge variant={isBuy ? 'buy' : 'sell'} dot>
                {isBuy ? 'Buyer View' : 'Seller View'}
              </Badge>
            </div>

            {/* Crypto asset chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {cryptoOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCryptoPair(opt.value as CryptoPair)}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${cryptoPair === opt.value ? 'var(--color-primary)' : 'var(--border-default)'}`,
                    background: cryptoPair === opt.value ? 'rgba(80,210,193,0.10)' : 'transparent',
                    color: cryptoPair === opt.value ? 'var(--color-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all var(--motion-fast)',
                  }}
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2 — Fiat / Payment / Sort / Refresh, separated by a thin divider */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 'var(--space-2)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            <FilterSelect
              label="Fiat"
              value={moneyPair}
              onChange={(v) => setMoneyPair(v as MoneyPair)}
              options={moneyOptions.map((o) => ({ value: o.value, label: o.text }))}
            />
            <FilterSelect
              label="Payment"
              value={payMethod}
              onChange={setPayMethod}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            />
            <FilterSelect
              label="Sort"
              value={sortKey}
              onChange={(v) => setSortKey(v as 'rate' | 'availableAmount' | 'merchant')}
              options={[
                { value: 'rate',            label: 'Rate' },
                { value: 'availableAmount', label: 'Available' },
                { value: 'merchant',        label: 'Merchant' },
              ]}
            />
            <button
              type="button"
              onClick={() => { void orderListQuery.refetch(); void rateQuery.refetch(); }}
              title="Refresh"
              aria-label="Refresh order list"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '36px',
                width: '36px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--motion-fast)',
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </Card>

      {/* ── Order table (fills remaining height; body scrolls) ──────── */}
      <Card
        variant="default"
        padding="none"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            P2P Orderbook
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Best price:{' '}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)',
            }}>
              {displayPrice} {moneyPair}
            </span>
          </span>
        </div>
        <Table
          columns={columns}
          data={orderList}
          loading={isLoading}
          emptyText="No orders available"
          keyField="productId"
          stickyHeader
          fill
        />
      </Card>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {orderLifecycle.phase === 'place-order' && orderLifecycle.selectedInfo && extendedInfo && (
        <PlaceOrderModal
          merchant={orderLifecycle.selectedInfo.merchant}
          productId={orderLifecycle.selectedInfo.productId}
          assetType={assetType}
          displayRate={extendedInfo.onChainRate}
          fiatName={moneyPair}
          cryptoName={cryptoPair}
          minAmount={orderLifecycle.selectedInfo.minAmount}
          maxAmount={orderLifecycle.selectedInfo.maxAmount}
          onClose={handleCloseAll}
          onSuccess={handlePlaceOrderSuccess}
          bondTokenAddress={extendedInfo.bondTokenAddress}
          tokenDecimals={extendedInfo.tokenDecimals}
          platformId={extendedInfo.platformId}
        />
      )}

      {orderLifecycle.phase === 'awaiting-proof' &&
        orderLifecycle.selectedInfo &&
        orderLifecycle.fiatAmount !== null &&
        orderLifecycle.platformId !== null && (
          <P2PPaymentModal
            dbOrderId={orderLifecycle.selectedInfo.dbOrderId}
            merchant={orderLifecycle.selectedInfo.merchant}
            productId={orderLifecycle.selectedInfo.productId}
            onChainOrderId={orderLifecycle.onChainOrderId}
            isBuy={isBuy}
            assetType={assetType}
            cryptoName={cryptoPair}
            fiatCurrency={moneyPair}
            fiatAmount={orderLifecycle.fiatAmount}
            deadline={orderLifecycle.deadline}
            platformId={orderLifecycle.platformId}
            onClose={handleCloseAll}
            onCompleted={() => {
              void orderListQuery.refetch();
              handleCloseAll();
            }}
            bondTokenAddress={extendedInfo?.bondTokenAddress}
          />
        )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: '36px',
          padding: '0 10px',
          fontSize: '13px',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          minWidth: '90px',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
