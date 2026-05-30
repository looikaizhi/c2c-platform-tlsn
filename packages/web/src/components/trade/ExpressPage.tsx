"use client";
import React, { useState } from 'react';
import type { CryptoPair, MoneyPair } from '@/lib/priceModel';
import { useTradeQuote } from '@/hooks/useTradeQuote';
import { Button } from '@/components/ui/Button';

const MONEY_OPTIONS: MoneyPair[] = ['CNY', 'USD'];
const CRYPTO_OPTIONS: CryptoPair[] = ['USDT', 'USDC', 'BTC', 'ETH'];

// ── Amount input row ──────────────────────────────────────────────────────────

function AmountRow({
  label,
  amount,
  onAmountChange,
  currency,
  currencies,
  onCurrencyChange,
  readOnly,
}: {
  label: string;
  amount: string;
  onAmountChange: (v: string) => void;
  currency: string;
  currencies: string[];
  onCurrencyChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          readOnly={readOnly}
          placeholder="0.00"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '24px',
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            color: readOnly ? 'var(--text-secondary)' : 'var(--text-primary)',
          }}
        />
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            padding: '4px 8px',
            fontFamily: 'var(--font-ui)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Hero (left column) ────────────────────────────────────────────────────────

function ExpressHero({ isBuy, rate, cryptoPair, moneyPair }: {
  isBuy: boolean;
  rate: number | null;
  cryptoPair: CryptoPair;
  moneyPair: MoneyPair;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        maxWidth: '520px',
      }}
    >
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: 'var(--space-2)' }}>
          {isBuy ? 'Buy' : 'Sell'} {cryptoPair} / {moneyPair} · Best Rate
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '40px',
            fontWeight: 700,
            color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)',
            letterSpacing: '-0.02em',
          }}
        >
          {rate != null ? rate.toFixed(3) : '—'}
          <span style={{ fontSize: '18px', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 400 }}>
            {moneyPair}/{cryptoPair}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {[
          { icon: '🔐', title: 'zkTLS Verified', desc: 'Every payment is cryptographically verified by TLSNotary before release.' },
          { icon: '⛓', title: 'On-Chain Settlement', desc: 'Funds are escrowed and released atomically via smart contracts.' },
          { icon: '🏪', title: 'Best Rate', desc: 'Aggregated from verified merchants. No hidden fees.' },
        ].map((f) => (
          <div key={f.title} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>{f.icon}</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{f.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExpressPage() {
  const [isBuy, setIsBuy] = useState(true);
  const [moneyPair, setMoneyPair] = useState<MoneyPair>('CNY');
  const [cryptoPair, setCryptoPair] = useState<CryptoPair>('USDT');

  const quote = useTradeQuote({ isBuy, moneyPair, cryptoPair });

  const payLabel = isBuy ? `I want to pay (${moneyPair})` : `I want to pay (${cryptoPair})`;
  const recvLabel = isBuy ? `I will receive (${cryptoPair})` : `I will receive (${moneyPair})`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-10)',
        padding: 'var(--space-8) 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-12)',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        {/* Hero */}
        <ExpressHero
          isBuy={isBuy}
          rate={quote.rate}
          cryptoPair={cryptoPair}
          moneyPair={moneyPair}
        />

        {/* Trade card */}
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            flexShrink: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Buy / Sell toggle */}
          <div style={{ display: 'flex' }}>
            {[true, false].map((buy) => (
              <button
                key={String(buy)}
                onClick={() => setIsBuy(buy)}
                style={{
                  flex: 1,
                  height: '48px',
                  border: 'none',
                  background: isBuy === buy
                    ? (buy ? 'var(--color-buy-bg)' : 'var(--color-sell-bg)')
                    : 'transparent',
                  color: isBuy === buy
                    ? (buy ? 'var(--color-buy)' : 'var(--color-sell)')
                    : 'var(--text-secondary)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  borderBottom: isBuy === buy
                    ? `2px solid ${buy ? 'var(--color-buy)' : 'var(--color-sell)'}`
                    : '2px solid transparent',
                  transition: 'all var(--motion-fast)',
                }}
              >
                {buy ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>

          {/* Form */}
          <div
            style={{
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <AmountRow
              label={payLabel}
              amount={isBuy ? quote.amountPay : quote.amountRecv}
              onAmountChange={isBuy ? quote.onPayAmountChange : quote.onReceiveAmountChange}
              currency={isBuy ? moneyPair : cryptoPair}
              currencies={isBuy ? MONEY_OPTIONS : CRYPTO_OPTIONS}
              onCurrencyChange={(v) =>
                isBuy ? setMoneyPair(v as MoneyPair) : setCryptoPair(v as CryptoPair)
              }
            />

            {/* Swap icon */}
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '18px' }}>
              ⇅
            </div>

            <AmountRow
              label={recvLabel}
              amount={isBuy ? quote.amountRecv : quote.amountPay}
              onAmountChange={isBuy ? quote.onReceiveAmountChange : quote.onPayAmountChange}
              currency={isBuy ? cryptoPair : moneyPair}
              currencies={isBuy ? CRYPTO_OPTIONS : MONEY_OPTIONS}
              onCurrencyChange={(v) =>
                isBuy ? setCryptoPair(v as CryptoPair) : setMoneyPair(v as MoneyPair)
              }
              readOnly
            />

            {/* Rate row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                padding: '0 var(--space-1)',
              }}
            >
              <span>Rate</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>
                1 {cryptoPair} ≈ {quote.rateLabel} {moneyPair}
              </span>
            </div>

            <Button
              variant={isBuy ? 'buy' : 'sell'}
              fullWidth
              size="lg"
              style={{ marginTop: 'var(--space-2)' }}
            >
              {isBuy ? 'Buy' : 'Sell'} {cryptoPair} →
            </Button>

            <p
              style={{
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                marginTop: 'var(--space-1)',
              }}
            >
              Best price from verified merchants · Zero custodial risk
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
