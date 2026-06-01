"use client";
import {
    parseEventLogs,
    type Abi,
    type Hex,
    type TransactionReceipt,
} from 'viem';
import { getPublicClient, getWalletClient } from './clients';
import { estimateProofGas } from './gasCap';

export interface RunWriteArgs {
    chainId:      number;
    address:      Hex;
    abi:          Abi;
    functionName: string;
    args:         readonly unknown[];
    /** Apply MetaMask 2^24 gas-cap logic. Use only for TLSN proof submissions. */
    useGasCap?:   boolean;
    /** If set, parse this event from receipt logs and return as `event`. */
    eventName?:   string;
}

export interface RunWriteResult<TEvent = unknown> {
    hash:    Hex;
    receipt: TransactionReceipt;
    event?:  TEvent;
}

/**
 * Single command-style API for "send tx → wait receipt → throw on revert →
 * optionally parse one event". Replaces the per-action switch/case in
 * `lib/contractSubmitter.ts`.
 */
export async function runWrite<TEvent = unknown>(
    a: RunWriteArgs,
): Promise<RunWriteResult<TEvent>> {
    const pub = getPublicClient(a.chainId);
    const wal = await getWalletClient(a.chainId);

    const account = wal.account;
    if (!account) throw new Error('Wallet not connected');

    const gas = a.useGasCap
        ? await estimateProofGas(pub, {
            address:      a.address,
            abi:          a.abi,
            functionName: a.functionName,
            args:         a.args,
            account:      account.address,
        })
        : undefined;

    const hash = await wal.writeContract({
        address:      a.address,
        abi:          a.abi,
        functionName: a.functionName,
        args:         a.args as never,
        account,
        gas,
        chain:        pub.chain,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
        throw new Error(`Transaction reverted: ${hash}`);
    }

    let event: TEvent | undefined;
    if (a.eventName) {
        const parsed = parseEventLogs({
            abi:       a.abi,
            logs:      receipt.logs,
            eventName: a.eventName,
        });
        event = (parsed[0]?.args as TEvent | undefined);
    }
    return { hash, receipt, event };
}
