import { useState, useEffect } from 'react';
import { buildContractProof, type ExtensionProveResponse } from '../utils/proofTransformer';
import { submitProofToContract, type SubmitAction } from '../utils/contractSubmitter';
import { isContractConfigured } from '../utils/contractConfig';
import { discoverWallets, type EIP6963ProviderDetail } from '../utils/walletDiscovery';
import type { Hex } from 'viem';

type SubmitStatus = 'idle' | 'building' | 'confirming' | 'pending' | 'success' | 'error';

interface ContractSubmitProps {
    proveResponse?: ExtensionProveResponse;
    wiseProofs?: {
        contacts: ExtensionProveResponse;
        transfer: ExtensionProveResponse;
    };
    pluginKey: string;
}

export function ContractSubmit({ proveResponse, wiseProofs, pluginKey: _pluginKey }: ContractSubmitProps) {
    const [status, setStatus] = useState<SubmitStatus>('idle');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [wallets, setWallets] = useState<EIP6963ProviderDetail[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<EIP6963ProviderDetail | null>(null);

    useEffect(() => {
        // Small delay so wallets have time to announce via EIP-6963
        const timer = setTimeout(() => {
            const found = discoverWallets();
            setWallets(found);
            // Auto-select MetaMask if available, otherwise first wallet
            const mm = found.find((w) => w.info.rdns === 'io.metamask');
            setSelectedWallet(mm ?? found[0] ?? null);
        }, 200);
        return () => clearTimeout(timer);
    }, []);

    const singleProof = proveResponse;
    const hasWiseProofs = wiseProofs?.contacts && wiseProofs?.transfer;

    const canSubmit =
        isContractConfigured() &&
        (hasWiseProofs
            ? wiseProofs.transfer.verifierSignature &&
              (wiseProofs.transfer.transcriptCommitOpenings?.length ?? 0) > 0 &&
              wiseProofs.contacts.verifierSignature &&
              (wiseProofs.contacts.transcriptCommitOpenings?.length ?? 0) > 0
            : singleProof?.verifierSignature &&
              (singleProof?.transcriptCommitOpenings?.length ?? 0) > 0);

    const handleSubmit = async () => {
        try {
            setError(null);
            setStatus('building');

            const provider = selectedWallet?.provider;

            if (hasWiseProofs) {
                const contactsContractProof = buildContractProof(wiseProofs.contacts);
                const transferContractProof = buildContractProof(wiseProofs.transfer);

                setStatus('confirming');

                const action: SubmitAction = {
                    type: 'payOrderByWise',
                    merchant: '0x0000000000000000000000000000000000000000' as Hex,
                    productId: 0n,
                    orderId: 0n,
                    contactsProof: contactsContractProof,
                };

                const { hash } = await submitProofToContract(transferContractProof, action, provider);
                setTxHash(hash);
            } else if (singleProof) {
                const contractProof = buildContractProof(singleProof);

                setStatus('confirming');

                const action: SubmitAction = { type: 'registerMerchant' };
                const { hash } = await submitProofToContract(contractProof, action, provider);
                setTxHash(hash);
            }

            setStatus('success');
        } catch (err: any) {
            setError(err.shortMessage || err.message || String(err));
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

    if (!canSubmit) {
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
            {/* Wallet selector */}
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

            {/* Selected wallet indicator (when only 1 wallet) */}
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

            <button
                onClick={handleSubmit}
                disabled={isProcessing}
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
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    opacity: isProcessing ? 0.7 : 1,
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
