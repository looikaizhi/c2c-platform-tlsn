// packages/demo/src/utils/wiseC2cActions.ts
// Action functions for the Wise C2C demo flows.
//
// Flow A (Wise-Crypto): Buyer pays MYR via Wise → receives USDT.
// Flow B (Wise-Fiat):   Buyer locks USDT → merchant pays MYR via Wise → merchant receives USDT.

import { parseEventLogs, keccak256, stringToBytes } from 'viem';
import type { Hex } from 'viem';

import { publicClient } from './hardhatAccounts';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI, C2C_RISK_MANAGER_ABI, C2C_BOND_VAULT_ABI, ERC20_ABI } from './c2cAbi';
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
  injectTransferOrderBindingHash,
  injectOwnerAddress,
  injectCounterpartyAddress,
  injectTenantId,
  ZERO_HASH_32,
  type ExtensionProveResponse,
  type OrderBindingContext,
} from './proofTransformer';

// ─── Platform ID (keccak256("wise") — matches TLSNVerifier.PLATFORM_WISE) ────

export const PLATFORM_WISE = keccak256(stringToBytes('wise')) as `0x${string}`;

// ─── Constants ────────────────────────────────────────────────────────────────

// productId from env (defaults: 0 for both Wise products)
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
): Promise<OrderView> {
  const raw = await publicClient.readContract({
    address: c2cConfig.escrowAddress,
    abi: C2C_ESCROW_ABI,
    functionName: 'getOrder',
    args: [merchantAddress, productId, assetType, orderId],
  });
  return normalizeOrder(raw);
}

// ─── Flow A: Wise-Crypto (buyer pays MYR, receives USDT) ─────────────────────

/**
 * Buyer places a CRYPTO order (V4: pre-checks bondBps and approves bondVault if needed).
 */
