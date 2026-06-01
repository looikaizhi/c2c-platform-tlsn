import type { Address, Hex, TransactionReceipt } from 'viem';
import type { PaymentPlatform, PluginResult } from '@/platforms/types';
import { buildContractProof } from './transformer';
import * as escrow from '@/chain/writers/escrowWriter';
import type { NetworkConfig } from '@/chain/networkRegistry';

export type OrderDirection = 'crypto' | 'fiat';

export interface SubmitProofArgs {
    platform:  PaymentPlatform;
    direction: OrderDirection;
    /** Required when direction === 'crypto'. */
    merchant?: Address;
    productId: bigint;
    orderId:   bigint;
    proof:     PluginResult;
    network:   NetworkConfig;
}

export async function submitProof(
    args: SubmitProofArgs,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
    if (args.platform.proofShape !== args.proof.kind) {
        throw new Error(
            `Platform ${args.platform.key} expects ${args.platform.proofShape} proof, got ${args.proof.kind}`,
        );
    }

    const proofs = args.proof.kind === 'single'
        ? [buildContractProof(args.proof.proof)]
        : [buildContractProof(args.proof.contacts), buildContractProof(args.proof.transfer)];

    if (args.direction === 'crypto') {
        if (!args.merchant) throw new Error('merchant address required for crypto direction');
        return escrow.payOrderByPlatform(args.network.chainId, {
            merchant:  args.merchant,
            productId: args.productId,
            orderId:   args.orderId,
            proofs,
        });
    }
    return escrow.receiveCryptoWithPlatformPayment(args.network.chainId, {
        productId: args.productId,
        orderId:   args.orderId,
        proofs,
    });
}
