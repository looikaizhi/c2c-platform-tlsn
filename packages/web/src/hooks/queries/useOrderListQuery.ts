"use client";
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { DEFAULT_NETWORK } from '@/chain/networkRegistry';
import { getPublicClient } from '@/chain/clients';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI } from '@/lib/contractAbi';
import { tokenDecimals } from '@/lib/assetRegistry';
import type { CryptoPair, MoneyPair } from '@/lib/assetRegistry';

export interface P2PProduct {
    merchant:        Address;
    productId:       bigint;
    assetType:       number;
    cryptoSymbol:    string;
    fiatName:        string;
    tokenAddress:    Address;
    tokenDecimals:   number;
    availableAmount: bigint;
    rate:            bigint;
    isOpen:          boolean;
    platformId:      string;
}

interface UseOrderListQueryParams {
    walletAddress: string;
    isBuy: boolean;
    moneyPair: MoneyPair;
    cryptoPair: CryptoPair;
}

const MERCHANT_ADDRESS = (
    process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || ''
) as Address;

export function useOrderListQuery({
    isBuy,
    moneyPair,
    cryptoPair,
}: UseOrderListQueryParams) {
    return useQuery<P2PProduct[]>({
        queryKey: ['p2p-products-onchain', isBuy, moneyPair, cryptoPair],
        queryFn: async () => {
            if (!MERCHANT_ADDRESS) return [];

            // P4-7: P2P orderbook is read with the configured DEFAULT_NETWORK,
            // not the wallet's current chain — so visitors can browse without
            // connecting and the list shows the merchant's products on the
            // chain where they listed.
            const network = DEFAULT_NETWORK;
            const { c2cAdmin, c2cEscrow } = network.contracts;
            if (!c2cAdmin || !c2cEscrow) return [];

            const publicClient = getPublicClient(network.chainId);

            const assetType = isBuy ? 0 : 1; // 0=CRYPTO, 1=FIAT

            const merchantData = await publicClient.readContract({
                address: c2cAdmin,
                abi: C2C_ADMIN_ABI,
                functionName: 'merchants',
                args: [MERCHANT_ADDRESS],
            });

            // merchantData is [isActive, kybVerified, registeredAt, sellCryptoAmount, sellFiatAmount]
            const sellCryptoAmount = merchantData[3] as bigint;
            const sellFiatAmount   = merchantData[4] as bigint;
            const productCount = assetType === 0 ? sellCryptoAmount : sellFiatAmount;

            if (productCount === 0n) return [];

            const [cryptoList, fiatList] = await Promise.all([
                publicClient.readContract({
                    address: c2cAdmin,
                    abi: C2C_ADMIN_ABI,
                    functionName: 'getSupportCryptoList',
                }),
                publicClient.readContract({
                    address: c2cAdmin,
                    abi: C2C_ADMIN_ABI,
                    functionName: 'getSupportFiatList',
                }),
            ]);

            const productReads = Array.from({ length: Number(productCount) }, (_, i) =>
                publicClient.readContract({
                    address: c2cEscrow,
                    abi: C2C_ESCROW_ABI,
                    functionName: 'getProductInfo',
                    args: [MERCHANT_ADDRESS, BigInt(i), assetType],
                }),
            );
            const products = await Promise.all(productReads);

            const result: P2PProduct[] = [];

            for (const product of products) {
                if (!product.isActive) continue;

                const crypto = cryptoList[Number(product.cryptoID)];
                const fiat   = fiatList[Number(product.fiatID)];
                if (!crypto || !fiat) continue;
                if (crypto.tokenSymbol !== cryptoPair) continue;
                if (moneyPair !== 'All' && fiat.fiatName !== moneyPair) continue;

                const [rateData, isOpen] = await Promise.all([
                    publicClient.readContract({
                        address: c2cAdmin,
                        abi: C2C_ADMIN_ABI,
                        functionName: 'getMerchantRate',
                        args: [MERCHANT_ADDRESS, product.productId, assetType],
                    }),
                    publicClient.readContract({
                        address: c2cAdmin,
                        abi: C2C_ADMIN_ABI,
                        functionName: 'isMerchantOpen',
                        args: [MERCHANT_ADDRESS, product.productId, assetType],
                    }),
                ]);

                if (!isOpen || rateData.version === 0) continue;
                if (product.availableAmount === 0n) continue;

                result.push({
                    merchant:        MERCHANT_ADDRESS,
                    productId:       product.productId,
                    assetType,
                    cryptoSymbol:    crypto.tokenSymbol,
                    fiatName:        fiat.fiatName,
                    tokenAddress:    crypto.tokenAddress as Address,
                    tokenDecimals:   tokenDecimals(crypto.tokenSymbol) ?? 18,
                    availableAmount: product.availableAmount,
                    rate:            rateData.rate,
                    isOpen,
                    platformId:      product.platformId,
                });
            }

            return result;
        },
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}
