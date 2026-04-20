"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { injectOrderBindingHash, type OrderBindingContext, computeOrderBindingHash } from '@/lib/proofTransformer';
import type { Hex } from 'viem';

export type TlsnStatus = 'idle' | 'loading-plugin' | 'proving' | 'done' | 'error';

export interface PluginResult {
    results?: Array<{ value: string }>;
    displayResults?: Array<{ value: string }>;
    proofs?: { contacts: any; transfer: any };
    [key: string]: any;
}

export interface UseTlsnReturn {
    isExtensionAvailable: boolean;
    isVerifierRunning: boolean;
    status: TlsnStatus;
    error: string | null;
    result: PluginResult | null;
    /** Run a plugin. Pass an OrderBindingContext to bind the proof to a specific order. */
    runPlugin: (pluginUrl: string, orderCtx?: OrderBindingContext) => Promise<PluginResult>;
    checkStatus: () => Promise<void>;
}

export function useTlsnExtension(): UseTlsnReturn {
    const [isExtensionAvailable, setIsExtensionAvailable] = useState(false);
    const [isVerifierRunning, setIsVerifierRunning] = useState(false);
    const [status, setStatus] = useState<TlsnStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PluginResult | null>(null);
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

    // Auto-check on mount + listen for extension_loaded event
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const doCheck = () => {
            if (!checkedRef.current) {
                checkedRef.current = true;
                checkStatus();
            }
        };

        // Extension might load after our component, so poll briefly
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

    const runPlugin = useCallback(async (pluginUrl: string, orderCtx?: OrderBindingContext): Promise<PluginResult> => {
        setError(null);
        setResult(null);

        if (!checkExtension()) {
            const msg = 'TLSN extension not detected. Please install the extension.';
            setError(msg);
            setStatus('error');
            throw new Error(msg);
        }

        try {
            setStatus('loading-plugin');
            let pluginCode = await fetch(pluginUrl).then((r) => {
                if (!r.ok) throw new Error(`Failed to load plugin: ${r.status}`);
                return r.text();
            });

            // Inject order-binding hash so the verifier signs it into the proof
            if (orderCtx) {
                const bindingHash: Hex = computeOrderBindingHash(orderCtx);
                pluginCode = injectOrderBindingHash(pluginCode, bindingHash);
            }

            setStatus('proving');
            const resultStr = await window.tlsn!.execCode(pluginCode);
            const parsed: PluginResult = JSON.parse(resultStr);

            setResult(parsed);
            setStatus('done');
            return parsed;
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
