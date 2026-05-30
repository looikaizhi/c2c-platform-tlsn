"use client";

import React, { useMemo, useReducer, useState } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';
import type { Address } from 'viem';
import type * as dbTypes from '@/server/db_types';
import { DEFAULT_CRYPTO, DEFAULT_MONEY, getDefaultOptions } from '@/lib/priceModel';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import { useOrderListQuery } from '@/hooks/queries/useOrderListQuery';
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

const PlaceOrderModal = dynamic(() => import('@/components/PlaceOrderModal'));
const P2PPaymentModal = dynamic(() => import('@/components/p2p/P2PPaymentModal'));

const moneyOptions = getDefaultOptions(DEFAULT_MONEY);
const cryptoOptions = getDefaultOptions(DEFAULT_CRYPTO);
const FALLBACK_WALLET = '0xAbCDeF1234567890fFaBbCcDdEeFf0123456789';

const PAYMENT_METHODS = ['All', 'Wise', 'Alipay', 'Bank Transfer'];

function truncateAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function P2PPage() {
  const [isBuy, setIsBuy] = useState(true);
  const [cryptoPair, setCryptoPair] = useState<CryptoPair>('USDT');
  const [moneyPair, setMoneyPair] = useState<MoneyPair>('CNY');
  const [payMethod, setPayMethod] = useState('All');
  const [sortKey, setSortKey] = useState('price');

  const [orderLifecycle, dispatchOrderLifecycle] = useReducer(
    orderLifecycleReducer,
    initialOrderLifecycleState,
  );

  const wallet = useWallet();
  const walletAddress = wallet.address ?? FALLBACK_WALLET;

  const orderListQuery = useOrderListQuery({ walletAddress, isBuy, moneyPair, cryptoPair });
  const rateQuery = useRateQuery({ moneyPair, cryptoPair });

  const orderList = orderListQuery.data ?? [];
  const rate = rateQuery.data ?? null;
  const isLoading = orderListQuery.isLoading || rateQuery.isLoading;
  const displayPrice = useMemo(() => rate?.toFixed(2) ?? '—', [rate]);

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
    dispatchOrderLifecycle({ type: 'ORDER_CREATED', payload: result });
  };

  const handleCloseAll = () => {
    dispatchOrderLifecycle({ type: 'FLOW_RESET' });
  };

  const assetType = isBuy ? AssetType.CRYPTO : AssetType.FIAT;

  const columns: Column<dbTypes.OrderList>[] = [
    {
      key: 'wallet_address',
      header: 'Merchant',
      render: (_val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
              {truncateAddr(row.wallet_address)}
            </span>
            {row.user_level > 0 && (
              <Badge variant="info" size="sm">L{row.user_level}</Badge>
            )}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {row.trading_volume} trades · {row.success_rate}%
          </span>
        </div>
      ),
    },
    {
      key: 'min_order_amount',
      header: `Price (${moneyPair})`,
      sortable: true,
      align: 'right',
      render: () => (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '15px',
          fontWeight: 600,
          color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)',
        }}>
          {displayPrice}
        </span>
      ),
    },
    {
      key: 'max_order_amount',
      header: `Available (${cryptoPair})`,
      align: 'right',
      render: (_val, row) => (
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {row.max_order_amount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'min_order_amount',
      header: 'Limits',
      render: (_val, row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {row.min_order_amount.toLocaleString()} – {row.max_order_amount.toLocaleString()} {moneyPair}
        </span>
      ),
    },
    {
      key: 'supported_methods',
      header: 'Payment',
      render: (_val, row) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {row.supported_methods.split(', ').map((m) => (
            <Badge key={m} variant="muted" size="sm">{m}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'order_id',
      header: 'Action',
      align: 'center',
      width: '120px',
      render: (_val, row) => (
        <Button
          variant={isBuy ? 'buy' : 'sell'}
          size="sm"
          onClick={(e) => { e.stopPropagation(); handleTradeClick(row); }}
        >
          {isBuy ? 'Buy' : 'Sell'} {cryptoPair}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <Card variant="default" padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

          {/* Buy / Sell toggle */}
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
                  color: isBuy ? '#0B0E11' : 'var(--text-secondary)',
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
                  background: cryptoPair === opt.value ? 'rgba(240,185,11,0.1)' : 'transparent',
                  color: cryptoPair === opt.value ? 'var(--color-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all var(--motion-fast)',
                }}
              >
                {opt.text}
              </button>
            ))}
          </div>

          {/* Row: fiat, payment, sort, refresh */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
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
              onChange={setSortKey}
              options={[
                { value: 'price', label: 'Price' },
                { value: 'volume', label: 'Volume' },
              ]}
            />
            <button
              type="button"
              onClick={() => { void orderListQuery.refetch(); void rateQuery.refetch(); }}
              title="Refresh"
              style={{
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
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </Card>

      {/* ── Order table ─────────────────────────────────────────────── */}
      <Card variant="default" padding="none">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
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
          keyField="order_id"
          stickyHeader
        />
      </Card>

      {/* ── Modals ──────────────────────────────────────────────────── */}
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

      {orderLifecycle.phase === 'payment' &&
        orderLifecycle.selectedInfo &&
        orderLifecycle.fiatAmount !== null && (
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
