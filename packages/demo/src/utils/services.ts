// packages/demo/src/utils/services.ts
//
// Business-use-case layer. Pure async functions, no React.
//
// Phase 3 scope (option A): only the Binding + Reconcile sections are loaded
// here (collapsed from userBindingActions + reconcileOnChain). Other use-case
// functions (placeOrder, submitPaymentProofs, makeBindingContext, claimBond,
// loadXxx loaders) are introduced incrementally by each Phase 6.X panel
// refactor — adding them here on demand keeps every commit small and lets
// type-check verify behavior parity panel-by-panel.

import { keccak256, parseEventLogs, stringToBytes } from 'viem';
import type { Hex, WalletClient } from 'viem';

import { addresses, publicClient } from './chain';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI } from './abis';
import { PLATFORM_ALIPAY, PLATFORM_WISE } from './platforms';
import type { ProofExportResponse } from './proof';

// ─── Binding (= userBindingActions.ts) ──────────────────────────────────────
//
// Per-wallet × per-platform payment binding helpers for the demo UI.
//
// On-chain (C2CAdmin.setPlatformBinding / getPlatformBinding) only stores the
// keccak256 hashes of the display name and account identifier. To let the demo
// UI render the plaintext after a page reload we cache the plaintext in
// localStorage, keyed by (wallet, platformId). The cache is written **only
// after** the on-chain tx is confirmed, so cache and chain can never drift
// in the "cache says X but chain says nothing" direction.

export interface PlatformBinding {
  nameHash: Hex;
  idHash:   Hex;
  isSet:    boolean;
}

export interface BindingPlaintext {
  name:   string;
  handle: string;
}

export interface BindingView extends PlatformBinding {
  platformId:    Hex;
  platformLabel: string;
  plaintext:     BindingPlaintext | null;
}

export const SUPPORTED_BINDING_PLATFORMS: Array<{ id: Hex; label: string }> = [
  { id: PLATFORM_WISE,   label: 'Wise' },
  { id: PLATFORM_ALIPAY, label: 'Alipay' },
];

function bindingCacheKey(wallet: Hex, platformId: Hex): string {
  return `tlsn-demo-binding-${wallet.toLowerCase()}-${platformId.toLowerCase()}`;
}

export function loadBindingPlaintext(wallet: Hex, platformId: Hex): BindingPlaintext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(bindingCacheKey(wallet, platformId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BindingPlaintext;
    if (typeof parsed?.name !== 'string' || typeof parsed?.handle !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveBindingPlaintext(wallet: Hex, platformId: Hex, value: BindingPlaintext): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(bindingCacheKey(wallet, platformId), JSON.stringify(value));
  } catch {
    // ignore quota / privacy-mode failures — chain is still authoritative
  }
}

export async function getUserPlatformBinding(
  wallet: Hex,
  platformId: Hex,
): Promise<PlatformBinding> {
  const raw = await publicClient.readContract({
    address:      addresses.adminAddress,
    abi:          C2C_ADMIN_ABI,
    functionName: 'getPlatformBinding',
    args:         [wallet, platformId],
  });
  // viem returns either { nameHash, idHash, isSet } or [nameHash, idHash, isSet]
  // depending on ABI shape; handle both.
  const r = raw as any;
  if (Array.isArray(r)) {
    return { nameHash: r[0] as Hex, idHash: r[1] as Hex, isSet: Boolean(r[2]) };
  }
  return {
    nameHash: r.nameHash as Hex,
    idHash:   r.idHash   as Hex,
    isSet:    Boolean(r.isSet),
  };
}

export async function getAllUserBindings(wallet: Hex): Promise<BindingView[]> {
  const results = await Promise.all(
    SUPPORTED_BINDING_PLATFORMS.map(async ({ id, label }) => {
      const binding = await getUserPlatformBinding(wallet, id).catch(
        () => ({ nameHash: '0x0' as Hex, idHash: '0x0' as Hex, isSet: false }),
      );
      return {
        ...binding,
        platformId:    id,
        platformLabel: label,
        plaintext:     binding.isSet ? loadBindingPlaintext(wallet, id) : null,
      };
    }),
  );
  return results;
}

/**
 * Hash the supplied name/handle, submit setPlatformBinding, wait for receipt,
 * THEN persist the plaintext to localStorage. The write order guarantees the
 * cache only ever reflects values that the chain accepted.
 */
export async function setUserPlatformBinding(
  walletClient: WalletClient,
  platformId: Hex,
  name: string,
  handle: string,
): Promise<{ txHash: Hex; nameHash: Hex; idHash: Hex }> {
  const trimmedName   = name.trim();
  const trimmedHandle = handle.trim();
  if (!trimmedName || !trimmedHandle) {
    throw new Error('Name and account identifier must both be non-empty.');
  }

  const wallet = walletClient.account?.address as Hex | undefined;
  if (!wallet) throw new Error('Wallet client has no account attached.');

  const nameHash = keccak256(stringToBytes(trimmedName)) as Hex;
  const idHash   = keccak256(stringToBytes(trimmedHandle)) as Hex;

  const { request } = await publicClient.simulateContract({
    address:      addresses.adminAddress,
    abi:          C2C_ADMIN_ABI,
    functionName: 'setPlatformBinding',
    args:         [platformId, nameHash, idHash],
    account:      walletClient.account!,
  });
  const txHash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  saveBindingPlaintext(wallet, platformId, { name: trimmedName, handle: trimmedHandle });

  return { txHash, nameHash, idHash };
}

// ─── Reconcile (= reconcileOnChain.ts) ──────────────────────────────────────
//
// Best-effort on-chain reconciliation for an audited proof.
//
// Why "implicit binding-hash match" on tx success:
//   - The escrow's payOrderByPlatform / receiveCryptoWithPlatformPayment paths
//     internally call TLSNVerifier which checks `orderBindingHash` against the
//     contract-computed one for the (merchant, productId, orderId, …) tuple.
//   - If the tx succeeded, the on-chain verifier accepted the binding hash.
//   - Therefore: receipt.status === 'success' ⇒ orderBindingMatch === true.

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
