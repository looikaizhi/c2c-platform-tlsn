"use client";
import type { Hex } from 'viem';
import { signMessage } from '@wagmi/core';
import { wagmiConfig } from '@/chain/wagmiConfig';
import { buildSignableMessage } from '@/lib/walletAuth';

export interface SignedRequestHeaders extends Record<string, string> {
    'X-Wallet-Sig': string;
    'X-Wallet-Timestamp': string;
    'Content-Type': string;
}

export interface SignApiRequestInput {
    domain: 'user' | 'admin';
    method: 'GET' | 'POST';
    path: string;
    body?: unknown;
    address: Hex;
}

export async function signApiRequest(
    input: SignApiRequestInput,
): Promise<SignedRequestHeaders> {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildSignableMessage({
        domain: input.domain,
        method: input.method,
        path: input.path,
        body: input.body,
        timestamp,
    });
    const sig = await signMessage(wagmiConfig, {
        message,
        account: input.address,
    });
    return {
        'X-Wallet-Sig': sig,
        'X-Wallet-Timestamp': String(timestamp),
        'Content-Type': 'application/json',
    };
}
