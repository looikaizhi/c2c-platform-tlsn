"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { C2C_RISK_MANAGER_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { usePublicClient } from '@/chain/clients';

export interface ReputationData {
    completedCount: number;
    timeoutCount: number;
    consecutiveTimeouts: number;
    completedSinceLastTimeout: number;
    riskLevel: number;
    bondBps: number;
    temporarilyFrozen: boolean;
    blacklisted: boolean;
    frozenUntil: number;
    riskLabel: 'Low' | 'Medium' | 'High' | 'Critical' | 'Frozen' | 'Blacklisted';
}

export function useReputation(address?: Address) {
    const { network } = useNetwork();
    const publicClient = usePublicClient();
    const [data, setData] = useState<ReputationData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refetchCount, setRefetchCount] = useState(0);

    useEffect(() => {
        if (!address || !network.contracts.c2cRiskManager || !publicClient) return;
        let cancelled = false;
        setLoading(true);
        setError(null);

        const doFetch = async () => {
            try {
                const [rep, bps] = await Promise.all([
                    publicClient.readContract({
                        address: network.contracts.c2cRiskManager!,
                        abi: C2C_RISK_MANAGER_ABI,
                        functionName: 'getReputation',
                        args: [address],
                    }),
                    publicClient.readContract({
                        address: network.contracts.c2cRiskManager!,
                        abi: C2C_RISK_MANAGER_ABI,
                        functionName: 'requiredBondBps',
                        args: [address],
                    }),
                ]);

                if (cancelled) return;

                let riskLabel: ReputationData['riskLabel'] = 'Low';
                if (rep.blacklisted) riskLabel = 'Blacklisted';
                else if (rep.temporarilyFrozen) riskLabel = 'Frozen';
                else if (rep.riskLevel >= 8) riskLabel = 'Critical';
                else if (rep.riskLevel >= 5) riskLabel = 'High';
                else if (rep.riskLevel >= 2) riskLabel = 'Medium';

                setData({
                    completedCount: rep.completedCount,
                    timeoutCount: rep.timeoutCount,
                    consecutiveTimeouts: rep.consecutiveTimeouts,
                    completedSinceLastTimeout: rep.completedSinceLastTimeout,
                    riskLevel: rep.riskLevel,
                    bondBps: bps,
                    temporarilyFrozen: rep.temporarilyFrozen,
                    blacklisted: rep.blacklisted,
                    frozenUntil: Number(rep.frozenUntil),
                    riskLabel,
                });
            } catch (err: any) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void doFetch();
        return () => { cancelled = true; };
    }, [address, refetchCount, network, publicClient]);

    const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

    return { data, loading, error, refetch };
}
