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
    'loading-plugin': '正在加载插件...',
    proving: '正在生成 TLS 证明（请在扩展弹出的窗口中操作）...',
    done: '证明生成完成',
    error: '证明生成失败',
};

const contractStatusLabels: Record<ContractStatus, string> = {
    idle: '',
    building: '正在构建合约参数...',
    confirming: '请在钱包中确认交易...',
    pending: '等待交易确认...',
    success: '交易已上链',
    error: '交易失败',
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
                    验证支付已完成，代币已释放
                </div>
            )}

            {/* Error state */}
            {hasError && !isComplete && (
                <div className="mt-2 text-xs text-[var(--text-subtle)]">
                    可以重试验证流程
                </div>
            )}
        </div>
    );
}
