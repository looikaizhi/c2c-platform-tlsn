"use client";
import { useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useConnectors, useSwitchChain } from 'wagmi';
import type { Hex } from 'viem';

export interface WalletEntry {
    id:    string;
    name:  string;
    icon?: string;
    /** Legacy shape for backward compat with components that read .info.* */
    info:  { name: string; icon?: string; uuid: string };
    /** Always undefined in wagmi mode — consumers must not pass through to APIs */
    provider?: undefined;
}

export interface UseWalletReturn {
    address:        Hex | null;
    chainId:        number | null;
    isConnected:    boolean;
    isConnecting:   boolean;
    error:          string | null;
    wallets:        WalletEntry[];
    selectedWallet: WalletEntry | null;
    connect:        (walletId?: string) => Promise<void>;
    disconnect:     () => void;
}

function toEntry(c: { id: string; name: string; icon?: string }): WalletEntry {
    return {
        id:       c.id,
        name:     c.name,
        icon:     c.icon,
        info:     { name: c.name, icon: c.icon, uuid: c.id },
        provider: undefined,
    };
}

export function useWallet(): UseWalletReturn {
    const { address, chainId, isConnected, connector } = useAccount();
    const { connectAsync, isPending: isConnecting, error: connectError } = useConnect();
    const { error: switchError } = useSwitchChain();
    const { disconnect } = useDisconnect();
    const connectors = useConnectors();

    const wallets = connectors.map(toEntry);
    const selectedWallet = connector ? toEntry(connector) : null;

    const connect = useCallback(async (walletId?: string) => {
        const target = walletId
            ? connectors.find((c) => c.id === walletId)
            : connectors[0];
        if (!target) throw new Error(`Connector ${walletId ?? '<default>'} not found`);
        await connectAsync({ connector: target });
    }, [connectAsync, connectors]);

    return {
        address: (address ?? null) as Hex | null,
        chainId: chainId ?? null,
        isConnected,
        isConnecting,
        error: connectError?.message ?? switchError?.message ?? null,
        wallets,
        selectedWallet,
        connect,
        disconnect: () => disconnect(),
    };
}

// Backward-compat alias used by contexts/WalletContext (until P9 deletes it)
export const useWalletContext = useWallet;
