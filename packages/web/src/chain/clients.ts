"use client";
import {
    getPublicClient as wagmiGetPublicClient,
    getWalletClient as wagmiGetWalletClient,
} from '@wagmi/core';
import { usePublicClient as wagmiUsePublicClient } from 'wagmi';
import { wagmiConfig } from './wagmiConfig';

// wagmi narrows chainId to the union of declared chains in `createConfig`.
// We accept `number` at the API surface (runtime-validated via NETWORK_REGISTRY)
// and cast to the proper union internally so downstream client types still
// carry chain info — `as never` would collapse `writeContract` args.
type ChainId = (typeof wagmiConfig)['chains'][number]['id'];

/** React hook — use inside components & custom hooks (subscribes to chain changes). */
export function usePublicClient(params?: { chainId?: number }) {
    return wagmiUsePublicClient(
        params ? { chainId: params.chainId as ChainId | undefined } : undefined,
    );
}

/** Imperative — use inside callbacks / effects / non-React code. */
export function getPublicClient(chainId: number) {
    const c = wagmiGetPublicClient(wagmiConfig, { chainId: chainId as ChainId });
    if (!c) throw new Error(`No public client for chain ${chainId}`);
    return c;
}

/** Imperative wallet client — throws if no wallet connected on `chainId`. */
export async function getWalletClient(chainId: number) {
    const c = await wagmiGetWalletClient(wagmiConfig, { chainId: chainId as ChainId });
    if (!c) throw new Error('Wallet not connected');
    return c;
}
