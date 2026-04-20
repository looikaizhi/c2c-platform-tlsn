// packages/demo/src/utils/wiseC2cActions.ts
// Action functions for the Wise C2C demo flows.
//
// Flow A (Wise-Crypto): Buyer pays MYR via Wise → receives USDT.
// Flow B (Wise-Fiat):   Buyer locks USDT → merchant pays MYR via Wise → merchant receives USDT.

import { parseEventLogs, keccak256, stringToBytes } from 'viem';
import type { Hex } from 'viem';

import { publicClient } from './hardhatAccounts';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI, ERC20_ABI } from './c2cAbi';
import { c2cConfig } from './c2cContractConfig';
import {
  buildContractProof,
  computeOrderBindingHash,
  injectOrderBindingHash,
  injectMerchantNameHash,
  injectMerchantIdHash,
  injectPayeeNameHash,
  injectPayeeIdHash,
  injectTransferOrderBindingHash,
  ZERO_HASH_32,
  type ExtensionProveResponse,
  type OrderBindingContext,
} from './proofTransformer';

// ─── Platform ID (keccak256("wise") — matches TLSNVerifier.PLATFORM_WISE) ────

export const PLATFORM_WISE = keccak256(stringToBytes('wise')) as `0x${string}`;

// ─── Constants ────────────────────────────────────────────────────────────────

// productId 0 is both CRYPTO and FIAT for Wise (separate counters per assetType)
export const WISE_CRYPTO_PRODUCT_ID = 0n;
export const WISE_FIAT_PRODUCT_ID   = 0n;

export const NULL_BUYER_INFO = {
  nameHash: ZERO_HASH_32 as `0x${string}`,
  idHash:   ZERO_HASH_32 as `0x${string}`,
  isSet:    false,
} as const;

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Read Wise merchant payment info for a given merchant address.
 */
export async function getWiseMerchantInfo(merchantAddress: `0x${string}`): Promise<{
  nameHash: `0x${string}`;
  idHash: `0x${string}`;
  isSet: boolean;
}> {
  return publicClient.readContract({
    address: c2cConfig.adminAddress,
    abi: C2C_ADMIN_ABI,
    functionName: 'getMerchantPaymentInfoForPlatform',
    args: [merchantAddress, PLATFORM_WISE],
  }) as Promise<{ nameHash: `0x${string}`; idHash: `0x${string}`; isSet: boolean }>;
}

/**
 * Read order data (including rateVersion) from the chain.
 */
export async function getOrder(
  merchantAddress: `0x${string}`,
  productId: bigint,
  assetType: 0 | 1,
  orderId: bigint,
): Promise<{
  buyer: `0x${string}`;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
}> {
  return publicClient.readContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'getOrder',
    args: [merchantAddress, productId, assetType, orderId],
  }) as Promise<any>;
}

// ─── Flow A: Wise-Crypto (buyer pays MYR, receives USDT) ─────────────────────

/**
 * Buyer places a CRYPTO order.
 * No EIP-712 signing required — placeOrder reads the rate from chain.
 */
export async function placeWiseCryptoOrder(
  buyerClient: ReturnType<typeof import('./hardhatAccounts').makePublicClient extends never ? never : any>,
  merchantAddress: `0x${string}`,
  amount: bigint,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const hash = await buyerClient.writeContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'placeOrder',
    args: [merchantAddress, WISE_CRYPTO_PRODUCT_ID, 0 /* CRYPTO */, amount, NULL_BUYER_INFO],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  let orderId = 0n;
  let deadline = 0n;
  const logs = parseEventLogs({ abi: C2C_ESCROW_ABI, logs: receipt.logs, eventName: 'OrderPlaced' });
  if (logs.length > 0) {
    orderId  = (logs[0].args as any).orderId  ?? 0n;
    deadline = (logs[0].args as any).deadline ?? 0n;
  }

  return { orderId, deadline, txHash: hash };
}

/**
 * Build OrderBindingContext for Wise-Crypto.
 * Reads rateVersion from the on-chain order.
 * CRYPTO: payee = merchant (buyer pays merchant on Wise).
 */
export async function makeWiseCryptoBindingContext(
  merchantAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  amount: bigint,
  orderId: bigint,
): Promise<OrderBindingContext> {
  const [merchantInfo, order] = await Promise.all([
    getWiseMerchantInfo(merchantAddress),
    getOrder(merchantAddress, WISE_CRYPTO_PRODUCT_ID, 0, orderId),
  ]);

  return {
    escrowAddress:    c2cConfig.escrowAddress,
    chainId:          31337,
    merchant:         merchantAddress,
    buyer:            buyerAddress,
    productId:        WISE_CRYPTO_PRODUCT_ID,
    orderId,
    assetType:        0, // CRYPTO
    amount,
    rate:             order.rate,
    rateVersion:      BigInt(order.rateVersion),
    deadline:         order.deadline,
    merchantNameHash: merchantInfo.nameHash,
    merchantIdHash:   merchantInfo.idHash,
    payeeNameHash:    merchantInfo.nameHash, // CRYPTO: payee = merchant
    payeeIdHash:      merchantInfo.idHash,
  };
}

