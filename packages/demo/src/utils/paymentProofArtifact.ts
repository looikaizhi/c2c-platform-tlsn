import type { Hex } from 'viem';
import type { ExtensionProveResponse } from './proofTransformer';

export const PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION = 'PaymentProofArtifactV1' as const;

const PAYMENT_PROOF_STORAGE_PREFIX = 'tlsn:c2c:payment-proof:v1';

export interface PaymentProofOrderSnapshotV1 {
  buyer: Hex;
  merchant: Hex;
  productId: string;
  orderId: string;
  assetType: 0 | 1;
  amount: string;
  rate: string;
  rateVersion: number;
  deadline: string;
}

export interface PaymentProofPlatformSnapshotV1 {
  platformId: Hex;
  platformLabel: string;
}

export type PaymentProofPayloadV1 =
  | {
      type: 'wise';
      contactsProof: ExtensionProveResponse;
      transferProof: ExtensionProveResponse;
    }
  | {
      type: 'alipay';
      proof: ExtensionProveResponse;
    };

export interface PaymentProofArtifactV1 {
  schemaVersion: typeof PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION;
  createdAt: string;
  order: PaymentProofOrderSnapshotV1;
  platform: PaymentProofPlatformSnapshotV1;
  orderBindingHash: Hex;
  sessionIds: string[];
  txHash: Hex;
  proofs: PaymentProofPayloadV1;
}

export interface PaymentProofArtifactKeyInput {
  buyer: Hex;
  merchant: Hex;
  assetType: 0 | 1;
  productId: bigint;
  orderId: bigint;
}

export function buildPaymentProofArtifactStorageKey(input: PaymentProofArtifactKeyInput): string {
  return [
    PAYMENT_PROOF_STORAGE_PREFIX,
    input.buyer.toLowerCase(),
    input.merchant.toLowerCase(),
    String(input.assetType),
    input.productId.toString(),
    input.orderId.toString(),
  ].join(':');
}
