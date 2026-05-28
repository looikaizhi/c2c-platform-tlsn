// packages/demo/src/utils/chain.ts
//
// Single source of truth for chain selection, contract addresses, wallet clients,
// demo user enumeration, contract error decoding, and on-chain order shape.
//
// Collapsed verbatim during Phase 1a from:
//   - c2cContractConfig.ts  → ─── Addresses ───
//   - hardhatAccounts.ts    → ─── Clients ───
//   - demoUsers.ts          → ─── Demo Users ───
//   - contractErrors.ts     → ─── Errors ───
//   - orderView.ts          → ─── OrderView ───
//
// Phase 1a is a behavior-preserving refactor:
//   - addr() keeps original semantics (no .toLowerCase, no '0x' fallback).
//   - addresses retains all c2cConfig fields (including legacy merchantAddress /
//     buyerAddress / usdtAddressLegacy) so consumer code can switch via shim
//     without source-level changes.
//   - The legacy aliases merchantClient / buyerClient are NOT re-exported here;
//     they live only on the hardhatAccounts.ts shim until Phase 7e.

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  type WalletClient,
  type PublicClient,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat, sepolia } from 'viem/chains';

// ─── Chain ──────────────────────────────────────────────────────────────────

export const hardhatChain = hardhat;

const env = (import.meta as any).env as Record<string, string>;
const chainId = Number(env.VITE_CHAIN_ID || '31337');
export const chain = chainId === 11155111 ? sepolia : hardhat;

// ─── Addresses (= c2cContractConfig.ts) ─────────────────────────────────────

function addr(key: string): Hex {
  return (env[key] || '') as Hex;
}

export const addresses = {
  // Core contracts
  adminAddress:          addr('VITE_C2C_ADMIN_ADDRESS'),
  escrowAddress:         addr('VITE_C2C_ESCROW_ADDRESS'),
  verifierSignerAddress: addr('VITE_VERIFIER_SIGNER_ADDRESS'),

  // V4 contracts
  riskManagerAddress: addr('VITE_RISK_MANAGER_ADDRESS'),
  bondVaultAddress:   addr('VITE_BOND_VAULT_ADDRESS'),

  // Token addresses
  usdtAddress: addr('VITE_USDT_ADDRESS'),
  usdcAddress: addr('VITE_USDC_ADDRESS'),
  daiAddress:  addr('VITE_DAI_ADDRESS'),

  // Merchant addresses
  merchant1Address: addr('VITE_MERCHANT1_ADDRESS'),
  merchant2Address: addr('VITE_MERCHANT2_ADDRESS'),
  merchant3Address: addr('VITE_MERCHANT3_ADDRESS'),

  // User addresses
  user1Address: addr('VITE_USER1_ADDRESS'),
  user2Address: addr('VITE_USER2_ADDRESS'),
  user3Address: addr('VITE_USER3_ADDRESS'),
  user4Address: addr('VITE_USER4_ADDRESS'),
  user5Address: addr('VITE_USER5_ADDRESS'),

  // Legacy single-merchant / single-buyer aliases (backward compat with c2cConfig)
  merchantAddress:   addr('VITE_MERCHANT1_ADDRESS') || addr('VITE_MERCHANT_ADDRESS'),
  buyerAddress:      addr('VITE_USER1_ADDRESS')     || addr('VITE_BUYER_ADDRESS'),
  usdtAddressLegacy: addr('VITE_USDT_ADDRESS'),
};

export function isConfigured(): boolean {
  return addresses.adminAddress.length > 2 && addresses.escrowAddress.length > 2;
}

// ─── Clients (= hardhatAccounts.ts) ─────────────────────────────────────────

const RPC_URL = 'http://127.0.0.1:8545';

