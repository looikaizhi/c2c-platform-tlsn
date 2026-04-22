// packages/demo/src/utils/alipayC2cActions.ts
// Action functions for the Alipay C2C demo flows.
//
// Flow A (Alipay-Crypto): Buyer pays CNY via Alipay → receives USDT.
// Flow B (Alipay-Fiat):   Buyer locks USDT → merchant pays CNY via Alipay → merchant receives USDT.

import { parseEventLogs, keccak256, stringToBytes } from 'viem';
import type { Hex } from 'viem';

import { publicClient } from './hardhatAccounts';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI, ERC20_ABI } from './c2cAbi';
import { c2cConfig } from './c2cContractConfig';
import { normalizeOrder, type OrderView } from './orderView';
import { decodeContractError, formatContractAwareError } from './contractErrors';
import {
  buildProofDebugSnapshot,
  buildContractProof,
  computeOrderBindingHash,
  injectOrderBindingHash,
  injectMerchantNameHash,
  injectMerchantIdHash,
  injectPayeeNameHash,
  injectPayeeIdHash,
  ZERO_HASH_32,
  type ExtensionProveResponse,
  type OrderBindingContext,
} from './proofTransformer';

// ─── Platform ID (keccak256("alipay") — matches TLSNVerifier.PLATFORM_ALIPAY) ─

export const PLATFORM_ALIPAY = keccak256(stringToBytes('alipay')) as `0x${string}`;

// ─── Constants ────────────────────────────────────────────────────────────────

// productId from env (defaults: 1 for both Alipay products)
export const ALIPAY_CRYPTO_PRODUCT_ID = 1n;
export const ALIPAY_FIAT_PRODUCT_ID   = 1n;

const NULL_BUYER_INFO = {
  nameHash: ZERO_HASH_32 as `0x${string}`,
  idHash:   ZERO_HASH_32 as `0x${string}`,
  isSet:    false,
} as const;

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Read Alipay merchant payment info for a given merchant address.
 */
export async function getAlipayMerchantInfo(merchantAddress: `0x${string}`): Promise<{
  nameHash: `0x${string}`;
  idHash: `0x${string}`;
  isSet: boolean;
}> {
  return publicClient.readContract({
    address: c2cConfig.adminAddress,
    abi: C2C_ADMIN_ABI,
    functionName: 'getMerchantPaymentInfoForPlatform',
    args: [merchantAddress, PLATFORM_ALIPAY],
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
): Promise<OrderView> {
  const raw = await publicClient.readContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'getOrder',
    args: [merchantAddress, productId, assetType, orderId],
  });
  return normalizeOrder(raw);
}

export async function getBuyerUsdtBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: c2cConfig.usdtAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [c2cConfig.user1Address || c2cConfig.buyerAddress],
  }) as Promise<bigint>;
}

export async function getMerchantUsdtBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: c2cConfig.usdtAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [c2cConfig.merchant1Address || c2cConfig.merchantAddress],
  }) as Promise<bigint>;
}

// ─── Flow A: Alipay-Crypto (buyer pays CNY, receives USDT) ───────────────────

/**
 * Buyer places a CRYPTO order.
 * No EIP-712 signing required — placeOrder reads the rate from chain.
 */
