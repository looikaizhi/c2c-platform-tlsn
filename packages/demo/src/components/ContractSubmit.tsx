import { useEffect, useMemo, useState } from 'react';
import type { Hex } from 'viem';

import { config } from '../config';
import {
    buildContractProof,
    buildProofDebugSnapshot,
    type ExtensionProveResponse,
} from '../utils/proofTransformer';
import { submitProofToContract, type SubmitAction } from '../utils/contractSubmitter';
import { isContractConfigured } from '../utils/contractConfig';
import { formatContractAwareError } from '../utils/contractErrors';
import { discoverWallets, type EIP6963ProviderDetail } from '../utils/walletDiscovery';

type SubmitStatus = 'idle' | 'building' | 'confirming' | 'pending' | 'success' | 'error';

type SubmitActionInput =
    | { type: 'registerMerchant' }
    | { type: 'payOrderByPlatform'; merchant: Hex; productId: bigint; orderId: bigint }
    | { type: 'receiveCryptoWithPlatformPayment'; productId: bigint; orderId: bigint };

interface ContractSubmitProps {
    proveResponse?: ExtensionProveResponse;
    wiseProofs?: {
        contacts: ExtensionProveResponse;
        transfer: ExtensionProveResponse;
    };
    pluginKey: string;
    submitAction?: SubmitActionInput;
}

interface BuiltActionResult {
    action: SubmitAction;
    patchProofs: ExtensionProveResponse[];
}

function formatError(err: unknown): string {
    return formatContractAwareError(err);
}

function collectSessionIds(proofs: ExtensionProveResponse[]): string[] {
    const ids = new Set<string>();
    for (const p of proofs) {
        const sid = p.verifierSignature?.sessionId;
        if (sid) ids.add(sid);
    }
    return [...ids];
}

function actionLabel(action?: SubmitActionInput): string {
    if (!action) return 'N/A';
    if (action.type === 'registerMerchant') return 'registerMerchant';
    if (action.type === 'payOrderByPlatform') {
        return `payOrderByPlatform(productId=${action.productId}, orderId=${action.orderId})`;
    }
    return `receiveCryptoWithPlatformPayment(productId=${action.productId}, orderId=${action.orderId})`;
}

function isProofReady(proof?: ExtensionProveResponse): boolean {
    return !!proof?.verifierSignature && (proof?.transcriptCommitOpenings?.length ?? 0) > 0;
}

async function patchProofTxBacklink(
    proofs: ExtensionProveResponse[],
    txHash: Hex,
    chainId: number,
): Promise<{ patched: number; failed: number }> {
    const sessionIds = collectSessionIds(proofs);
    if (!sessionIds.length) return { patched: 0, failed: 0 };

    let patched = 0;
    let failed = 0;

    await Promise.all(
        sessionIds.map(async (sessionId) => {
            try {
                const resp = await fetch(`${config.verifierUrl}/proof/${sessionId}/tx`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ txHash, chainId }),
                });
                if (!resp.ok) {
                    failed += 1;
                    return;
                }
                patched += 1;
            } catch {
                failed += 1;
            }
        }),
    );

    return { patched, failed };
}

