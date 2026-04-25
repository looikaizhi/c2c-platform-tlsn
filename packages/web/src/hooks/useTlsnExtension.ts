"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    computeOrderBindingHash,
    injectOrderBindingHash,
    injectMerchantNameHash,
    injectMerchantIdHash,
    injectPayeeNameHash,
    injectPayeeIdHash,
    injectTransferOrderBindingHash,
    type OrderBindingContext,
    type ExtensionProveResponse,
} from '@/lib/proofTransformer';

export type TlsnStatus = 'idle' | 'loading-plugin' | 'proving' | 'done' | 'error';

export interface RunPluginOptions {
    bindingContext?: OrderBindingContext;
    onStep?: (step: string) => void;
}

export interface TlsnResult {
    proofType: 'single' | 'dual';
    singleProof?: ExtensionProveResponse;
    contactsProof?: ExtensionProveResponse;
    transferProof?: ExtensionProveResponse;
}

export interface UseTlsnReturn {
    isExtensionAvailable: boolean;
    isVerifierRunning: boolean;
    status: TlsnStatus;
    error: string | null;
    result: TlsnResult | null;
    /** Run a plugin. Pass RunPluginOptions.bindingContext to bind the proof to a specific order. */
    runPlugin: (pluginUrl: string, options?: RunPluginOptions) => Promise<TlsnResult>;
    checkStatus: () => Promise<void>;
}

export function useTlsnExtension(): UseTlsnReturn {
    const [isExtensionAvailable, setIsExtensionAvailable] = useState(false);
    const [isVerifierRunning, setIsVerifierRunning] = useState(false);
    const [status, setStatus] = useState<TlsnStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TlsnResult | null>(null);
    const checkedRef = useRef(false);

    const verifierHost = process.env.NEXT_PUBLIC_VERIFIER_HOST || 'localhost:7047';
    const verifierProtocol = process.env.NEXT_PUBLIC_VERIFIER_SSL === 'true' ? 'https' : 'http';

    const checkExtension = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;
        return typeof window.tlsn?.execCode === 'function';
    }, []);

    const checkVerifier = useCallback(async (): Promise<boolean> => {
        try {
            const res = await fetch(`${verifierProtocol}://${verifierHost}/health`, {
                signal: AbortSignal.timeout(3000),
            });
            return res.ok;
        } catch {
            return false;
        }
    }, [verifierHost, verifierProtocol]);

    const checkStatus = useCallback(async () => {
        setIsExtensionAvailable(checkExtension());
        setIsVerifierRunning(await checkVerifier());
    }, [checkExtension, checkVerifier]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const doCheck = () => {
            if (!checkedRef.current) {
                checkedRef.current = true;
                checkStatus();
            }
        };

        const timer = setTimeout(doCheck, 500);

        const handleExtensionLoaded = () => {
            setIsExtensionAvailable(true);
        };
        window.addEventListener('extension_loaded', handleExtensionLoaded);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('extension_loaded', handleExtensionLoaded);
        };
    }, [checkStatus]);

    const runPlugin = useCallback(async (pluginUrl: string, options?: RunPluginOptions): Promise<TlsnResult> => {
        setError(null);
        setResult(null);

        if (!checkExtension()) {
            const msg = 'TLSN extension not detected. Please install the extension.';
            setError(msg);
            setStatus('error');
            throw new Error(msg);
        }

        try {
            options?.onStep?.('loading-plugin');
            setStatus('loading-plugin');
            let pluginCode = await fetch(pluginUrl).then((r) => {
                if (!r.ok) throw new Error(`Failed to load plugin: ${r.status}`);
                return r.text();
            });

            if (options?.bindingContext) {
                const ctx = options.bindingContext;
                const bindingHash = computeOrderBindingHash(ctx);
                pluginCode = injectOrderBindingHash(pluginCode, bindingHash);
                pluginCode = injectMerchantNameHash(pluginCode, ctx.merchantNameHash);
                pluginCode = injectMerchantIdHash(pluginCode, ctx.merchantIdHash);
                pluginCode = injectPayeeNameHash(pluginCode, ctx.payeeNameHash);
                pluginCode = injectPayeeIdHash(pluginCode, ctx.payeeIdHash);
                // For Wise: inject transfer binding hash using same context (same hash)
                pluginCode = injectTransferOrderBindingHash(pluginCode, bindingHash);
            }

            options?.onStep?.('proving');
            setStatus('proving');
            const resultStr = await window.tlsn!.execCode(pluginCode);
            const raw = JSON.parse(resultStr);

            // Detect dual-proof (Wise) vs single-proof (Alipay/generic)
            let tlsnResult: TlsnResult;
            if (raw?.proofs?.contacts && raw?.proofs?.transfer) {
                tlsnResult = {
                    proofType: 'dual',
                    contactsProof: raw.proofs.contacts as ExtensionProveResponse,
                    transferProof: raw.proofs.transfer as ExtensionProveResponse,
                };
            } else {
                tlsnResult = {
                    proofType: 'single',
                    singleProof: raw as ExtensionProveResponse,
                };
            }

            setResult(tlsnResult);
            setStatus('done');
            options?.onStep?.('done');
            return tlsnResult;
        } catch (err: any) {
            const msg = err.message || String(err);
            setError(msg);
            setStatus('error');
            throw err;
        }
    }, [checkExtension]);

    return {
        isExtensionAvailable,
        isVerifierRunning,
        status,
        error,
        result,
        runPlugin,
        checkStatus,
    };
}