// Hardhat's deterministic account keys, in slot order.
// wallet[0]  = Admin         (deployer, contract admin)
// wallet[1]  = Merchant_1    (Wise + Alipay, USDT products)
// wallet[2]  = Merchant_2
// wallet[3]  = Merchant_3
// wallet[4]  = User_1
// wallet[5]  = User_2
// wallet[6]  = User_3
// wallet[7]  = User_4
// wallet[8]  = User_5
// wallet[9]  = verifierSigner (TLSN proof signer)
const HARDHAT_PRIVATE_KEYS: Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // [0] Admin
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // [1] Merchant_1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // [2] Merchant_2
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // [3] Merchant_3
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // [4] User_1
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // [5] User_2
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e', // [6] User_3
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // [7] User_4
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97', // [8] User_5
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // [9] verifierSigner
];

function makeClient(index: number): WalletClient {
  return createWalletClient({
    account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[index]),
    chain: hardhatChain,
    transport: http(RPC_URL),
  });
}

export function makePublicClient(): PublicClient {
  return createPublicClient({
    chain: hardhatChain,
    transport: http(RPC_URL),
  });
}

export const adminClient          = makeClient(0);
export const merchant1Client      = makeClient(1);
export const merchant2Client      = makeClient(2);
export const merchant3Client      = makeClient(3);
export const user1Client          = makeClient(4);
export const user2Client          = makeClient(5);
export const user3Client          = makeClient(6);
export const user4Client          = makeClient(7);
export const user5Client          = makeClient(8);
export const verifierSignerClient = makeClient(9);

export const publicClient = makePublicClient();

export const merchantClients = [merchant1Client, merchant2Client, merchant3Client];
export const userClients     = [user1Client, user2Client, user3Client, user4Client, user5Client];

export const MERCHANT_ADDRESSES      = merchantClients.map((c) => c.account!.address);
export const USER_ADDRESSES          = userClients.map((c) => c.account!.address);
export const ADMIN_ADDRESS           = adminClient.account!.address;
export const VERIFIER_SIGNER_ADDRESS = verifierSignerClient.account!.address;

const userClientByAddress = new Map<string, WalletClient>(
  userClients.map((client) => [client.account!.address.toLowerCase(), client]),
);
export function getUserClientByAddress(address: string): WalletClient | undefined {
  return userClientByAddress.get(address.toLowerCase());
}

const merchantClientByAddress = new Map<string, WalletClient>(
  merchantClients.map((client) => [client.account!.address.toLowerCase(), client]),
);
export function getMerchantClientByAddress(address: string): WalletClient | undefined {
  return merchantClientByAddress.get(address.toLowerCase());
}

// ─── Demo users (= demoUsers.ts) ────────────────────────────────────────────

export function getDemoUserAddresses(): Hex[] {
  return [
    addresses.user1Address,
    addresses.user2Address,
    addresses.user3Address,
    addresses.user4Address,
    addresses.user5Address,
  ].filter((a): a is Hex => a.length > 2);
}

// ─── Errors (= contractErrors.ts) ───────────────────────────────────────────

const MAX_SCAN_DEPTH = 5;
const HEX_DATA_RE = /^0x[0-9a-fA-F]+$/;
const RETURN_DATA_RE = /return data:\s*(0x[0-9a-fA-F]+)/i;

interface KnownErrorDef {
  name: string;
  hint: string;
}

const KNOWN_ERRORS: KnownErrorDef[] = [
  {
    name: 'UntrustedVerifier',
    hint: 'Verifier signer recovered from proof is not in trustedVerifiers. Check VERIFIER_PRIVATE_KEY, trusted verifier registration, policyVersionHash, and orderBindingHash.',
  },
  {
    name: 'OrderBindingHashMismatch',
    hint: 'Proof binding context does not match on-chain order snapshot. Rebuild context from latest on-chain order and regenerate proof.',
  },
  {
    name: 'SessionAlreadyUsed',
    hint: 'TLSN sessionId has already been consumed on-chain. Generate a fresh proof session.',
  },
  {
    name: 'WrongChainId',
    hint: 'Proof chainId differs from current chain. Confirm local chain id and verifier CHAIN_ID configuration.',
  },
];

