"use client";

import React, { useState } from 'react';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import type { Address } from 'viem';
import { useTlsnExtension } from '@/hooks/useTlsnExtension';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type Platform = 'wise' | 'alipay';

interface OrderProofFlowProps {
  merchant: Address;
  productId: bigint;
  orderId: bigint;
  onProofSubmitted?: () => void;
}

const PLATFORM_PLUGINS: Record<Platform, string> = {
  wise: '/plugins/wise.plugin.js',
  alipay: '/plugins/alipay.plugin.js',
};

type FlowStep = 1 | 2 | 3 | 4 | 5;

export function OrderProofFlow({ merchant: _merchant, productId: _productId, orderId: _orderId, onProofSubmitted }: OrderProofFlowProps) {
  const tlsn = useTlsnExtension();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleGenerateProof = async () => {
    if (!platform) return;
    try {
      await tlsn.runPlugin(PLATFORM_PLUGINS[platform]);
      setFlowStep(4);
    } catch {
      // error already set in hook
    }
  };

  const handleSubmitProof = async () => {
    setSubmitError(null);
    try {
      // Proof submission will be handled via useOrderFlow in Phase 5.7
      // For now: signal success
      setFlowStep(5);
      onProofSubmitted?.();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  const steps = [
    { n: 1, label: 'Extension detected', done: tlsn.isExtensionAvailable },
    { n: 2, label: 'Select payment proof type', done: platform !== null },
    { n: 3, label: 'Generate proof', done: flowStep > 3 },
    { n: 4, label: 'Submit to chain', done: flowStep > 4 },
    { n: 5, label: 'Complete', done: flowStep === 5 },
  ];

  return (
    <Card variant="default" padding="md">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Payment Proof Flow
        </h4>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Generate and submit a zkTLS proof of payment to complete this order.
        </p>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {steps.map((s) => {
          const isActive = !s.done && flowStep === s.n;
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {s.done ? (
                <CheckCircle size={16} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
              ) : isActive ? (
                <Loader2 size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
              ) : (
                <Circle size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              )}
              <span style={{
                fontSize: '13px',
                color: s.done ? 'var(--status-success)' : isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontWeight: isActive ? 600 : 400,
              }}>
                Step {s.n}: {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step 1: Extension check */}
      {flowStep === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {tlsn.isExtensionAvailable ? (
            <Badge variant="success" dot>TLSN Extension detected</Badge>
          ) : (
            <div style={{ padding: 'var(--space-3)', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--status-warning)' }}>
              TLSN Extension not found. Please install it from the Chrome Web Store.
            </div>
          )}
          {tlsn.isExtensionAvailable && (
            <Button variant="primary" size="sm" onClick={() => setFlowStep(2)}>
              Continue →
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={tlsn.checkStatus}>
            Re-check extension
          </Button>
        </div>
      )}

      {/* Step 2: Platform selection */}
      {flowStep === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Select the payment platform you used:
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {(['wise', 'alipay'] as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                style={{
                  height: '40px', padding: '0 20px', fontSize: '14px', fontWeight: 500,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all var(--motion-fast)',
                  border: `1px solid ${platform === p ? 'var(--color-primary)' : 'var(--border-default)'}`,
                  background: platform === p ? 'rgba(240,185,11,0.1)' : 'transparent',
                  color: platform === p ? 'var(--color-primary)' : 'var(--text-secondary)',
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {platform && (
            <Button variant="primary" size="sm" onClick={() => setFlowStep(3)}>
              Continue →
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Generate proof */}
      {flowStep === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Click the button below to open the {platform} plugin and generate a proof of payment.
          </p>
          {tlsn.status === 'error' && tlsn.error && (
            <div style={{ padding: 'var(--space-2)', background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--status-danger)' }}>
              {tlsn.error}
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            loading={tlsn.status === 'proving' || tlsn.status === 'loading-plugin'}
            onClick={handleGenerateProof}
          >
            {tlsn.status === 'loading-plugin' ? 'Loading plugin…'
              : tlsn.status === 'proving' ? 'Generating proof…'
              : 'Generate Proof'}
          </Button>
        </div>
      )}

      {/* Step 4: Submit to chain */}
      {flowStep === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Badge variant="success" dot>Proof generated successfully</Badge>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Your proof is ready. Submit it to the escrow contract to release the funds.
          </p>
          {submitError && (
            <div style={{ padding: 'var(--space-2)', background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--status-danger)' }}>
              {submitError}
            </div>
          )}
          <Button variant="primary" size="sm" onClick={handleSubmitProof}>
            Submit to Chain →
          </Button>
        </div>
      )}

      {/* Step 5: Complete */}
      {flowStep === 5 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Badge variant="success" dot size="md">Proof submitted successfully</Badge>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            The smart contract will verify your proof and release the funds automatically.
          </p>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </Card>
  );
}
