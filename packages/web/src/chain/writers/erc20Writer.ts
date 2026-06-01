"use client";
import type { Hex } from 'viem';
import { runWrite } from '@/chain/txRunner.client';
import { ERC20_ABI } from '@/lib/contractAbi';

export const approve = (
    chainId: number,
    token:   Hex,
    spender: Hex,
    amount:  bigint,
) =>
    runWrite({
        chainId,
        address:      token,
        abi:          ERC20_ABI,
        functionName: 'approve',
        args:         [spender, amount] as const,
    });
