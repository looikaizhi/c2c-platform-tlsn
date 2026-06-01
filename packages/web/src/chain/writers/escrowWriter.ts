"use client";
import type { Address, Hex } from 'viem';
import { runWrite } from '@/chain/txRunner.client';
import { NETWORK_REGISTRY } from '@/chain/networkRegistry';
import { C2C_ESCROW_ABI } from '@/lib/contractAbi';
import type { ContractTLSNProof } from '@/proofs/transformer';

function escrowAddress(chainId: number): Hex {
    const net = NETWORK_REGISTRY[chainId];
    if (!net) throw new Error(`Unknown chainId ${chainId}`);
    return net.contracts.c2cEscrow;
}

export interface OrderPlacedEvent { orderId?: bigint; deadline?: bigint }

// ── Order lifecycle ─────────────────────────────────────────────────────────
export const placeOrder = (chainId: number, args: {
    merchant:  Address;
    productId: bigint;
    assetType: number;
    amount:    bigint;
    buyerInfo: { nameHash: Hex; idHash: Hex };
}) =>
    runWrite<OrderPlacedEvent>({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'placeOrder',
        args:         [
            args.merchant,
            args.productId,
            args.assetType,
            args.amount,
            { nameHash: args.buyerInfo.nameHash, idHash: args.buyerInfo.idHash, isSet: true },
        ] as const,
        eventName:    'OrderPlaced',
    });

export const payOrderByPlatform = (chainId: number, args: {
    merchant:  Address;
    productId: bigint;
    orderId:   bigint;
    proofs:    ContractTLSNProof[];
}) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'payOrderByPlatform',
        args:         [args.merchant, args.productId, args.orderId, args.proofs] as const,
        useGasCap:    true,
    });

export const receiveCryptoWithPlatformPayment = (chainId: number, args: {
    productId: bigint;
    orderId:   bigint;
    proofs:    ContractTLSNProof[];
}) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'receiveCryptoWithPlatformPayment',
        args:         [args.productId, args.orderId, args.proofs] as const,
        useGasCap:    true,
    });

// ── Product listings ────────────────────────────────────────────────────────
export const listCryptoProduct = (chainId: number, args: {
    cryptoId:   bigint;
    fiatId:     bigint;
    amount:     bigint;
    isActive:   boolean;
    platformId: Hex;
}) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'listCryptoProduct',
        args:         [args.cryptoId, args.fiatId, args.amount, args.isActive, args.platformId] as const,
    });

export const listFiatProduct = (chainId: number, args: {
    fiatId:     bigint;
    cryptoId:   bigint;
    amount:     bigint;
    isActive:   boolean;
    platformId: Hex;
}) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'listFiatProduct',
        args:         [args.fiatId, args.cryptoId, args.amount, args.isActive, args.platformId] as const,
    });

export const activeProduct = (chainId: number, id: bigint, assetType: number) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'activeProduct',
        args:         [id, assetType] as const,
    });

export const inactiveProduct = (chainId: number, id: bigint, assetType: number) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'inactiveProduct',
        args:         [id, assetType] as const,
    });

export const addAmount = (chainId: number, id: bigint, assetType: number, amount: bigint) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'addAmount',
        args:         [id, assetType, amount] as const,
    });

export const takeAmount = (chainId: number, id: bigint, assetType: number, amount: bigint) =>
    runWrite({
        chainId,
        address:      escrowAddress(chainId),
        abi:          C2C_ESCROW_ABI,
        functionName: 'takeAmount',
        args:         [id, assetType, amount] as const,
    });
