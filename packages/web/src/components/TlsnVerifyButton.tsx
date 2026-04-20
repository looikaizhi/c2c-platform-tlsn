"use client";

import { useCallback, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BadgeDollarSign, Building2, ChevronDown, Globe2 } from 'lucide-react';
import { useTlsnExtension } from '@/hooks/useTlsnExtension';
import { useContract } from '@/hooks/useContract';
import { useWallet } from '@/hooks/useWallet';
import ProofStatus from './ProofStatus';
import type { ExtensionProveResponse } from '@/lib/proofTransformer';
import type { ProofAction } from '@/lib/contractSubmitter';
import type { Hex } from 'viem';

interface VerifyPlugin {
    key: string;
    name: string;
    icon: LucideIcon;
    file: string;
}

/**
 * Available verification plugins.
 * Each maps to a .js file in public/plugins/.
 */
const VERIFY_PLUGINS: VerifyPlugin[] = [
    { key: 'alipay', name: '支付宝转账验证', icon: BadgeDollarSign, file: '/plugins/alipay.js' },
    { key: 'wise', name: 'Wise 国际转账验证', icon: Globe2, file: '/plugins/wise.js' },
];

interface TlsnVerifyButtonProps {
    /** Contract action to execute after proof generation */
    contractAction: ProofAction;
    /** Called when the entire flow (prove + submit) succeeds */
    onSuccess?: (txHash: Hex) => void;
}

export default function TlsnVerifyButton({ contractAction, onSuccess }: TlsnVerifyButtonProps) {
    const tlsn = useTlsnExtension();
    const contract = useContract();
    const wallet = useWallet();
    const [selectedPlugin, setSelectedPlugin] = useState<string>(VERIFY_PLUGINS[0].key);
    const [showPluginPicker, setShowPluginPicker] = useState(false);

    const plugin = VERIFY_PLUGINS.find((p) => p.key === selectedPlugin) ?? VERIFY_PLUGINS[0];

    const handleVerify = useCallback(async () => {
        try {
            // Step 1: Run TLSN plugin to generate proof
            const result = await tlsn.runPlugin(plugin.file);

            // Step 2: Submit proof to contract
            if (contractAction.type === 'payOrderByWise' && result.proofs) {
                // Wise needs two proofs
                await contract.submitWiseProofs(
                    result.proofs.contacts as ExtensionProveResponse,
                    result.proofs.transfer as ExtensionProveResponse,
                    contractAction.merchant,
                    contractAction.productId,
                    contractAction.orderId,
                    wallet.selectedWallet?.provider,
                );
            } else {
                // Single proof flow
                await contract.submitProof(
                    result as unknown as ExtensionProveResponse,
                    contractAction,
                    wallet.selectedWallet?.provider,
                );
            }

            if (contract.txHash && onSuccess) {
                onSuccess(contract.txHash);
            }
        } catch {
            // Errors are already captured in tlsn.error / contract.error
        }
    }, [tlsn, contract, wallet, plugin, contractAction, onSuccess]);

    const isProcessing =
        tlsn.status === 'loading-plugin' ||
        tlsn.status === 'proving' ||
        contract.status === 'building' ||
        contract.status === 'confirming' ||
        contract.status === 'pending';

    const canVerify = !isProcessing && wallet.isConnected;
    const PluginIcon = plugin.icon;

    return (
        <div className="space-y-3">
            {/* Extension + Verifier status indicators */}
            <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${tlsn.isExtensionAvailable ? 'bg-[var(--state-success)]' : 'bg-[var(--state-danger)]'}`} />
                    <span className="text-[var(--text-subtle)]">
                        {tlsn.isExtensionAvailable ? '扩展已连接' : '扩展未检测到'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${tlsn.isVerifierRunning ? 'bg-[var(--state-success)]' : 'bg-[var(--state-danger)]'}`} />
                    <span className="text-[var(--text-subtle)]">
                        {tlsn.isVerifierRunning ? '验证器运行中' : '验证器未运行'}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={tlsn.checkStatus}
                    className="ml-auto text-xs text-[var(--state-info)] hover:text-[color:rgb(141_194_255)]"
                >
                    刷新状态
                </button>
            </div>

            {/* Wallet not connected warning */}
            {!wallet.isConnected && (
                <div role="alert" aria-live="assertive" className="rounded border border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(113_63_18_/_24%)] p-2 text-xs text-[var(--state-warning)]">
                    请先连接钱包
                </div>
            )}

            {/* Extension not available warning */}
            {!tlsn.isExtensionAvailable && (
                <div role="alert" aria-live="assertive" className="rounded border border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(113_63_18_/_24%)] p-2 text-xs text-[var(--state-warning)]">
                    请安装 TLSN Extension 并刷新页面
                </div>
            )}

            {/* Plugin selector */}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setShowPluginPicker(!showPluginPicker)}
                    aria-label="选择验证插件"
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-3 text-sm transition-colors hover:border-[var(--line-strong)]"
                >
                    <div className="flex items-center gap-2">
                        <PluginIcon className="h-4 w-4 text-[var(--text-secondary)]" />
                        <span>{plugin.name}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                </button>
                {showPluginPicker && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] shadow-lg">
                        {VERIFY_PLUGINS.map((p) => {
                            const ItemIcon = p.icon;
                            return (
                                <button
                                    type="button"
                                    key={p.key}
                                    onClick={() => {
                                        setSelectedPlugin(p.key);
                                        setShowPluginPicker(false);
                                    }}
                                    className={`flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-surface-3)] ${
                                        p.key === selectedPlugin ? 'bg-[var(--bg-surface-3)]' : ''
                                    }`}
                                >
                                    <ItemIcon className="h-4 w-4 text-[var(--text-secondary)]" />
                                    <span>{p.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Verify button */}
            <button
                type="button"
                onClick={handleVerify}
                disabled={!canVerify}
                className={`w-full rounded-lg py-3 text-sm font-bold transition-all duration-200 ${
                    isProcessing
                        ? 'cursor-wait border border-[color:rgb(240_185_11_/_72%)] bg-[var(--state-warning)] text-[var(--text-inverse)] opacity-70'
                        : contract.status === 'success'
                        ? 'border border-[color:rgb(14_203_129_/_70%)] bg-[var(--state-success)] text-[var(--text-inverse)]'
                        : contract.status === 'error' || tlsn.status === 'error'
                        ? 'border border-[color:rgb(246_70_93_/_72%)] bg-[var(--state-danger)] text-white hover:bg-[color:rgb(229_56_81_/_96%)]'
                        : 'border border-[color:rgb(252_213_53_/_75%)] bg-[var(--accent-cta)] text-[var(--text-inverse)] hover:bg-[color:rgb(245_197_24_/_96%)]'
                } disabled:cursor-not-allowed disabled:opacity-40`}
            >
                {isProcessing
                    ? '验证中...'
                    : contract.status === 'success'
                    ? '验证完成'
                    : contract.status === 'error' || tlsn.status === 'error'
                    ? '重试验证'
                    : '开始验证支付'}
            </button>

            {/* Progress / status */}
            <ProofStatus
                tlsnStatus={tlsn.status}
                contractStatus={contract.status}
                tlsnError={tlsn.error}
                contractError={contract.error}
                txHash={contract.txHash}
            />
        </div>
    );
}
