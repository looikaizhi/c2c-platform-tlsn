// packages/demo/src/utils/reconcileOnChain.ts
// Best-effort on-chain reconciliation for an audited proof.
//
// Why "implicit binding-hash match" on tx success:
//   - The escrow's payOrderByPlatform / receiveCryptoWithPlatformPayment paths
//     internally call TLSNVerifier which checks `orderBindingHash` against the
//     contract-computed one for the (merchant, productId, orderId, …) tuple.
//   - If the tx succeeded, the on-chain verifier accepted the binding hash.
//   - Therefore: receipt.status === 'success' ⇒ orderBindingMatch === true.
//
// This intentionally trusts the contract's on-chain check rather than
// re-deriving the hash off-chain (which would require recovering the full
// OrderBindingContext from logs).

import { parseEventLogs, type Hex } from 'viem';
import { publicClient } from './hardhatAccounts';
import { C2C_ESCROW_ABI } from './c2cAbi';
import type { ProofExportResponse } from './proofsApi';

export type ReconcileStatus = 'no_tx' | 'reverted' | 'success';

export interface ReconcileResult {
    status: ReconcileStatus;
    txStatus?: 'success' | 'reverted';
    /** True iff the on-chain verifier accepted this proof's binding hash (inferred from tx success). */
    orderBindingMatch?: boolean;
    /** orderId observed in OrderStatusChanged (informational). */
    onChainOrderId?: string;
    /** New status code observed in OrderStatusChanged (informational). */
    onChainOrderStatus?: number;
    error?: string;
}

export async function reconcileOnChain(proof: ProofExportResponse): Promise<ReconcileResult> {
    if (!proof.txHash) return { status: 'no_tx' };
    try {
        const receipt = await publicClient.getTransactionReceipt({
            hash: proof.txHash as Hex,
        });
        if (receipt.status !== 'success') {
            return { status: 'reverted', txStatus: receipt.status };
        }

        // Best-effort: surface OrderStatusChanged for the auditor's eyeballs.
        let onChainOrderId: string | undefined;
        let onChainOrderStatus: number | undefined;
        try {
            const logs = parseEventLogs({
                abi: C2C_ESCROW_ABI,
                eventName: 'OrderStatusChanged',
                logs: receipt.logs,
            });
            if (logs.length > 0) {
                const a = logs[0].args as any;
                onChainOrderId = (a.orderId as bigint | undefined)?.toString();
                onChainOrderStatus = a.status as number | undefined;
            }
        } catch {
            // not fatal — keep going
        }

        return {
            status: 'success',
            txStatus: 'success',
            orderBindingMatch: true,
            onChainOrderId,
            onChainOrderStatus,
        };
    } catch (err) {
        return {
            status: 'no_tx',
            error: (err as any)?.message ?? String(err),
        };
    }
}
