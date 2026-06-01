"use client";
import { useState, useEffect } from 'react';
import { usePublicClient } from '@/chain/clients';
import { useNetwork } from '@/contexts/NetworkContext';
import { useWallet } from '@/hooks/useWallet';

const ADMIN_VIEW_ABI = [
    {
        name: 'admin',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
    },
] as const;

export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
    const { network } = useNetwork();
    const { address, isConnected } = useWallet();
    const publicClient = usePublicClient();
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isConnected || !address || !network.contracts.c2cAdmin || !publicClient) {
            setIsAdmin(false);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        (async () => {
            try {
                const adminAddr = await publicClient.readContract({
                    address: network.contracts.c2cAdmin,
                    abi: ADMIN_VIEW_ABI,
                    functionName: 'admin',
                });
                if (!cancelled) {
                    setIsAdmin((adminAddr as string).toLowerCase() === address.toLowerCase());
                }
            } catch {
                if (!cancelled) setIsAdmin(false);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [address, isConnected, network, publicClient]);

    return { isAdmin, isLoading };
}
