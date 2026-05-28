// packages/demo/src/utils/userBindingActions.ts
//
// Per-wallet × per-platform payment binding helpers for the demo UI.
//
// On-chain (C2CAdmin.setPlatformBinding / getPlatformBinding) only stores the
// keccak256 hashes of the display name and account identifier. To let the demo
// UI render the plaintext after a page reload we cache the plaintext in
// localStorage, keyed by (wallet, platformId). The cache is written **only
// after** the on-chain tx is confirmed, so cache and chain can never drift
// in the "cache says X but chain says nothing" direction.
//
// Cache may legitimately be missing (other browser, cleared storage); callers
// should fall back to a hash preview in that case.

import { keccak256, stringToBytes } from 'viem';
import type { Hex, WalletClient } from 'viem';

import { publicClient } from './hardhatAccounts';
import { C2C_ADMIN_ABI } from './c2cAbi';
import { c2cConfig } from './c2cContractConfig';
import { PLATFORM_WISE } from './wiseC2cActions';
import { PLATFORM_ALIPAY } from './alipayC2cActions';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── localStorage cache ──────────────────────────────────────────────────────

function cacheKey(wallet: Hex, platformId: Hex): string {
  return `tlsn-demo-binding-${wallet.toLowerCase()}-${platformId.toLowerCase()}`;
}

export function loadBindingPlaintext(wallet: Hex, platformId: Hex): BindingPlaintext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(wallet, platformId));
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
    window.localStorage.setItem(cacheKey(wallet, platformId), JSON.stringify(value));
  } catch {
    // ignore quota / privacy-mode failures — chain is still authoritative
  }
}

// ─── Chain reads ─────────────────────────────────────────────────────────────

export async function getUserPlatformBinding(
  wallet: Hex,
  platformId: Hex,
): Promise<PlatformBinding> {
  const raw = await publicClient.readContract({
    address:      c2cConfig.adminAddress,
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

// ─── Chain write ─────────────────────────────────────────────────────────────

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

  // simulate first so we get a decoded revert reason if the chain rejects.
  const { request } = await publicClient.simulateContract({
    address:      c2cConfig.adminAddress,
    abi:          C2C_ADMIN_ABI,
    functionName: 'setPlatformBinding',
    args:         [platformId, nameHash, idHash],
    account:      walletClient.account!,
  });
  const txHash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // tx confirmed → safe to persist plaintext cache
  saveBindingPlaintext(wallet, platformId, { name: trimmedName, handle: trimmedHandle });

  return { txHash, nameHash, idHash };
}
