"use client";
import { useCallback, useState } from 'react';
import type { Hex } from 'viem';
import { C2C_RISK_MANAGER_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient, getWalletClient } from '@/chain/clients';

export interface RiskConfig {
    min: number;
    base: number;
    max: number;
    step: number;
    reset: number;
    freezeThr: number;
    rewardThr: number;
    decayDays: number;
}

export interface ReputationView {
    completedCount: number;
    timeoutCount: number;
    consecutiveTimeouts: number;
    completedSinceLastTimeout: number;
    riskLevel: number;
    temporarilyFrozen: boolean;
    blacklisted: boolean;
    frozenUntil: bigint;
    lastTimeoutAt: bigint;
}

export function useRiskManager() {
    const { network, walletChainId } = useNetwork();
    const [error, setError] = useState<string | null>(null);

    function assertChain() {
        if (walletChainId !== null && walletChainId !== network.chainId) {
            throw new Error(`Switch wallet to ${network.name} (chainId ${walletChainId})`);
        }
    }

    const readConfig = useCallback(async (): Promise<RiskConfig | null> => {
        const publicClient = getPublicClient(network.chainId);
        const rm = network.contracts.c2cRiskManager;
        if (!rm || rm.length <= 2) return null;
        try {
            const [min, base, max, step, reset, fz, rw, decay] = await Promise.all([
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'minBondBps' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'baseBondBps' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'maxBondBps' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'stepBps' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'resetThreshold' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'freezeThreshold' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'rewardCompletedThreshold' }),
                publicClient.readContract({ address: rm, abi: C2C_RISK_MANAGER_ABI, functionName: 'decayIntervalDays' }),
            ]);
            return {
                min:        Number(min),
                base:       Number(base),
                max:        Number(max),
                step:       Number(step),
                reset:      Number(reset),
                freezeThr:  Number(fz),
                rewardThr:  Number(rw),
                decayDays:  Number(decay),
            };
        } catch (e: any) {
            setError(e?.message ?? 'read failed');
            return null;
        }
    }, [network]);

    const setConfig = useCallback(async (cfg: RiskConfig) => {
        assertChain();
        const publicClient = getPublicClient(network.chainId);
        const walletClient = await getWalletClient(network.chainId);
        const account = walletClient.account;
        if (!account) throw new Error('Wallet not connected');
        const hash = await walletClient.writeContract({
            address:      network.contracts.c2cRiskManager,
            abi:          C2C_RISK_MANAGER_ABI,
            functionName: 'setRiskConfig',
            args:         [cfg.min, cfg.base, cfg.max, cfg.step, cfg.reset, cfg.freezeThr, cfg.rewardThr, cfg.decayDays],
            account,
            chain:        publicClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }, [network, walletChainId]);

    const setBlacklist = useCallback(async (user: Hex, on: boolean) => {
        assertChain();
        const publicClient = getPublicClient(network.chainId);
        const walletClient = await getWalletClient(network.chainId);
        const account = walletClient.account;
        if (!account) throw new Error('Wallet not connected');
        const hash = await walletClient.writeContract({
            address:      network.contracts.c2cRiskManager,
            abi:          C2C_RISK_MANAGER_ABI,
            functionName: 'setBlacklist',
            args:         [user, on],
            account,
            chain:        publicClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }, [network, walletChainId]);

    const manualUnfreeze = useCallback(async (user: Hex) => {
        assertChain();
        const publicClient = getPublicClient(network.chainId);
        const walletClient = await getWalletClient(network.chainId);
        const account = walletClient.account;
        if (!account) throw new Error('Wallet not connected');
        const hash = await walletClient.writeContract({
            address:      network.contracts.c2cRiskManager,
            abi:          C2C_RISK_MANAGER_ABI,
            functionName: 'manualUnfreeze',
            args:         [user],
            account,
            chain:        publicClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }, [network, walletChainId]);

    const queryReputation = useCallback(async (user: Hex): Promise<ReputationView | null> => {
        const publicClient = getPublicClient(network.chainId);
        try {
            const v = await publicClient.readContract({
                address:      network.contracts.c2cRiskManager,
                abi:          C2C_RISK_MANAGER_ABI,
                functionName: 'getReputation',
                args:         [user],
            });
            return v as unknown as ReputationView;
        } catch (e: any) {
            setError(e?.message ?? 'query failed');
            return null;
        }
    }, [network]);

    return { error, readConfig, setConfig, setBlacklist, manualUnfreeze, queryReputation };
}
