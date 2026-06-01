"use client";

import { useCallback, useEffect, useState } from 'react';
import {
    getAbiItem,
    type Address,
    type Hex,
} from 'viem';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ProofStepper } from '@/components/proof/ProofStepper';
import { PayeeCard } from '@/components/binding/PayeeCard';
import { C2C_ESCROW_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { getPublicClient } from '@/chain/clients';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';

interface OrdersTabProps {
    merchantAddress: Address;
    /** Fired whenever the pending-orders list refreshes — parent uses it to drive the tab badge. */
    onCountChange?: (count: number) => void;
}

interface PendingFiatOrder {
    buyer: Address;
    merchant: Address;
    orderId: bigint;
    productId: bigint;
    amount: bigint;
    deadline: bigint;
    status: number;
    platformId: Hex;
}

const ORDER_PLACED_EVENT = getAbiItem({ abi: C2C_ESCROW_ABI, name: 'OrderPlaced' });

export default function OrdersTab({ merchantAddress, onCountChange }: OrdersTabProps) {
    const { network } = useNetwork();
    const [orders, setOrders] = useState<PendingFiatOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        onCountChange?.(orders.length);
    }, [orders.length, onCountChange]);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const client = getPublicClient(network.chainId);

            const logs = await client.getLogs({
                address: network.contracts.c2cEscrow,
                event: ORDER_PLACED_EVENT,
                args: { merchant: merchantAddress } as any,
                fromBlock: 0n,
            });

            const fiatLogs = logs.filter((l) => Number((l.args as any).assetType) === 1);

            const items: PendingFiatOrder[] = await Promise.all(
                fiatLogs.map(async (l) => {
                    const args = l.args as any;
                    const orderTuple = (await client.readContract({
                        address: network.contracts.c2cEscrow,
                        abi: C2C_ESCROW_ABI,
                        functionName: 'getOrder',
                        args: [merchantAddress, args.productId, 1, args.orderId],
                    })) as unknown as readonly [Address, bigint, bigint, bigint, number, number, Hex, Hex, Hex];
                    const platformId = (await client.readContract({
                        address: network.contracts.c2cEscrow,
                        abi: C2C_ESCROW_ABI,
                        functionName: 'getProductPlatformId',
                        args: [merchantAddress, args.productId, 1],
                    })) as Hex;
                    return {
                        buyer: args.buyer,
                        merchant: merchantAddress,
                        orderId: args.orderId,
                        productId: args.productId,
                        amount: orderTuple[1],
                        deadline: orderTuple[3],
                        status: orderTuple[4],
                        platformId,
                    };
                }),
            );

            setOrders(items.filter((o) => o.status === 0 || o.status === 3));
        } catch {
            setOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, [merchantAddress, network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleProofSubmitted = () => {
        void refresh();
    };

    return (
        <Card padding="none" className="p-6">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Orders Queue</h3>
                <Badge variant="warning" dot>Fiat Pending</Badge>
            </div>
            <p className="mb-4 text-sm text-[var(--text-subtle)]">
                After a buyer locks tokens in escrow for a FIAT product, pay them off-chain (Wise/Alipay) and
                submit a dual TLSN proof here to release the tokens.
            </p>

            {isLoading ? (
                <div className="flex items-center justify-center py-10">
                    <Spinner size="md" />
                </div>
            ) : orders.length === 0 ? (
                <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4">
                    <p className="text-xs text-[var(--text-muted)]">No pending fiat orders</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => {
                        const isWise = order.platformId === PLATFORM_WISE;
                        const knownPlatform = isWise || order.platformId === PLATFORM_ALIPAY;
                        return (
                            <div
                                key={`${order.productId}-${order.orderId}`}
                                className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-surface-2)] p-4"
                            >
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">
                                            Order #{order.orderId.toString()}
                                        </span>
                                        <Badge variant="info">
                                            {isWise ? 'Wise' : order.platformId === PLATFORM_ALIPAY ? 'Alipay' : 'Unknown'} · FIAT
                                        </Badge>
                                    </div>
                                    <span className="text-xs text-[var(--text-muted)]">
                                        deadline {new Date(Number(order.deadline) * 1000).toLocaleString()}
                                    </span>
                                </div>
                                {knownPlatform ? (
                                    <div className="space-y-3">
                                        {/* Counterparty (buyer) Wise/Alipay identity — where the merchant should send fiat */}
                                        <PayeeCard
                                            role="payer"
                                            merchant={merchantAddress}
                                            productId={order.productId}
                                            assetType={1}
                                            orderId={order.orderId}
                                        />
                                        <ProofStepper
                                            merchant={merchantAddress}
                                            productId={order.productId}
                                            orderId={order.orderId}
                                            assetType={1}
                                            platform={isWise ? 'wise' : 'alipay'}
                                            direction="fiat"
                                            onProofSubmitted={handleProofSubmitted}
                                        />
                                    </div>
                                ) : (
                                    <p className="text-xs text-red-400">
                                        Unknown platform {order.platformId} — cannot generate proof.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