export async function placeAlipayCryptoOrder(
  buyerClient: any,
  merchantAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const hash = await buyerClient.writeContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'placeOrder',
    args: [merchantAddress, productId, 0 /* CRYPTO */, amount, NULL_BUYER_INFO],
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
 * Build OrderBindingContext for Alipay-Crypto.
 * Reads rateVersion from the on-chain order.
 * CRYPTO: payee = merchant (buyer pays merchant on Alipay).
 */
export async function makeAlipayCryptoBindingContext(
  merchantAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
  orderId: bigint,
): Promise<OrderBindingContext> {
  const [merchantInfo, order] = await Promise.all([
    getAlipayMerchantInfo(merchantAddress),
    getOrder(merchantAddress, productId, 0, orderId),
  ]);

  return {
    escrowAddress:    c2cConfig.escrowAddress,
    chainId:          31337,
    merchant:         merchantAddress,
    buyer:            buyerAddress,
    productId,
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
 * Run the Alipay plugin (buyer side) to collect payment proof for CRYPTO flow.
 */
export async function generateAlipayCryptoProof(ctx: OrderBindingContext): Promise<ExtensionProveResponse> {
  return _runAlipayPlugin(ctx);
}

/**
 * Buyer submits Alipay payment proof → receives USDT.
 */
export async function submitAlipayCryptoProof(
  buyerClient: any,
  merchantAddress: `0x${string}`,
  productId: bigint,
  orderId: bigint,
  proof: ExtensionProveResponse,
): Promise<Hex> {
  const contractProofs = [buildContractProof(proof)] as any;
  const diagnostics = [await buildProofDebugSnapshot(proof)];
  try {
    const hash = await buyerClient.writeContract({
      address: c2cConfig.escrowAddress,
      abi: C2C_ESCROW_ABI,
      functionName: 'payOrderByPlatform',
      args: [merchantAddress, productId, orderId, contractProofs],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } catch (err) {
    const decoded = decodeContractError(err);
    const summary = decoded
      ? `${decoded.errorName ?? 'UnknownCustomError'} (${decoded.selector})`
      : 'Unknown contract error';
    throw new Error(
      [
        `payOrderByPlatform failed: ${summary}`,
        `diagnostics=${JSON.stringify(diagnostics)}`,
        `raw=${formatContractAwareError(err)}`,
      ].join(' | '),
    );
  }
}

// ─── Flow B: Alipay-Fiat (buyer locks USDT, merchant pays CNY, receives USDT) ─

/**
 * Resolve the crypto token address for a FIAT product by reading the crypto support list.
 * Falls back to USDT if lookup fails.
 */
async function resolveFiatProductCryptoToken(
  merchantAddress: `0x${string}`,
  productId: bigint,
): Promise<`0x${string}`> {
  try {
    const { parseAbiItem } = await import('viem');
    const logs = await publicClient.getLogs({
      address: c2cConfig.escrowAddress,
      event: parseAbiItem('event ProductListed(address indexed merchant, uint256 indexed productId, uint8 indexed assetType, uint256 cryptoID, uint256 fiatID, uint256 collateralAmount, bool isActive)'),
      args: { merchant: merchantAddress, productId, assetType: 1 } as any,
      fromBlock: 0n,
    });
    if (logs.length === 0) return c2cConfig.usdtAddress;
    const cryptoID = (logs[logs.length - 1].args as any).cryptoID as bigint;
    const cryptoList = await publicClient.readContract({
      address: c2cConfig.adminAddress,
      abi: C2C_ADMIN_ABI,
      functionName: 'getSupportCryptoList',
      args: [],
    }) as any[];
    const match = cryptoList.find((c: any) => BigInt(c.id ?? c[0]) === cryptoID);
    return (match?.tokenAddress ?? match?.[2] ?? c2cConfig.usdtAddress) as `0x${string}`;
  } catch {
    return c2cConfig.usdtAddress;
  }
}

/**
 * Buyer places a FIAT order (locks crypto token directly in placeOrder).
 * Dynamically resolves the crypto token for the FIAT product.
 */
export async function placeAlipayFiatOrder(
  buyerClient: any,
  merchantAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
  buyerNameHash: `0x${string}`,
  buyerIdHash: `0x${string}`,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const tokenAddress = await resolveFiatProductCryptoToken(merchantAddress, productId);
  // Approve crypto token for escrow — FIAT branch locks tokens immediately in placeOrder
  await publicClient.waitForTransactionReceipt({
    hash: await buyerClient.writeContract({
      address: tokenAddress,
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
    args: [merchantAddress, productId, 1 /* FIAT */, amount, buyerInfo],
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
 * Build OrderBindingContext for Alipay-Fiat.
 * Reads rateVersion from the on-chain order.
 * FIAT: payee = buyer (merchant pays CNY to buyer's Alipay account).
 */
export async function makeAlipayFiatBindingContext(
  merchantAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
  orderId: bigint,
): Promise<OrderBindingContext> {
  const [merchantInfo, order, buyerInfo] = await Promise.all([
    getAlipayMerchantInfo(merchantAddress),
    getOrder(merchantAddress, productId, 1, orderId),
    publicClient.readContract({
      address: c2cConfig.escrowAddress,
      abi: C2C_ESCROW_ABI,
      functionName: 'getBuyerPaymentInfo',
      args: [merchantAddress, productId, orderId],
    }) as Promise<{ nameHash: `0x${string}`; idHash: `0x${string}`; isSet: boolean }>,
  ]);

  return {
    escrowAddress:    c2cConfig.escrowAddress,
    chainId:          31337,
    merchant:         merchantAddress,
    buyer:            buyerAddress,
    productId,
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
 * Run the Alipay plugin (merchant side) to collect payment proof for FIAT flow.
 */
export async function generateAlipayFiatProof(ctx: OrderBindingContext): Promise<ExtensionProveResponse> {
  return _runAlipayPlugin(ctx);
}

/**
 * Merchant submits Alipay proof → receives USDT.
 */
export async function submitAlipayFiatProof(
  merchantClient: any,
  productId: bigint,
  orderId: bigint,
  proof: ExtensionProveResponse,
): Promise<Hex> {
  const contractProofs = [buildContractProof(proof)] as any;
  const diagnostics = [await buildProofDebugSnapshot(proof)];
  try {
    const hash = await merchantClient.writeContract({
      address: c2cConfig.escrowAddress,
      abi: C2C_ESCROW_ABI,
      functionName: 'receiveCryptoWithPlatformPayment',
      args: [productId, orderId, contractProofs],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } catch (err) {
    const decoded = decodeContractError(err);
    const summary = decoded
      ? `${decoded.errorName ?? 'UnknownCustomError'} (${decoded.selector})`
      : 'Unknown contract error';
    throw new Error(
      [
        `receiveCryptoWithPlatformPayment failed: ${summary}`,
        `diagnostics=${JSON.stringify(diagnostics)}`,
        `raw=${formatContractAwareError(err)}`,
      ].join(' | '),
    );
  }
}

// ─── Backward-compatible exports for legacy AlipayC2CDemoFlow ─────────────────

export const alipayConfig = {
  ...c2cConfig,
  merchantAddress: c2cConfig.merchant1Address || c2cConfig.merchantAddress,
  buyerAddress:    c2cConfig.user1Address     || c2cConfig.buyerAddress,
  rateCrypto:      7_200_000_000_000_000_000n,
  rateFiat:        720n,
  tradeAmount:     1_000_000_000_000_000_000n,
};

export async function setupFiatToCrypto(
  _nameHash: `0x${string}`,
  _idHash: `0x${string}`,
): Promise<{ productId: bigint; txHash: Hex }> {
  console.warn('[setupFiatToCrypto] Setup is now handled by deployDemoState.ts');
  return { productId: 1n, txHash: '0x0' as Hex };
}

export async function setupCryptoToFiat(
  _nameHash: `0x${string}`,
  _idHash: `0x${string}`,
): Promise<{ productId: bigint; txHash: Hex }> {
  console.warn('[setupCryptoToFiat] Setup is now handled by deployDemoState.ts');
  return { productId: 1n, txHash: '0x0' as Hex };
}

export async function placeFiatToCryptoOrder(
  productId: bigint,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return placeAlipayCryptoOrder(bc, mc.account!.address, productId, 1_000_000_000_000_000_000n);
}

export async function placeCryptoToFiatOrder(
  productId: bigint,
  buyerNameHash: `0x${string}`,
  buyerIdHash: `0x${string}`,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return placeAlipayFiatOrder(bc, mc.account!.address, productId, 1_000_000_000_000_000_000n, buyerNameHash, buyerIdHash);
}

export async function makeFiatToCryptoBindingContext(
  productId: bigint,
  orderId: bigint,
  _deadline: bigint,
): Promise<OrderBindingContext> {
  const { merchantClient: mc, buyerClient: bc } = await import('./hardhatAccounts');
  return makeAlipayCryptoBindingContext(mc.account!.address, bc.account!.address, productId, 1_000_000_000_000_000_000n, orderId);
}

export async function makeCryptoToFiatBindingContext(
  productId: bigint,
  orderId: bigint,
  _deadline: bigint,
): Promise<OrderBindingContext> {
  const { merchantClient: mc, buyerClient: bc } = await import('./hardhatAccounts');
  return makeAlipayFiatBindingContext(mc.account!.address, bc.account!.address, productId, 1_000_000_000_000_000_000n, orderId);
}

export async function generateAlipayBuyerProof(ctx: OrderBindingContext): Promise<ExtensionProveResponse> {
  return generateAlipayCryptoProof(ctx);
}

export async function generateAlipayMerchantProof(ctx: OrderBindingContext): Promise<ExtensionProveResponse> {
  return generateAlipayFiatProof(ctx);
}

export async function submitBuyerAlipayProof(
  proof: ExtensionProveResponse,
  productId: bigint,
  orderId: bigint,
): Promise<Hex> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return submitAlipayCryptoProof(bc, mc.account!.address, productId, orderId, proof);
}

export async function submitMerchantAlipayReceivedProof(
  proof: ExtensionProveResponse,
  productId: bigint,
  orderId: bigint,
): Promise<Hex> {
  const { merchantClient: mc } = await import('./hardhatAccounts');
  return submitAlipayFiatProof(mc, productId, orderId, proof);
}

/** @deprecated escrowBuyerCrypto is now merged into placeOrder FIAT branch */
export async function escrowBuyerCrypto(
  _productId: bigint,
  _orderId: bigint,
): Promise<Hex> {
  throw new Error('escrowBuyerCrypto is no longer needed. USDT is locked directly by placeOrder in FIAT flow.');
}

export async function getOrderDeadline(
  merchant: `0x${string}`,
  productId: bigint,
  orderId: bigint,
  assetType: 0 | 1,
): Promise<bigint> {
  const order = await getOrder(merchant, productId, assetType, orderId);
  return order.deadline;
}

// ─── Internal: run Alipay plugin ──────────────────────────────────────────────

async function _runAlipayPlugin(ctx: OrderBindingContext): Promise<ExtensionProveResponse> {
  if (!window.tlsn?.execCode) {
    throw new Error('TLSN extension not found. Please install the TLSNotary extension.');
  }
  let pluginCode = await fetch('/plugins/alipay.js').then((r) => r.text());
  const bindingHash = computeOrderBindingHash(ctx);
  pluginCode = injectOrderBindingHash(pluginCode, bindingHash);
  pluginCode = injectMerchantNameHash(pluginCode, ctx.merchantNameHash);
  pluginCode = injectMerchantIdHash(pluginCode, ctx.merchantIdHash);
  pluginCode = injectPayeeNameHash(pluginCode, ctx.payeeNameHash);
  pluginCode = injectPayeeIdHash(pluginCode, ctx.payeeIdHash);
  const resultJson = await window.tlsn.execCode(pluginCode);
  return JSON.parse(resultJson) as ExtensionProveResponse;
}
