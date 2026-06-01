"use client";
import { useState } from 'react';
import type { Address, Hex } from 'viem';
import { useTlsnExtension } from '@/hooks/useTlsnExtension';
import { useOrderFlow } from '@/hooks/useOrderFlow';
import { useWalletGate } from '@/hooks/useWalletGate';
import { useWallet } from '@/hooks/useWallet';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { platformByKey } from '@/platforms/registry';
import { makeBindingContext } from '@/proofs/bindingContext';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI } from '@/lib/contractAbi';
import { formatContractAwareError } from '@/lib/contractErrors';
import { patchProofTx } from '@/lib/proofsApi';

export type Platform  = 'wise' | 'alipay';
export type Direction = 'crypto' | 'fiat';
export type FlowStep  = 1 | 2 | 3 | 4 | 5;

export interface UseProofFlowArgs {
    merchant:   Address;
    productId:  bigint;
    orderId:    bigint;
    assetType:  0 | 1;
    /** When provided, Step 2 (platform select) is skipped. */
    platform?:  Platform;
    /** Defaults to (assetType === 0 ? 'crypto' : 'fiat'). */
    direction?: Direction;
    onProofSubmitted?: () => void;
}

export interface UseProofFlowReturn {
    tlsn:      ReturnType<typeof useTlsnExtension>;
    orderFlow: ReturnType<typeof useOrderFlow>;
    wallet:    ReturnType<typeof useWallet>;
    flowStep:  FlowStep;
    setFlowStep: (s: FlowStep) => void;
    platform:  Platform | null;
    setPlatform: (p: Platform | null) => void;
    direction: Direction;
    submitError: string | null;
    handleGenerateProof: () => Promise<void>;
    handleSubmitProof:   () => Promise<void>;
    walletGate: {
        showModal: boolean;
        closeModal: () => void;
    };
}

export function useProofFlow(args: UseProofFlowArgs): UseProofFlowReturn {
    const tlsn       = useTlsnExtension();
    const orderFlow  = useOrderFlow();
    const wallet     = useWallet();
    const { network } = useNetwork();
    const { requireWallet, showModal, closeModal } = useWalletGate();

    const direction: Direction = args.direction ?? (args.assetType === 0 ? 'crypto' : 'fiat');
    const [platform, setPlatform] = useState<Platform | null>(args.platform ?? null);
    const [flowStep, setFlowStep] = useState<FlowStep>(args.platform ? 3 : 1);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleGenerateProof = async () => {
        if (!platform || !wallet.address) return;
        const walletAddr = wallet.address;
        setSubmitError(null);
        try {
            const platformObj  = platformByKey(platform);
            const publicClient = getPublicClient(network.chainId);

            const [merchantInfoRaw, orderViewRaw] = await Promise.all([
                publicClient.readContract({
                    address:      network.contracts.c2cAdmin,
                    abi:          C2C_ADMIN_ABI,
                    functionName: 'getPlatformBinding',
                    args:         [args.merchant, platformObj.id],
                }),
                publicClient.readContract({
                    address:      network.contracts.c2cEscrow,
                    abi:          C2C_ESCROW_ABI,
                    functionName: 'getOrder',
                    args:         [args.merchant, args.productId, args.assetType, args.orderId],
                }),
            ]);
            const merchantInfo = merchantInfoRaw as { nameHash: Hex; idHash: Hex; isSet: boolean };
            const orderTuple   = orderViewRaw as unknown as readonly [Address, bigint, bigint, bigint, number, number, Hex, Hex, Hex];
            const orderBuyer       = orderTuple[0];
            const orderAmount      = orderTuple[1];
            const orderRate        = orderTuple[2];
            const orderDeadline    = orderTuple[3];
            const orderRateVersion = orderTuple[5];

            let buyerPayInfo: { nameHash: Hex; idHash: Hex; isSet: boolean } | null = null;
            if (direction === 'fiat') {
                buyerPayInfo = (await publicClient.readContract({
                    address:      network.contracts.c2cEscrow,
                    abi:          C2C_ESCROW_ABI,
                    functionName: 'getBuyerPaymentInfo',
                    args:         [args.merchant, args.productId, args.orderId],
                })) as { nameHash: Hex; idHash: Hex; isSet: boolean };
                if (!buyerPayInfo) throw new Error('Buyer payment info not found on-chain');
            }

            const ctx = makeBindingContext(direction, {
                merchantAddr:     args.merchant,
                buyerAddr:        direction === 'crypto' ? walletAddr : orderBuyer,
                productId:        args.productId,
                orderId:          args.orderId,
                amount:           orderAmount,
                rate:             orderRate,
                rateVersion:      BigInt(orderRateVersion),
                deadline:         orderDeadline,
                merchantNameHash: merchantInfo.nameHash,
                merchantIdHash:   merchantInfo.idHash,
                buyerNameHash:    buyerPayInfo?.nameHash,
                buyerIdHash:      buyerPayInfo?.idHash,
            }, network);

            await tlsn.runPlugin(platformObj, ctx);
            setFlowStep(4);
        } catch (err) {
            setSubmitError(formatContractAwareError(err));
        }
    };

    const handleSubmitProof = async () => {
        await requireWallet(async () => {
            setSubmitError(null);
            if (!tlsn.result || !platform) {
                setSubmitError('Proof not ready');
                return;
            }
            const res = await orderFlow.submitProof({
                platform,
                direction,
                merchant:  direction === 'crypto' ? args.merchant : undefined,
                productId: args.productId,
                orderId:   args.orderId,
                proof:     tlsn.result,
            });
            if (!res.ok) {
                setSubmitError(res.error ?? 'Submission failed');
                return;
            }

            // Best-effort verifier backfill: link each TLSN session to the on-chain tx.
            const txHash = orderFlow.txHash;
            if (txHash && wallet.address) {
                const sessionIds: string[] = [];
                if (tlsn.result.kind === 'dual') {
                    const c = tlsn.result.contacts?.verifierSignature?.sessionId;
                    const t = tlsn.result.transfer?.verifierSignature?.sessionId;
                    if (c) sessionIds.push(c);
                    if (t) sessionIds.push(t);
                } else {
                    const s = tlsn.result.proof?.verifierSignature?.sessionId;
                    if (s) sessionIds.push(s);
                }
                for (const sid of sessionIds) {
                    patchProofTx(sid, txHash, network.chainId, wallet.address).catch(() => { /* fire-and-forget */ });
                }
            }

            setFlowStep(5);
            args.onProofSubmitted?.();
        });
    };

    return {
        tlsn,
        orderFlow,
        wallet,
        flowStep,
        setFlowStep,
        platform,
        setPlatform,
        direction,
        submitError,
        handleGenerateProof,
        handleSubmitProof,
        walletGate: { showModal, closeModal },
    };
}
