"use client";
import { useState, useEffect, useCallback } from 'react';
import {
    discoverWallets,
    getProvider,
    type EIP6963ProviderDetail,
} from '@/lib/walletDiscovery';
import type { Hex } from 'viem';

export interface WalletState {
    address: Hex | null;
    chainId: number | null;
    isConnected: boolean;
    wallets: EIP6963ProviderDetail[];
    selectedWallet: EIP6963ProviderDetail | null;
    isConnecting: boolean;
    error: string | null;
    connect: (wallet?: EIP6963ProviderDetail) => Promise<void>;
    disconnect: () => void;
    switchChain: (chainId: number) => Promise<void>;
}

export function useWallet(): WalletState {
    const [address, setAddress] = useState<Hex | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [wallets, setWallets] = useState<EIP6963ProviderDetail[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<EIP6963ProviderDetail | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Discover wallets on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            const found = discoverWallets();
            setWallets(found);
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    // Listen for account/chain changes
    useEffect(() => {
        if (!selectedWallet) return;
        const provider = selectedWallet.provider;

        const handleAccountsChanged = (accounts: string[]) => {
            if (accounts.length === 0) {
                setAddress(null);
                setSelectedWallet(null);
            } else {
                setAddress(accounts[0] as Hex);
            }
        };

        const handleChainChanged = (chainIdHex: string) => {
            setChainId(parseInt(chainIdHex, 16));
        };

        provider.on?.('accountsChanged', handleAccountsChanged);
        provider.on?.('chainChanged', handleChainChanged);

        return () => {
            provider.removeListener?.('accountsChanged', handleAccountsChanged);
            provider.removeListener?.('chainChanged', handleChainChanged);
        };
    }, [selectedWallet]);

    const connect = useCallback(async (wallet?: EIP6963ProviderDetail) => {
        setIsConnecting(true);
        setError(null);
        try {
            const provider = wallet ? wallet.provider : getProvider();
            const accounts: string[] = await provider.request({
                method: 'eth_requestAccounts',
            });
            const chainHex: string = await provider.request({
                method: 'eth_chainId',
            });

            setAddress(accounts[0] as Hex);
            setChainId(parseInt(chainHex, 16));
            setSelectedWallet(wallet ?? null);
        } catch (err: any) {
            setError(err.message || 'Failed to connect wallet');
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(() => {
        setAddress(null);
        setChainId(null);
        setSelectedWallet(null);
        setError(null);
    }, []);

    const switchChain = useCallback(async (targetChainId: number) => {
        if (!selectedWallet) return;
        try {
            await selectedWallet.provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }],
            });
        } catch (err: any) {
            setError(err.message || 'Failed to switch chain');
        }
    }, [selectedWallet]);

    return {
        address,
        chainId,
        isConnected: !!address,
        wallets,
        selectedWallet,
        isConnecting,
        error,
        connect,
        disconnect,
        switchChain,
    };
}
