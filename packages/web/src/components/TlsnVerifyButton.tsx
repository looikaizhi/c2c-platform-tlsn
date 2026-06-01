"use client";

import { useCallback, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BadgeDollarSign, ChevronDown, Globe2 } from 'lucide-react';
import { useTlsnExtension } from '@/hooks/useTlsnExtension';
import { useContract } from '@/hooks/useContract';
import { useWallet } from '@/hooks/useWallet';
import ProofStatus from './ProofStatus';
import { buildContractProof, type OrderBindingContext } from '@/proofs/transformer';
import { platformByKey } from '@/platforms/registry';
import * as adminWriter from '@/chain/writers/adminWriter';
import { useNetwork } from '@/contexts/NetworkContext';
import type { Hex } from 'viem';

interface VerifyPlugin {
    key: string;
    name: string;
    icon: LucideIcon;
    file: string;
}

const VERIFY_PLUGINS: VerifyPlugin[] = [
    { key: 'alipay', name: 'Alipay transfer verification', icon: BadgeDollarSign, file: '/plugins/alipay.js' },
    { key: 'wise', name: 'Wise international transfer verification', icon: Globe2, file: '/plugins/wise.js' },
];

/** Minimal action descriptor passed from parent — proofs are generated inside this component. */
export type VerifyContractAction =
    | { type: 'registerMerchant' }
    | { type: 'payOrderByPlatform'; merchant: Hex; productId: bigint; orderId: bigint }
    | { type: 'receiveCryptoWithPlatformPayment'; productId: bigint; orderId: bigint };

interface TlsnVerifyButtonProps {
    contractAction: VerifyContractAction;
    onSuccess?: (txHash: Hex) => void;
}

export default function TlsnVerifyButton({ contractAction, onSuccess }: TlsnVerifyButtonProps) {
    const tlsn = useTlsnExtension();
    const contract = useContract();
    const wallet = useWallet();
    const { network } = useNetwork();
    const [selectedPlugin, setSelectedPlugin] = useState<string>(VERIFY_PLUGINS[0].key);
    const [showPluginPicker, setShowPluginPicker] = useState(false);

    const plugin = VERIFY_PLUGINS.find((p) => p.key === selectedPlugin) ?? VERIFY_PLUGINS[0];

    const handleVerify = useCallback(async () => {
        try {
            // TlsnVerifyButton is the merchant self-register path. It uses a
            // single-proof platform (Alipay) by default; we pass a minimal
            // OrderBindingContext placeholder built from contractAction. The
            // dual-proof (Wise) registerMerchant flow isn't currently used.
            const platform = platformByKey(plugin.key as 'wise' | 'alipay');

            // Build minimum binding context for register flow (assetType=0 / crypto).
            const ctxPlaceholder: OrderBindingContext = {
                escrowAddress:    network.contracts.c2cEscrow,
                chainId:          network.chainId,
                merchant:         (wallet.address ?? ('0x' + '0'.repeat(40))) as Hex,
                buyer:            (wallet.address ?? ('0x' + '0'.repeat(40))) as Hex,
                productId:        0n,
                orderId:          0n,
                assetType:        0,
                amount:           0n,
                rate:             0n,
                rateVersion:      0n,
                deadline:         0n,
                merchantNameHash: ('0x' + '0'.repeat(64)) as Hex,
                merchantIdHash:   ('0x' + '0'.repeat(64)) as Hex,
                payeeNameHash:    ('0x' + '0'.repeat(64)) as Hex,
                payeeIdHash:      ('0x' + '0'.repeat(64)) as Hex,
            };
            const result = await tlsn.runPlugin(platform, ctxPlaceholder);

            if (contractAction.type === 'registerMerchant') {
                if (result.kind !== 'single') throw new Error('registerMerchant requires single proof');
                const proof = buildContractProof(result.proof);
                const { hash: adminHash } = await adminWriter.registerMerchant(network.chainId, proof);
                if (onSuccess) onSuccess(adminHash);
                return;
            }

            const isCrypto = contractAction.type === 'payOrderByPlatform';

            if (plugin.key === 'wise') {
                if (result.kind !== 'dual') {
                    throw new Error('Wise requires dual proof (contacts + transfer)');
                }
                if (isCrypto) {
                    await contract.submitWiseCryptoProof(
                        result.contacts,
                        result.transfer,
                        (contractAction as { merchant: Hex }).merchant,
                        contractAction.productId,
                        contractAction.orderId,
                    );
                } else {
                    await contract.submitWiseFiatProof(
                        result.transfer,
                        contractAction.productId,
                        contractAction.orderId,
                    );
                }
            } else {
                if (result.kind !== 'single') {
                    throw new Error('Alipay requires single proof');
                }
                if (isCrypto) {
                    await contract.submitAlipayCryptoProof(
                        result.proof,
                        (contractAction as { merchant: Hex }).merchant,
                        contractAction.productId,
                        contractAction.orderId,
                    );
                } else {
                    await contract.submitAlipayFiatProof(
                        result.proof,
                        contractAction.productId,
                        contractAction.orderId,
                    );
                }
            }

            if (onSuccess && contract.txHash) {
                onSuccess(contract.txHash);
            }
        } catch {
            // Errors are already captured in tlsn.error / contract.error
        }
    }, [tlsn, contract, wallet, network, plugin, contractAction, onSuccess]);

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
            <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${tlsn.isExtensionAvailable ? 'bg-[var(--state-success)]' : 'bg-[var(--state-danger)]'}`} />
                    <span className="text-[var(--text-subtle)]">
                        {tlsn.isExtensionAvailable ? 'Extension connected' : 'Extension not detected'}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${tlsn.isVerifierRunning ? 'bg-[var(--state-success)]' : 'bg-[var(--state-danger)]'}`} />
                    <span className="text-[var(--text-subtle)]">
                        {tlsn.isVerifierRunning ? 'Verifier online' : 'Verifier offline'}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={tlsn.checkStatus}
                    className="ml-auto text-xs text-[var(--state-info)] hover:text-[color:rgb(141_194_255)]"
                >
                    Refresh status
                </button>
            </div>

            {!wallet.isConnected && (
                <div role="alert" aria-live="assertive" className="rounded border border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(113_63_18_/_24%)] p-2 text-xs text-[var(--state-warning)]">
                    Please connect your wallet first
                </div>
            )}

            {!tlsn.isExtensionAvailable && (
                <div role="alert" aria-live="assertive" className="rounded border border-[color:rgb(240_185_11_/_45%)] bg-[color:rgb(113_63_18_/_24%)] p-2 text-xs text-[var(--state-warning)]">
                    Please install the TLSN Extension and refresh the page
                </div>
            )}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setShowPluginPicker(!showPluginPicker)}
                    aria-label="Select verification plugin"
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
                    ? 'Verifying…'
                    : contract.status === 'success'
                    ? 'Verified'
                    : contract.status === 'error' || tlsn.status === 'error'
                    ? 'Retry verification'
                    : 'Start payment verification'}
            </button>

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
