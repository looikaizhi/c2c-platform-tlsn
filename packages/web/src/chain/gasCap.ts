/**
 * MetaMask 2^24 gas cap mitigation for TLSN proof submissions.
 *
 * MetaMask enforces a per-tx gas cap (2^24 = 16 777 216) on local / test
 * networks. When `payOrderByPlatform` / `receiveCryptoWithPlatformPayment` —
 * the only two functions that take TLSN proofs as args — get close to that
 * ceiling we cap the gas at `cap - headroom` and log a console diagnostic.
 *
 * For everything else, callers should pass `useGasCap: false` to `runWrite`
 * and let viem estimate normally.
 */
import type { Abi, Hex, PublicClient } from 'viem';

const PROOF_TX_GAS_CAP          = 16_777_216n;     // 2^24
const PROOF_TX_GAS_CAP_HEADROOM = 100_000n;
const PROOF_TX_GAS_BUFFER_BPS   = 12_000n;         // 1.20x

export interface EstimateProofGasArgs {
    address:      Hex;
    abi:          Abi;
    functionName: string;
    args:         readonly unknown[];
    /** Caller account — accepts either Account-shaped object or raw address. */
    account:      Hex | { address: Hex };
}

export async function estimateProofGas(
    publicClient: PublicClient,
    params: EstimateProofGasArgs,
): Promise<bigint> {
    const accountAddress: Hex =
        typeof params.account === 'string' ? params.account : params.account.address;

    const estimated = await publicClient.estimateContractGas({
        address:      params.address,
        abi:          params.abi,
        functionName: params.functionName,
        args:         params.args as never,
        account:      accountAddress,
    });

    const withBuffer = (estimated * PROOF_TX_GAS_BUFFER_BPS) / 10_000n;
    const safeCap   = PROOF_TX_GAS_CAP - PROOF_TX_GAS_CAP_HEADROOM;
    let gas: bigint;
    let mode: 'buffered' | 'capped' | 'over-cap';

    if (estimated >= safeCap) {
        mode = 'over-cap';
        gas  = withBuffer; // surfaced in the error below
    } else if (withBuffer <= safeCap) {
        mode = 'buffered';
        gas  = withBuffer;
    } else {
        mode = 'capped';
        gas  = safeCap;
    }

    // eslint-disable-next-line no-console
    console.info(
        `[contractSubmitter] ${params.functionName}: estimate=${estimated} buffered=${withBuffer} cap=${PROOF_TX_GAS_CAP} → using gas=${gas} (${mode})`,
    );

    if (mode === 'over-cap') {
        throw new Error(
            `Estimated gas ${estimated.toString()} for ${params.functionName} exceeds the MetaMask local-network cap of ${PROOF_TX_GAS_CAP.toString()} (2^24). ` +
            'This usually happens with Wise dual-proof submissions. Use a wallet without this cap (Rabby / Frame) or run the dev node with a private key client.',
        );
    }
    return gas;
}
