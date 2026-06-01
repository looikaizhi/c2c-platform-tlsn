"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { C2C_ADMIN_ABI } from '@/lib/contractAbi';
import { useNetwork } from '@/contexts/NetworkContext';
import { useProducts } from '@/hooks/useProducts';
import { getPublicClient } from '@/chain/clients';
import { Button } from '@/components/ui/Button';

interface Props {
    merchantAddr: Address;
    productId: bigint;
    assetType: number;
    products: ReturnType<typeof useProducts>;
}

export default function OpenToggleControl({ merchantAddr, productId, assetType, products }: Props) {
    const { network } = useNetwork();
    const [isOpen, setIsOpen] = useState<boolean | null>(null);

    const refresh = useCallback(async () => {
        try {
            const client = getPublicClient(network.chainId);
            const result = (await client.readContract({
                address: network.contracts.c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'isMerchantOpen',
                args: [merchantAddr, productId, assetType],
            })) as boolean;
            setIsOpen(result);
        } catch {
            setIsOpen(null);
        }
    }, [merchantAddr, productId, assetType, network]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleOpen  = async () => { await products.openNow(productId, assetType); refresh(); };
    const handleClose = async () => { await products.closeNow(productId, assetType); refresh(); };
    const handleReset = async () => { await products.clearManualOverride(productId, assetType); refresh(); };

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Status:</span>
            <span className={isOpen ? 'text-emerald-400' : 'text-red-400'}>
                {isOpen === null ? '—' : isOpen ? 'OPEN' : 'CLOSED'}
            </span>
            <Button variant="buy"   size="sm" onClick={handleOpen}  disabled={products.status === 'submitting'}>Force Open</Button>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={products.status === 'submitting'}>Force Close</Button>
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={products.status === 'submitting'}>Reset to Schedule</Button>
        </div>
    );
}