export function ContractSubmit({ proveResponse, wiseProofs, pluginKey, submitAction }: ContractSubmitProps) {
    const [status, setStatus] = useState<SubmitStatus>('idle');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const [wallets, setWallets] = useState<EIP6963ProviderDetail[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<EIP6963ProviderDetail | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            const found = discoverWallets();
            setWallets(found);
            const mm = found.find((w) => w.info.rdns === 'io.metamask');
            setSelectedWallet(mm ?? found[0] ?? null);
        }, 200);
        return () => clearTimeout(timer);
    }, []);

    const hasWiseProofs = !!(wiseProofs?.contacts && wiseProofs?.transfer);
    const hasSingleProof = !!proveResponse;

    const proofReady = hasWiseProofs
        ? isProofReady(wiseProofs?.contacts) && isProofReady(wiseProofs?.transfer)
        : isProofReady(proveResponse);

    const actionValidationError = useMemo(() => {
        if (!hasWiseProofs && !hasSingleProof) {
            return 'No proof available for submission.';
        }

        if (hasWiseProofs) {
            if (!submitAction) {
                return 'Wise proof submission requires submitAction context (merchant/productId/orderId).';
            }
            if (submitAction.type === 'registerMerchant') {
                return 'Wise proof cannot be submitted with registerMerchant action.';
            }
            return null;
        }

        if (!submitAction && pluginKey !== 'binance') {
            return 'Missing submitAction context for payment proof submission.';
        }

        return null;
    }, [hasSingleProof, hasWiseProofs, pluginKey, submitAction]);

    const canSubmit =
        isContractConfigured() &&
        proofReady &&
        !actionValidationError &&
        !!selectedWallet?.provider;

    function buildSubmitAction(): BuiltActionResult {
        if (hasWiseProofs) {
            if (!submitAction || submitAction.type === 'registerMerchant') {
                throw new Error('Wise proof submission requires a payment action with order context.');
            }

            const contactsProof = buildContractProof(wiseProofs!.contacts);
            const transferProof = buildContractProof(wiseProofs!.transfer);
            const proofs = [contactsProof, transferProof];

            if (submitAction.type === 'payOrderByPlatform') {
                return {
                    action: {
                        type: 'payOrderByPlatform',
                        merchant: submitAction.merchant,
                        productId: submitAction.productId,
                        orderId: submitAction.orderId,
                        proofs,
                    },
                    patchProofs: [wiseProofs!.contacts, wiseProofs!.transfer],
                };
            }

            return {
                action: {
                    type: 'receiveCryptoWithPlatformPayment',
                    productId: submitAction.productId,
                    orderId: submitAction.orderId,
                    proofs,
                },
                patchProofs: [wiseProofs!.contacts, wiseProofs!.transfer],
            };
        }

        if (!proveResponse) {
            throw new Error('No proof to submit.');
        }

        const proof = buildContractProof(proveResponse);
        const effectiveAction: SubmitActionInput = submitAction ?? { type: 'registerMerchant' };

        if (effectiveAction.type === 'registerMerchant') {
            return {
                action: { type: 'registerMerchant', proof },
                patchProofs: [proveResponse],
            };
        }

        if (effectiveAction.type === 'payOrderByPlatform') {
            return {
                action: {
                    type: 'payOrderByPlatform',
                    merchant: effectiveAction.merchant,
                    productId: effectiveAction.productId,
                    orderId: effectiveAction.orderId,
                    proofs: [proof],
                },
                patchProofs: [proveResponse],
            };
        }

        return {
            action: {
                type: 'receiveCryptoWithPlatformPayment',
                productId: effectiveAction.productId,
                orderId: effectiveAction.orderId,
                proofs: [proof],
            },
            patchProofs: [proveResponse],
        };
    }

    const handleSubmit = async () => {
        let debugSnapshots: unknown[] = [];
        try {
            setError(null);
            setNote(null);
            setTxHash(null);
            setStatus('building');

            const provider = selectedWallet?.provider;
            if (!provider) {
                throw new Error('No wallet selected. Please select an available wallet first.');
            }

            const { action, patchProofs } = buildSubmitAction();
            try {
                debugSnapshots = await Promise.all(patchProofs.map((proof) => buildProofDebugSnapshot(proof)));
            } catch {
                debugSnapshots = [];
            }
            setStatus('confirming');

            const chainIdHex = await provider.request({ method: 'eth_chainId' });
            const chainId = parseInt(chainIdHex as string, 16);

            const { hash, waitForReceipt } = await submitProofToContract(action, provider);
            setTxHash(hash);
            setStatus('pending');
            await waitForReceipt();

            const patchResult = await patchProofTxBacklink(patchProofs, hash, chainId);
            if (patchResult.failed > 0) {
                setNote(
                    `Transaction submitted, but verifier tx backlink failed for ${patchResult.failed} proof session(s).`,
                );
            } else if (patchResult.patched > 0) {
                setNote(`Verifier tx backlink updated for ${patchResult.patched} session(s).`);
            }

            setStatus('success');
        } catch (err) {
            setError(formatError(err));
            if (debugSnapshots.length > 0) {
                setNote(`Proof diagnostics: ${JSON.stringify(debugSnapshots)}`);
            }
            setStatus('error');
        }
    };

    if (!isContractConfigured()) {
        return (
            <div
                style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#f8f9fa',
                    color: '#6c757d',
                    fontSize: '12px',
                    border: '1px solid #dee2e6',
                }}
            >
                Contract addresses not configured. Set <code>VITE_C2C_ADMIN_ADDRESS</code> and{' '}
                <code>VITE_C2C_ESCROW_ADDRESS</code> in <code>.env</code> to enable on-chain submission.
            </div>
        );
    }

    if (!proofReady) {
        return (
            <div
                style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#fff3cd',
                    color: '#856404',
                    fontSize: '12px',
                    border: '1px solid #ffeeba',
                }}
            >
                Proof data incomplete for on-chain submission. Ensure plugin uses{' '}
                <code>transcriptCommitHashAlg: 'Keccak256'</code> and{' '}
                <code>exposeOpenings: true</code>.
            </div>
        );
    }

    if (actionValidationError) {
        return (
            <div
                style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#fff3cd',
                    color: '#856404',
                    fontSize: '12px',
                    border: '1px solid #ffeeba',
                }}
            >
                {actionValidationError}
            </div>
        );
    }

    const statusLabels: Record<SubmitStatus, string> = {
        idle: 'Submit to Contract',
        building: 'Building proof...',
        confirming: 'Confirm in wallet...',
        pending: 'Waiting for confirmation...',
        success: 'Submitted!',
        error: 'Retry',
    };

    const isProcessing = status === 'building' || status === 'confirming' || status === 'pending';

    return (
        <div style={{ marginTop: '8px' }}>
            {wallets.length > 1 && (
                <div
                    style={{
                        display: 'flex',
                        gap: '6px',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                    }}
                >
                    {wallets.map((w) => (
                        <button
                            key={w.info.uuid}
                            onClick={() => setSelectedWallet(w)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border:
                                    selectedWallet?.info.uuid === w.info.uuid
                                        ? '2px solid #0d6efd'
                                        : '1px solid #dee2e6',
                                backgroundColor:
                                    selectedWallet?.info.uuid === w.info.uuid ? '#e7f1ff' : '#fff',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: selectedWallet?.info.uuid === w.info.uuid ? 600 : 400,
                            }}
                        >
                            <img
                                src={w.info.icon}
                                alt={w.info.name}
                                style={{ width: '16px', height: '16px', borderRadius: '3px' }}
                            />
                            {w.info.name}
                        </button>
                    ))}
                </div>
            )}

            {wallets.length === 1 && selectedWallet && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '6px',
                        fontSize: '11px',
                        color: '#6c757d',
                    }}
                >
                    <img
                        src={selectedWallet.info.icon}
                        alt={selectedWallet.info.name}
                        style={{ width: '14px', height: '14px', borderRadius: '2px' }}
                    />
                    {selectedWallet.info.name}
                </div>
            )}

            <div
                style={{
                    marginBottom: '8px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    fontSize: '11px',
                    color: '#6c757d',
                }}
            >
                Action: {actionLabel(submitAction ?? (pluginKey === 'binance' ? { type: 'registerMerchant' } : undefined))}
            </div>

            <button
                onClick={handleSubmit}
                disabled={isProcessing || !canSubmit}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor:
                        status === 'success'
                            ? '#28a745'
                            : status === 'error'
                                ? '#dc3545'
                                : '#0d6efd',
                    color: 'white',
                    border: 'none',
                    cursor: isProcessing || !canSubmit ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    opacity: isProcessing || !canSubmit ? 0.7 : 1,
                }}
            >
                {statusLabels[status]}
            </button>

            {txHash && (
                <div
                    style={{
                        marginTop: '6px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        backgroundColor: '#d4edda',
                        color: '#155724',
                        fontSize: '11px',
                        wordBreak: 'break-all',
                        border: '1px solid #c3e6cb',
                    }}
                >
                    TX: {txHash}
                </div>
            )}

            {note && (
                <div
                    style={{
                        marginTop: '6px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        backgroundColor: '#e7f1ff',
                        color: '#084298',
                        fontSize: '11px',
                        wordBreak: 'break-word',
                        border: '1px solid #b6d4fe',
                    }}
                >
                    {note}
                </div>
            )}

            {error && (
                <div
                    style={{
                        marginTop: '6px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        fontSize: '11px',
                        wordBreak: 'break-all',
                        border: '1px solid #f5c6cb',
                    }}
                >
                    {error}
                </div>
            )}
        </div>
    );
}