function selectorForError(name: string): Hex {
  return `${keccak256(toBytes(`${name}()`)).slice(0, 10).toLowerCase()}` as Hex;
}

const KNOWN_ERROR_BY_SELECTOR = new Map<string, KnownErrorDef>(
  KNOWN_ERRORS.map((item) => [selectorForError(item.name), item]),
);

function toLowerHex(value: string): Hex {
  return value.toLowerCase() as Hex;
}

function maybeHex(value: unknown): Hex | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (HEX_DATA_RE.test(trimmed)) return toLowerHex(trimmed);
  const m = trimmed.match(RETURN_DATA_RE);
  if (m?.[1] && HEX_DATA_RE.test(m[1])) return toLowerHex(m[1]);
  return undefined;
}

function findRevertData(value: unknown, depth = 0): Hex | undefined {
  if (depth > MAX_SCAN_DEPTH || value == null) return undefined;

  const direct = maybeHex(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRevertData(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value !== 'object') return undefined;

  const obj = value as Record<string, unknown>;
  const likelyKeys = [
    'data',
    'returnData',
    'revertData',
    'message',
    'shortMessage',
    'details',
    'metaMessages',
    'cause',
    'error',
  ];
  for (const key of likelyKeys) {
    if (!(key in obj)) continue;
    const found = findRevertData(obj[key], depth + 1);
    if (found) return found;
  }

  return undefined;
}

export interface DecodedContractError {
  selector: Hex;
  errorName?: string;
  hint?: string;
  revertData?: Hex;
}

export function decodeContractError(err: unknown): DecodedContractError | null {
  const revertData = findRevertData(err);
  if (!revertData || revertData.length < 10) return null;

  const selector = toLowerHex(revertData.slice(0, 10));
  const known = KNOWN_ERROR_BY_SELECTOR.get(selector);
  if (!known) {
    return { selector, revertData };
  }
  return {
    selector,
    revertData,
    errorName: known.name,
    hint: known.hint,
  };
}

export function formatContractAwareError(err: unknown): string {
  const e = err as any;
  const base =
    e?.details ||
    e?.cause?.message ||
    e?.message ||
    e?.shortMessage ||
    String(err);
  const decoded = decodeContractError(err);
  if (!decoded) return base;
  if (!decoded.errorName) {
    return `${base} (custom error selector: ${decoded.selector})`;
  }
  return `${decoded.errorName} (${decoded.selector}). ${decoded.hint} Raw: ${base}`;
}

// ─── OrderView (= orderView.ts) ─────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex;
const ZERO_HASH_32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

function asBigInt(value: unknown, fallback: bigint = 0n): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asHex(value: unknown, fallback: Hex): Hex {
  if (typeof value === 'string' && value.startsWith('0x')) return value as Hex;
  return fallback;
}

export interface OrderView {
  buyer: Hex;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
  platformTxId: Hex;
}

type RawOrder = Partial<{
  buyer: Hex;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
  platformTxId: Hex;
}> & unknown[];

/**
 * Normalize getOrder() response from viem.
 * Some viem versions return tuple arrays without named fields.
 */
export function normalizeOrder(rawOrder: unknown): OrderView {
  const raw = (rawOrder ?? []) as RawOrder;

  return {
    buyer:           asHex(raw.buyer           ?? raw[0], ZERO_ADDRESS),
    amount:          asBigInt(raw.amount        ?? raw[1]),
    rate:            asBigInt(raw.rate          ?? raw[2]),
    deadline:        asBigInt(raw.deadline      ?? raw[3]),
    status:          asNumber(raw.status        ?? raw[4]),
    rateVersion:     asNumber(raw.rateVersion   ?? raw[5]),
    platformTxId:    asHex(raw.platformTxId    ?? raw[6], ZERO_HASH_32),
  };
}
