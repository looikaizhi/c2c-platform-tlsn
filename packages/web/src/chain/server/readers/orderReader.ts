import 'server-only';
import type { Address, Hex } from 'viem';
import { getServerPublicClient } from '@/chain/server/clients';
import { DEFAULT_NETWORK } from '@/chain/networkRegistry';

/** Read NEXT_PUBLIC_C2C_ESCROW_ADDRESS at request-time so each request sees
 *  the latest address even if `.env.local` was updated since dev-server boot. */
function getC2cEscrowAddress(): Hex {
    const fromEnv = process.env.NEXT_PUBLIC_C2C_ESCROW_ADDRESS;
    if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) return fromEnv as Hex;
    return DEFAULT_NETWORK.contracts.c2cEscrow;
}

const escrowReadAbi = [
    {
        type: 'function',
        name: 'getOrder',
        inputs: [
            { name: '_merchant', type: 'address' },
            { name: '_productId', type: 'uint256' },
            { name: '_assetType', type: 'uint8' },
            { name: '_orderId', type: 'uint256' },
        ],
        outputs: [
            { name: 'buyer', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'rate', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'status', type: 'uint8' },
            { name: 'rateVersion', type: 'uint32' },
            { name: 'platformTxId', type: 'bytes32' },
            { name: 'merchantNameHash', type: 'bytes32' },
            { name: 'merchantIdHash', type: 'bytes32' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getBuyerPaymentInfo',
        inputs: [
            { name: '_merchant', type: 'address' },
            { name: '_productId', type: 'uint256' },
            { name: '_orderId', type: 'uint256' },
        ],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'idHash', type: 'bytes32' },
                    { name: 'isSet', type: 'bool' },
                ],
            },
        ],
        stateMutability: 'view',
    },
] as const;

export interface OrderOnchainView {
    buyer:            Address;
    amount:           bigint;
    rate:             bigint;
    deadline:         bigint;
    status:           number;
    rateVersion:      number;
    platformTxId:     Hex;
    merchantNameHash: Hex;
    merchantIdHash:   Hex;
}

export interface BuyerOnchainPaymentInfo {
    nameHash: Hex;
    idHash:   Hex;
    isSet:    boolean;
}

export async function getOrder(
    merchant: Address,
    productId: bigint,
    assetType: number,
    orderId: bigint,
): Promise<OrderOnchainView> {
    const result = (await getServerPublicClient().readContract({
        address:      getC2cEscrowAddress(),
        abi:          escrowReadAbi,
        functionName: 'getOrder',
        args:         [merchant, productId, assetType, orderId],
    })) as readonly [Address, bigint, bigint, bigint, number, number, Hex, Hex, Hex];
    return {
        buyer:            result[0],
        amount:           result[1],
        rate:             result[2],
        deadline:         result[3],
        status:           result[4],
        rateVersion:      result[5],
        platformTxId:     result[6],
        merchantNameHash: result[7],
        merchantIdHash:   result[8],
    };
}

export async function getBuyerPaymentInfo(
    merchant: Address,
    productId: bigint,
    orderId: bigint,
): Promise<BuyerOnchainPaymentInfo> {
    return (await getServerPublicClient().readContract({
        address:      getC2cEscrowAddress(),
        abi:          escrowReadAbi,
        functionName: 'getBuyerPaymentInfo',
        args:         [merchant, productId, orderId],
    })) as BuyerOnchainPaymentInfo;
}
