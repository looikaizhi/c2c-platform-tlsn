"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { runPlugin as runPluginPipeline } from '@/proofs/runner';
import type { OrderBindingContext } from '@/proofs/transformer';
import type { PaymentPlatform, PluginResult } from '@/platforms/types';

export type TlsnStatus = 'idle' | 'loading-plugin' | 'proving' | 'done' | 'error';

export interface RunPluginOptions {
    /** Required for dual-proof platforms (Wise). */
    transferContext?: OrderBindingContext;
    onStep?: (step: string) => void;
}

/** Re-export so legacy call sites can still annotate hook output. */
export type TlsnResult = PluginResult;

export interface UseTlsnReturn {
    isExtensionAvailable: boolean;
    isVerifierRunning:    boolean;
    status:               TlsnStatus;
    error:                string | null;
    result:               PluginResult | null;
    /** Run a platform plugin. Platform's `proofShape` decides single vs dual. */
    runPlugin: (
        platform: PaymentPlatform,
        ctx: OrderBindingContext,
        options?: RunPluginOptions,
    ) => Promise<PluginResult>;
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

    const runPlugin = useCallback(async (
        platform: PaymentPlatform,
        ctx: OrderBindingContext,
        options?: RunPluginOptions,
    ): Promise<PluginResult> => {
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

            options?.onStep?.('proving');
            setStatus('proving');
            const pluginResult = await runPluginPipeline(platform, ctx, {
                transferContext: options?.transferContext,
            });

            setResult(pluginResult);
            setStatus('done');
            options?.onStep?.('done');
            return pluginResult;
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
