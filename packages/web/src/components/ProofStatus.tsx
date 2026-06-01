"use client";
import type { TlsnStatus } from '@/hooks/useTlsnExtension';
import type { ContractStatus } from '@/hooks/useContract';
import type { Hex } from 'viem';

interface ProofStatusProps {
    tlsnStatus: TlsnStatus;
    contractStatus: ContractStatus;
    tlsnError: string | null;
    contractError: string | null;
    txHash: Hex | null;
}

const tlsnStatusLabels: Record<TlsnStatus, string> = {
    idle: '',
    'loading-plugin': 'Loading plugin…',
    proving: 'Generating TLS proof (please complete the flow in the extension popup)…',
    done: 'Proof generated',
    error: 'Failed to generate proof',
};

const contractStatusLabels: Record<ContractStatus, string> = {
    idle: '',
    building: 'Building contract parameters…',
    confirming: 'Please confirm the transaction in your wallet…',
    pending: 'Waiting for transaction confirmation…',
    success: 'Transaction confirmed on-chain',
    error: 'Transaction failed',
};

export default function ProofStatus({
    tlsnStatus,
    contractStatus,
    tlsnError,
    contractError,
    txHash,
}: ProofStatusProps) {
    const isActive = tlsnStatus !== 'idle' || contractStatus !== 'idle';
    if (!isActive) return null;

    const isProving = tlsnStatus === 'loading-plugin' || tlsnStatus === 'proving';
    const isSubmitting = contractStatus === 'building' || contractStatus === 'confirming' || contractStatus === 'pending';
    const hasError = tlsnStatus === 'error' || contractStatus === 'error';
    const isComplete = contractStatus === 'success';

    // Progress bar value
    let progress = 0;
    if (tlsnStatus === 'loading-plugin') progress = 10;
    else if (tlsnStatus === 'proving') progress = 30;
    else if (tlsnStatus === 'done') progress = 50;
    if (contractStatus === 'building') progress = 60;
    else if (contractStatus === 'confirming') progress = 70;
    else if (contractStatus === 'pending') progress = 85;
    else if (contractStatus === 'success') progress = 100;

    return (
        <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4" aria-live="polite">
            {/* Progress bar */}
            {(isProving || isSubmitting) && (
                <div className="mb-3 h-2 w-full rounded-full bg-[var(--bg-surface-4)]">
                    <div
                        className="h-2 rounded-full bg-[var(--accent-cta)] transition-all duration-700 ease-in-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* TLSN status */}
            {tlsnStatus !== 'idle' && (
                <div className={`text-sm mb-1 ${
                    tlsnStatus === 'error' ? 'text-[var(--state-danger)]' :
                    tlsnStatus === 'done' ? 'text-[var(--state-success)]' :
                    'text-[var(--state-warning)]'
                }`}>
                    {tlsnStatusLabels[tlsnStatus]}
                </div>
            )}

            {/* Contract status */}
            {contractStatus !== 'idle' && (
                <div className={`text-sm mb-1 ${
                    contractStatus === 'error' ? 'text-[var(--state-danger)]' :
                    contractStatus === 'success' ? 'text-[var(--state-success)]' :
                    'text-[var(--state-warning)]'
                }`}>
                    {contractStatusLabels[contractStatus]}
                </div>
            )}

            {/* Errors */}
            {tlsnError && (
                <div role="alert" aria-live="assertive" className="mt-2 rounded border border-[color:rgb(246_70_93_/_45%)] bg-[color:rgb(127_29_29_/_24%)] p-2 text-xs text-red-300 break-all">
                    {tlsnError}
                </div>
            )}
            {contractError && (
                <div role="alert" aria-live="assertive" className="mt-2 rounded border border-[color:rgb(246_70_93_/_45%)] bg-[color:rgb(127_29_29_/_24%)] p-2 text-xs text-red-300 break-all">
                    {contractError}
                </div>
            )}

            {/* TX Hash */}
            {txHash && (
                <div className="mt-2 rounded border border-[color:rgb(14_203_129_/_45%)] bg-[color:rgb(14_203_129_/_14%)] p-2 text-xs text-[var(--state-success)] break-all">
                    TX: {txHash}
                </div>
            )}

            {/* Complete */}
            {isComplete && (
                <div className="mt-2 text-sm font-semibold text-[var(--state-success)]">
                    Payment verified — tokens released
                </div>
            )}

            {/* Error state */}
            {hasError && !isComplete && (
                <div className="mt-2 text-xs text-[var(--text-subtle)]">
                    You can retry the verification flow
                </div>
            )}
        </div>
    );
}
