"use client";
import React from 'react';
import type { Address } from 'viem';
import { Button } from '@/components/ui/Button';
import WalletGateModal from '@/components/WalletGateModal';
import { useProofFlow, type Direction, type Platform } from './useProofFlow';

export interface ProofPanelProps {
    merchant:   Address;
    productId:  bigint;
    orderId:    bigint;
    assetType:  0 | 1;
    /** Required for the embedded variant — single platform pre-selected. */
    platform:   Platform;
    direction?: Direction;
    /** Disable interaction (e.g. on order expiry). */
    disabled?:  boolean;
    onProofSubmitted?: () => void;
}

/**
 * Embedded proof flow — compact status dots + single CTA. Use inside
 * P2PPaymentModal where platform + direction are already known.
 */
export function ProofPanel({ disabled = false, ...args }: ProofPanelProps) {
    const flow = useProofFlow(args);
    const { tlsn, orderFlow, wallet, flowStep, platform, submitError, handleGenerateProof, handleSubmitProof, walletGate } = flow;

    const extReady    = tlsn.isExtensionAvailable;
    const proofReady  = !!tlsn.result;
    const txReady     = flowStep === 5;
    const isProving   = tlsn.status === 'proving' || tlsn.status === 'loading-plugin';
    const isSubmitting = orderFlow.status === 'pending';
    const isWorking   = isProving || isSubmitting;

    const primaryLabel = txReady
        ? 'Submitted ✓'
        : isSubmitting
            ? 'Submitting…'
            : proofReady
                ? 'Submit to chain →'
                : isProving
                    ? (tlsn.status === 'loading-plugin' ? 'Loading plugin…' : 'Generating proof…')
                    : 'Generate & submit proof';

    const handlePrimary = () => {
        if (txReady || isWorking || disabled || !platform || !extReady) return;
        if (proofReady) {
            void handleSubmitProof();
        } else {
            void handleGenerateProof();
        }
    };

    const dotStyle = (active: boolean, done: boolean): React.CSSProperties => ({
        width:        8,
        height:       8,
        borderRadius: '50%',
        background:   done   ? 'var(--status-success)'
                    : active ? 'var(--color-primary)'
                             : 'var(--bg-surface-3)',
        boxShadow:    active && !done ? '0 0 0 3px rgba(80,210,193,0.18)' : undefined,
        transition:   'background var(--motion-fast)',
        flexShrink:   0,
    });

    return (
        <>
            <div
                style={{
                    padding:        'var(--space-3)',
                    background:     'var(--bg-base)',
                    border:         '1px solid var(--border-default)',
                    borderRadius:   'var(--radius-md)',
                    display:        'flex',
                    flexDirection:  'column',
                    gap:            'var(--space-3)',
                }}
            >
                {/* Status dots row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span style={dotStyle(extReady && !proofReady, extReady)} aria-label={extReady ? 'extension ready' : 'extension missing'} />
                    <span>Extension</span>
                    <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>→</span>
                    <span style={dotStyle(isProving, proofReady)} aria-label={proofReady ? 'proof ready' : 'proof pending'} />
                    <span>Proof</span>
                    <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>→</span>
                    <span style={dotStyle(isSubmitting, txReady)} aria-label={txReady ? 'submitted' : 'tx pending'} />
                    <span>On-chain</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                        {tlsn.isVerifierRunning ? 'Verifier online' : 'Verifier offline'}
                    </span>
                </div>

                {!extReady && (
                    <div role="alert" style={{
                        padding:      'var(--space-2) var(--space-3)',
                        background:   'var(--status-warning-bg)',
                        border:       '1px solid var(--status-warning)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize:     12,
                        color:        'var(--status-warning)',
                    }}>
                        TLSN Extension not detected. Install it and refresh, then try again.
                    </div>
                )}

                {(tlsn.error || submitError) && (
                    <div role="alert" style={{
                        padding:      'var(--space-2) var(--space-3)',
                        background:   'var(--status-danger-bg)',
                        border:       '1px solid var(--status-danger)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize:     12,
                        color:        'var(--status-danger)',
                        wordBreak:    'break-word',
                    }}>
                        {submitError ?? tlsn.error}
                    </div>
                )}

                <Button
                    variant="primary"
                    size="md"
                    fullWidth
                    loading={isWorking}
                    disabled={disabled || !extReady || !wallet.address || txReady}
                    onClick={handlePrimary}
                >
                    {primaryLabel}
                </Button>

                {txReady && orderFlow.txHash && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        tx: {orderFlow.txHash}
                    </div>
                )}
            </div>

            {walletGate.showModal && <WalletGateModal onClose={walletGate.closeModal} />}
            <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
        </>
    );
}