export async function placeWiseCryptoOrder(
  buyerClient: ReturnType<typeof import('./hardhatAccounts').makePublicClient extends never ? never : any>,
  merchantAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const buyerAddr = buyerClient.account?.address as `0x${string}`;

  // Step 1/4: Query requiredBondBps — may revert if blacklisted/frozen
  let bondBps: bigint;
  try {
    bondBps = BigInt(await publicClient.readContract({
      address: c2cConfig.riskManagerAddress,
      abi: C2C_RISK_MANAGER_ABI,
      functionName: 'requiredBondBps',
      args: [buyerAddr],
    }) as number);
  } catch (err: unknown) {
    const msg = (err as any)?.message ?? String(err);
    if (msg.includes('UserBlacklisted')) throw new Error('账户已被列入黑名单，无法下单');
    if (msg.includes('UserTemporarilyFrozen')) throw new Error('账户暂时冻结中，请等待解冻');
    throw new Error(`风险参数查询失败: ${msg}`);
  }

  // Step 2/4: Check bondVault allowance and approve if needed
  const estimatedBond = (amount * bondBps) / 10000n;
  if (estimatedBond > 0n) {
    const currentAllowance = await publicClient.readContract({
      address: c2cConfig.usdtAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [buyerAddr, c2cConfig.bondVaultAddress],
    }) as bigint;
    if (currentAllowance < estimatedBond) {
      const MAX_UINT256 = (2n ** 256n) - 1n;
      const approveTx = await buyerClient.writeContract({
        address: c2cConfig.usdtAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [c2cConfig.bondVaultAddress, MAX_UINT256],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
  }

  // Step 3/4: placeOrder — contract internally transfers bond to bondVault
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
 * Build OrderBindingContext for Wise-Crypto.
 * Reads rateVersion from the on-chain order.
 * CRYPTO: payee = merchant (buyer pays merchant on Wise).
 */
export async function makeWiseCryptoBindingContext(
  merchantAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
  orderId: bigint,
): Promise<OrderBindingContext> {
  const [merchantInfo, order] = await Promise.all([
    getWiseMerchantInfo(merchantAddress),
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
    ownerAddress:        buyerAddress.toLowerCase() as `0x${string}`,
    counterpartyAddress: merchantAddress.toLowerCase() as `0x${string}`,
    tenantId:            'wise',
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
  productId: bigint,
  orderId: bigint,
  contacts: ExtensionProveResponse,
  transfer: ExtensionProveResponse,
): Promise<Hex> {
  const contractProofs = [buildContractProof(contacts), buildContractProof(transfer)] as any;
  const diagnostics = await Promise.all([
    buildProofDebugSnapshot(contacts),
    buildProofDebugSnapshot(transfer),
  ]);
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

// ─── Flow B: Wise-Fiat (buyer locks USDT, merchant pays MYR, receives USDT) ──

/**
 * Resolve the crypto token address for a FIAT product by reading the crypto support list.
 * Falls back to USDT if lookup fails.
 */
async function resolveFiatProductCryptoToken(
  merchantAddress: `0x${string}`,
  productId: bigint,
): Promise<`0x${string}`> {
  try {
    // Read all ProductListed events for this merchant to find the cryptoID
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
export async function placeWiseFiatOrder(
  buyerClient: any,
  merchantAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
  buyerNameHash: `0x${string}`,
  buyerIdHash: `0x${string}`,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const tokenAddress = await resolveFiatProductCryptoToken(merchantAddress, productId);
  // Approve crypto token for escrow (FIAT branch locks tokens immediately)
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
 * Build OrderBindingContext for Wise-Fiat.
 * Reads rateVersion from the on-chain order.
 * FIAT: payee = buyer (merchant pays MYR to buyer's Wise account).
 */
export async function makeWiseFiatBindingContext(
  merchantAddress: `0x${string}`,
  buyerAddress: `0x${string}`,
  productId: bigint,
  amount: bigint,
  orderId: bigint,
): Promise<OrderBindingContext> {
  const [merchantInfo, order, buyerInfo] = await Promise.all([
    getWiseMerchantInfo(merchantAddress),
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
    ownerAddress:        buyerAddress.toLowerCase() as `0x${string}`,
    counterpartyAddress: merchantAddress.toLowerCase() as `0x${string}`,
    tenantId:            'wise',
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
  productId: bigint,
  orderId: bigint,
  contacts: ExtensionProveResponse,
  transfer: ExtensionProveResponse,
): Promise<Hex> {
  const contractProofs = [buildContractProof(contacts), buildContractProof(transfer)] as any;
  const diagnostics = await Promise.all([
    buildProofDebugSnapshot(contacts),
    buildProofDebugSnapshot(transfer),
  ]);
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

// ─── Backward-compatible wrappers (used by legacy WiseC2CDemoFlow) ────────────

/** @deprecated Use placeWiseCryptoOrder with explicit client */
export async function placeWiseFiatToCryptoOrder(
  productId: bigint,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return placeWiseCryptoOrder(bc, mc.account!.address, productId, 1_000_000_000_000_000_000n);
}

/** @deprecated Use makeWiseCryptoBindingContext */
export async function makeWiseFiatToCryptoBindingContext(
  productId: bigint,
  orderId: bigint,
  _deadline: bigint,
): Promise<OrderBindingContext> {
  const { merchantClient: mc, buyerClient: bc } = await import('./hardhatAccounts');
  return makeWiseCryptoBindingContext(mc.account!.address, bc.account!.address, productId, 1_000_000_000_000_000_000n, orderId);
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
  productId: bigint,
  orderId: bigint,
): Promise<Hex> {
  const { buyerClient: bc, merchantClient: mc } = await import('./hardhatAccounts');
  return submitWiseCryptoProof(bc, mc.account!.address, productId, orderId, contacts, transfer);
}

// ─── V4: claimBond ────────────────────────────────────────────────────────────

/**
 * Pull claimable bond balance from bondVault for a given token.
 * Must be called by the beneficiary (buyer or merchant).
 */
export async function claimBond(
  callerClient: any,
  tokenAddress: `0x${string}`,
): Promise<Hex> {
  const hash = await callerClient.writeContract({
    address: c2cConfig.bondVaultAddress,
    abi: C2C_BOND_VAULT_ABI,
    functionName: 'claim',
    args: [tokenAddress],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
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

  // Audit scoping: owner = buyer, counterparty = merchant, tenant = 'wise'.
  // For Wise, contacts and transfer share the same buyer/merchant pair.
  const idCtx = contactsCtx;
  if (idCtx.ownerAddress)        pluginCode = injectOwnerAddress(pluginCode, idCtx.ownerAddress);
  if (idCtx.counterpartyAddress) pluginCode = injectCounterpartyAddress(pluginCode, idCtx.counterpartyAddress);
  pluginCode = injectTenantId(pluginCode, idCtx.tenantId); // always call → triggers D-2 删行兜底

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
