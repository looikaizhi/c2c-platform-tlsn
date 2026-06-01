"use client";
import { useMutation } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { patchProofTx, type PatchTxResult } from '@/lib/proofsApi';

export interface ProofPatchVars {
    sessionId:       string;
    txHash:          Hex;
    chainId:         number;
    activeUserAddr?: Hex;
}

export function useProofPatchMutation() {
    return useMutation<PatchTxResult, Error, ProofPatchVars>({
        mutationFn: (v) => patchProofTx(v.sessionId, v.txHash, v.chainId, v.activeUserAddr),
    });
}