/**
 * Run the Wise plugin to collect contacts + transfer proofs for CRYPTO flow.
 */
export async function generateWiseCryptoProof(ctx: OrderBindingContext): Promise<{
  contacts: ExtensionProveResponse;
  transfer: ExtensionProveResponse;
}> {
  return _runWisePlugin(ctx, ctx); // both proofs share the same binding hash
}

/**
 * Buyer submits contacts + transfer proofs → receives USDT.
 */
export async function submitWiseCryptoProof(
  buyerClient: any,
  merchantAddress: `0x${string}`,
  orderId: bigint,
  contacts: ExtensionProveResponse,
  transfer: ExtensionProveResponse,
): Promise<Hex> {
  const hash = await buyerClient.writeContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'payOrderByPlatform',
    args: [
      merchantAddress,
      WISE_CRYPTO_PRODUCT_ID,
      orderId,
      [buildContractProof(contacts), buildContractProof(transfer)] as any,
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ─── Flow B: Wise-Fiat (buyer locks USDT, merchant pays MYR, receives USDT) ──

/**
 * Buyer places a FIAT order (locks USDT directly in placeOrder).
 * Must have approved USDT to escrow before calling.
 */
export async function placeWiseFiatOrder(
  buyerClient: any,
  merchantAddress: `0x${string}`,
  amount: bigint,
  buyerNameHash: `0x${string}`,
  buyerIdHash: `0x${string}`,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  // Approve USDT for escrow (FIAT branch locks tokens immediately)
  await publicClient.waitForTransactionReceipt({
    hash: await buyerClient.writeContract({
      address: c2cConfig.usdtAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [c2cConfig.escrowAddress, amount],
    }),
  });

  const buyerInfo = { nameHash: buyerNameHash, idHash: buyerIdHash, isSet: true };
  const hash = await buyerClient.writeContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'placeOrder',
    args: [merchantAddress, WISE_FIAT_PRODUCT_ID, 1 /* FIAT */, amount, buyerInfo],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  let orderId = 0n;
  let deadline = 0n;
  const logs = parseEventLogs({ abi: C2C_ESCROW_ABI, logs: receipt.logs, eventName: 'OrderPlaced' });
  if (logs.length > 0) {
    orderId  = (logs[0].args as any).orderId  ?? 0n;
    deadline = (logs[0].args as any).deadline ?? 0n;
  }

  return { orderId, deadline, txHash: hash };
}

/**
 * Build OrderBindingContext for Wise-Fiat.
 * Reads rateVersion from the on-chain order.
 * FIAT: payee = buyer (merchant pays MYR to buyer's Wise account).
 */
export async function makeWiseFiatBindingContext(
  merchantAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  amount: bigint,
  orderId: bigint,
): Promise<OrderBindingContext> {
  const [merchantInfo, order, buyerInfo] = await Promise.all([
    getWiseMerchantInfo(merchantAddress),
    getOrder(merchantAddress, WISE_FIAT_PRODUCT_ID, 1, orderId),
    publicClient.readContract({
      address: c2cConfig.escrowAddress,
      abi: C2C_ESCROW_ABI,
      functionName: 'getBuyerPaymentInfo',
      args: [merchantAddress, WISE_FIAT_PRODUCT_ID, orderId],
    }) as Promise<{ nameHash: `0x${string}`; idHash: `0x${string}`; isSet: boolean }>,
  ]);

  return {
    escrowAddress:    c2cConfig.escrowAddress,
    chainId:          31337,
    merchant:         merchantAddress,
    buyer:            buyerAddress,
    productId:        WISE_FIAT_PRODUCT_ID,
    orderId,
    assetType:        1, // FIAT
    amount,
    rate:             order.rate,
    rateVersion:      BigInt(order.rateVersion),
    deadline:         order.deadline,
    merchantNameHash: merchantInfo.nameHash,
    merchantIdHash:   merchantInfo.idHash,
    payeeNameHash:    buyerInfo.nameHash, // FIAT: payee = buyer
    payeeIdHash:      buyerInfo.idHash,
  };
}

/**
 * Run the Wise plugin (merchant side) to collect contacts + transfer proofs for FIAT flow.
 */
export async function generateWiseFiatProof(ctx: OrderBindingContext): Promise<{
  contacts: ExtensionProveResponse;
  transfer: ExtensionProveResponse;
}> {
  return _runWisePlugin(ctx, ctx);
}

/**
 * Merchant submits contacts + transfer proofs → receives USDT.
 */
export async function submitWiseFiatProof(
  merchantClient: any,
  orderId: bigint,
  contacts: ExtensionProveResponse,
  transfer: ExtensionProveResponse,
): Promise<Hex> {
  const hash = await merchantClient.writeContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'receiveCryptoWithPlatformPayment',
    args: [
      WISE_FIAT_PRODUCT_ID,
      orderId,
      [buildContractProof(contacts), buildContractProof(transfer)] as any,
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ─── Backward-compatible wrappers (used by legacy WiseC2CDemoFlow) ────────────

/** @deprecated Use placeWiseCryptoOrder with explicit client */
export async function placeWiseFiatToCryptoOrder(
  _productId: bigint,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return placeWiseCryptoOrder(bc, mc.account!.address, 1_000_000_000_000_000_000n);
}

/** @deprecated Use makeWiseCryptoBindingContext */
export async function makeWiseFiatToCryptoBindingContext(
  _productId: bigint,
  orderId: bigint,
  _deadline: bigint,
): Promise<OrderBindingContext> {
  const { merchantClient: mc, buyerClient: bc } = await import('./hardhatAccounts');
  return makeWiseCryptoBindingContext(mc.account!.address, bc.account!.address, 1_000_000_000_000_000_000n, orderId);
}

/** @deprecated Use generateWiseCryptoProof */
export async function generateWiseBuyerProof(ctx: OrderBindingContext): Promise<{
  contacts: ExtensionProveResponse;
  transfer: ExtensionProveResponse;
}> {
  return generateWiseCryptoProof(ctx);
}

/** @deprecated Use submitWiseCryptoProof */
export async function submitBuyerWiseProof(
  contacts: ExtensionProveResponse,
  transfer: ExtensionProveResponse,
  _productId: bigint,
  orderId: bigint,
): Promise<Hex> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return submitWiseCryptoProof(bc, mc.account!.address, orderId, contacts, transfer);
}

// ─── Internal: run Wise plugin ────────────────────────────────────────────────

async function _runWisePlugin(
  contactsCtx: OrderBindingContext,
  transferCtx: OrderBindingContext,
): Promise<{ contacts: ExtensionProveResponse; transfer: ExtensionProveResponse }> {
  if (!window.tlsn?.execCode) {
    throw new Error('TLSN extension not found. Please install the TLSNotary extension.');
  }

  let pluginCode = await fetch('/plugins/wise.js').then((r) => r.text());

  const contactsBindingHash = computeOrderBindingHash(contactsCtx);
  const transferBindingHash = computeOrderBindingHash(transferCtx);

  pluginCode = injectOrderBindingHash(pluginCode, contactsBindingHash);
  pluginCode = injectMerchantNameHash(pluginCode, contactsCtx.merchantNameHash);
  pluginCode = injectMerchantIdHash(pluginCode, contactsCtx.merchantIdHash);
  pluginCode = injectPayeeNameHash(pluginCode, contactsCtx.payeeNameHash);
  pluginCode = injectPayeeIdHash(pluginCode, contactsCtx.payeeIdHash);
  pluginCode = injectTransferOrderBindingHash(pluginCode, transferBindingHash);

  const resultJson = await window.tlsn.execCode(pluginCode);
  const parsed = JSON.parse(resultJson) as {
    proofs: { contacts: ExtensionProveResponse; transfer: ExtensionProveResponse };
  };

  return parsed.proofs;
}

// ─── Re-export config alias for legacy components ─────────────────────────────

export const wiseConfig = {
  ...c2cConfig,
  merchantAddress: c2cConfig.merchant1Address || c2cConfig.merchantAddress,
  buyerAddress:    c2cConfig.user1Address     || c2cConfig.buyerAddress,
  rateCrypto:      4_500_000_000_000_000_000n,
  tradeAmount:     1_000_000_000_000_000_000n,
};

export async function getWiseMerchantInfoLegacy() {
  return getWiseMerchantInfo(wiseConfig.merchantAddress);
}

export async function getBuyerUsdtBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: c2cConfig.usdtAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [wiseConfig.buyerAddress],
  }) as Promise<bigint>;
}

export async function setupWiseFiatToCrypto(
  _nameHash: `0x${string}`,
  _idHash: `0x${string}`,
): Promise<{ productId: bigint; txHash: Hex }> {
  // No-op in new flow: all setup is done by deployDemoState.ts
  console.warn('[setupWiseFiatToCrypto] Setup is now handled by deployDemoState.ts');
  return { productId: 0n, txHash: '0x0' as Hex };
}
