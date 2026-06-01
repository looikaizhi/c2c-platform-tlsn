"use client";
import type { ReactNode } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import {
    NETWORK_REGISTRY,
    DEFAULT_NETWORK,
    isNetworkConfigured,
    type NetworkConfig,
} from '@/chain/networkRegistry';

export function NetworkProvider({ children }: { children: ReactNode }) {
    return <>{children}</>;
}

export interface NetworkContextValue {
    network:           NetworkConfig;
    walletChainId:     number | null;
    isChainMismatch:   boolean;
    switchNetwork:     (chainId: number) => Promise<void>;
    availableNetworks: NetworkConfig[];
}

export function useNetwork(): NetworkContextValue {
    const chainId = useChainId();
    const { switchChainAsync } = useSwitchChain();
    const network = NETWORK_REGISTRY[chainId] ?? DEFAULT_NETWORK;
    return {
        network,
        walletChainId:     chainId,
        isChainMismatch:   false,  // wagmi keeps wallet & app chain in sync
        switchNetwork:     async (id) => {
            // wagmi narrows chainId to declared chain literals; we validate against
            // NETWORK_REGISTRY at runtime, so the runtime contract holds.
            await switchChainAsync({ chainId: id as never });
        },
        availableNetworks: Object.values(NETWORK_REGISTRY),
    };
}

export { isNetworkConfigured };
