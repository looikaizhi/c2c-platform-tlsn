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

import { keccak256, parseAbiItem, parseEventLogs, stringToBytes } from 'viem';
import type { Hex, WalletClient } from 'viem';

import {
  addresses,
  chain,
  publicClient,
  decodeContractError,
  formatContractAwareError,
  normalizeOrder,
  type OrderView,
} from './chain';
import {
  C2C_ADMIN_ABI,
  C2C_BOND_VAULT_ABI,
  C2C_ESCROW_ABI,
  C2C_RISK_MANAGER_ABI,
  ERC20_ABI,
} from './abis';
import { PLATFORM_ALIPAY, PLATFORM_WISE, type PlatformAdapter } from './platforms';
import {
  buildContractProof,
  buildProofDebugSnapshot,
  ZERO_HASH_32,
  type ExtensionProveResponse,
  type OrderBindingContext,
  type ProofExportResponse,
} from './proof';

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

// ─── Order placement (= placeWise/AlipayCryptoOrder + Fiat variants) ────────
//
// Single generic placeOrder used by Phase 6.2c onwards. Behavior parity with
// wise/alipay actions:
//   - CRYPTO branch: query requiredBondBps + approve bondVault if needed +
//     placeOrder with NULL_BUYER_INFO
//   - FIAT branch: resolve crypto token for product + approve escrow +
//     placeOrder with buyer's binding hashes
// Decodes the OrderPlaced event from the receipt for { orderId, deadline }.

const NULL_BUYER_INFO = {
  nameHash: ZERO_HASH_32,
  idHash:   ZERO_HASH_32,
  isSet:    false,
} as const;

async function readOrder(
  merchant: Hex,
  productId: bigint,
  assetType: 0 | 1,
  orderId: bigint,
): Promise<OrderView> {
  const raw = await publicClient.readContract({
    address:      addresses.escrowAddress,
    abi:          C2C_ESCROW_ABI,
    functionName: 'getOrder',
    args:         [merchant, productId, assetType, orderId],
  });
  return normalizeOrder(raw);
}

async function resolveFiatProductCryptoToken(
  merchantAddress: Hex,
  productId: bigint,
): Promise<Hex> {
  try {
    const logs = await publicClient.getLogs({
      address: addresses.escrowAddress,
      event: parseAbiItem(
        'event ProductListed(address indexed merchant, uint256 indexed productId, uint8 indexed assetType, uint256 cryptoID, uint256 fiatID, uint256 collateralAmount, bool isActive)',
      ),
      args: { merchant: merchantAddress, productId, assetType: 1 } as any,
      fromBlock: 0n,
    });
    if (logs.length === 0) return addresses.usdtAddress;
    const cryptoID = (logs[logs.length - 1].args as any).cryptoID as bigint;
    const cryptoList = await publicClient.readContract({
      address:      addresses.adminAddress,
      abi:          C2C_ADMIN_ABI,
      functionName: 'getSupportCryptoList',
      args:         [],
    }) as any[];
    const match = cryptoList.find((c: any) => BigInt(c.id ?? c[0]) === cryptoID);
    return (match?.tokenAddress ?? match?.[2] ?? addresses.usdtAddress) as Hex;
  } catch {
    return addresses.usdtAddress;
  }
}

export async function placeOrder(
  buyerClient: WalletClient,
  merchant: Hex,
  productId: bigint,
  assetType: 0 | 1,
  amount: bigint,
  /** Required for FIAT (buyer's binding hashes); ignored for CRYPTO. */
  buyerInfo?: { nameHash: Hex; idHash: Hex },
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }> {
  const buyerAddr = buyerClient.account?.address as Hex | undefined;
  if (!buyerAddr) throw new Error('Wallet client has no account attached.');

  if (assetType === 0) {
    // CRYPTO: bond pre-check + approve if needed
    let bondBps: bigint;
    try {
      bondBps = BigInt(await publicClient.readContract({
        address:      addresses.riskManagerAddress,
        abi:          C2C_RISK_MANAGER_ABI,
        functionName: 'requiredBondBps',
        args:         [buyerAddr],
      }) as number);
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? String(err);
      if (msg.includes('UserBlacklisted')) throw new Error('账户已被列入黑名单，无法下单');
      if (msg.includes('UserTemporarilyFrozen')) throw new Error('账户暂时冻结中，请等待解冻');
      throw new Error(`风险参数查询失败: ${msg}`);
    }
    const estimatedBond = (amount * bondBps) / 10000n;
    if (estimatedBond > 0n) {
      const currentAllowance = await publicClient.readContract({
        address:      addresses.usdtAddress,
        abi:          ERC20_ABI,
        functionName: 'allowance',
        args:         [buyerAddr, addresses.bondVaultAddress],
      }) as bigint;
      if (currentAllowance < estimatedBond) {
        const MAX_UINT256 = (2n ** 256n) - 1n;
        const approveTx = await buyerClient.writeContract({
          account:      buyerClient.account!,
          chain,
          address:      addresses.usdtAddress,
          abi:          ERC20_ABI,
          functionName: 'approve',
          args:         [addresses.bondVaultAddress, MAX_UINT256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }
    }
  } else {
    // FIAT: resolve token + approve escrow
    if (!buyerInfo) throw new Error('FIAT order requires buyerInfo { nameHash, idHash }.');
    const tokenAddress = await resolveFiatProductCryptoToken(merchant, productId);
    const approveTx = await buyerClient.writeContract({
      account:      buyerClient.account!,
      chain,
      address:      tokenAddress,
      abi:          ERC20_ABI,
      functionName: 'approve',
      args:         [addresses.escrowAddress, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  const placeArgs = assetType === 0
    ? [merchant, productId, 0, amount, NULL_BUYER_INFO]
    : [merchant, productId, 1, amount, { nameHash: buyerInfo!.nameHash, idHash: buyerInfo!.idHash, isSet: true }];

  const hash = await buyerClient.writeContract({
    account:      buyerClient.account!,
    chain,
    address:      addresses.escrowAddress,
    abi:          C2C_ESCROW_ABI,
    functionName: 'placeOrder',
    args:         placeArgs as any,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  let orderId = 0n;
  let deadline = 0n;
  const logs = parseEventLogs({
    abi: C2C_ESCROW_ABI,
    logs: receipt.logs,
    eventName: 'OrderPlaced',
  });
  if (logs.length > 0) {
    orderId  = (logs[0].args as any).orderId  ?? 0n;
    deadline = (logs[0].args as any).deadline ?? 0n;
  }
  return { orderId, deadline, txHash: hash };
}

// ─── makeBindingContext (= makeWise/AlipayCryptoBindingContext) ─────────────
//
// Build the OrderBindingContext that gets injected into the plugin. The
// adapter contributes the merchant's platform binding (resolved via the
// adapter's PlatformId on-chain) and the tenant tag.
//   - CRYPTO: payee = merchant (buyer pays merchant on the platform)
//   - FIAT:   payee = buyer    (merchant pays buyer on the platform)

export async function makeBindingContext(
  adapter: PlatformAdapter,
  merchant: Hex,
  buyer: Hex,
  productId: bigint,
  assetType: 0 | 1,
  amount: bigint,
  orderId: bigint,
  /**
   * Required for FIAT when caller is buyer-side (TradingHall). For merchant-
   * side FIAT (MerchantPanel) leave undefined — buyer's payment info is read
   * from chain via getBuyerPaymentInfo.
   */
  buyerInfo?: { nameHash: Hex; idHash: Hex },
): Promise<OrderBindingContext> {
  const [merchantBinding, order] = await Promise.all([
    getUserPlatformBinding(merchant, adapter.id),
    readOrder(merchant, productId, assetType, orderId),
  ]);
  if (!merchantBinding.isSet) {
    throw new Error(
      `Merchant ${merchant.slice(0, 10)}… has not bound their ${adapter.label} account on-chain.`,
    );
  }

  let resolvedBuyerInfo = buyerInfo;
  if (assetType === 1 && !resolvedBuyerInfo) {
    // Merchant-side FIAT: fetch buyer's binding hashes from the on-chain order.
    const raw = await publicClient.readContract({
      address:      addresses.escrowAddress,
      abi:          C2C_ESCROW_ABI,
      functionName: 'getBuyerPaymentInfo',
      args:         [merchant, productId, orderId],
    }) as { nameHash: Hex; idHash: Hex; isSet: boolean };
    resolvedBuyerInfo = { nameHash: raw.nameHash, idHash: raw.idHash };
  }

  const payeeNameHash = assetType === 0 ? merchantBinding.nameHash : resolvedBuyerInfo!.nameHash;
  const payeeIdHash   = assetType === 0 ? merchantBinding.idHash   : resolvedBuyerInfo!.idHash;

  return {
    escrowAddress:       addresses.escrowAddress,
    chainId:             chain.id,
    merchant,
    buyer,
    productId,
    orderId,
    assetType,
    amount,
    rate:                order.rate,
    rateVersion:         BigInt(order.rateVersion),
    deadline:            order.deadline,
    merchantNameHash:    merchantBinding.nameHash,
    merchantIdHash:      merchantBinding.idHash,
    payeeNameHash,
    payeeIdHash,
    ownerAddress:        buyer.toLowerCase() as Hex,
    counterpartyAddress: merchant.toLowerCase() as Hex,
    tenantId:            adapter.tenantId as 'wise' | 'alipay',
  };
}

// ─── submitPaymentProofs (= submitWise/AlipayCryptoProof + FiatProof) ───────
//
// Routes to the correct on-chain entry point based on assetType:
//   - CRYPTO (assetType 0): buyer calls payOrderByPlatform(merchant, ...)
//   - FIAT   (assetType 1): merchant calls receiveCryptoWithPlatformPayment(...)
// The diagnostic snapshot is surfaced in the thrown error so panels can log
// the full context on failure.

export async function submitPaymentProofs(
  client: WalletClient,
  args: {
    /** Required for CRYPTO; unused for FIAT (merchant is the caller). */
    merchant?: Hex;
    productId: bigint;
    orderId:   bigint;
    assetType: 0 | 1;
    proofs:    ExtensionProveResponse[];
  },
): Promise<Hex> {
  const contractProofs = args.proofs.map(buildContractProof) as any;
  const diagnostics    = await Promise.all(args.proofs.map(buildProofDebugSnapshot));

  const isCrypto = args.assetType === 0;
  const functionName = isCrypto ? 'payOrderByPlatform' : 'receiveCryptoWithPlatformPayment';
  const fnArgs       = isCrypto
    ? [args.merchant!, args.productId, args.orderId, contractProofs]
    : [args.productId, args.orderId, contractProofs];

  try {
    const hash = await client.writeContract({
      account:      client.account!,
      chain,
      address:      addresses.escrowAddress,
      abi:          C2C_ESCROW_ABI,
      functionName,
      args:         fnArgs as any,
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
        `${functionName} failed: ${summary}`,
        `diagnostics=${JSON.stringify(diagnostics)}`,
        `raw=${formatContractAwareError(err)}`,
      ].join(' | '),
    );
  }
}

// ─── claimBond (= wiseC2cActions.claimBond, platform-agnostic) ──────────────
//
// Buyer or merchant claims their accrued bond from BondVault for `tokenAddress`
// (typically USDT). Returns the tx hash after waitForTransactionReceipt.

export async function claimBond(
  callerClient: WalletClient,
  tokenAddress: Hex,
): Promise<Hex> {
  const hash = await callerClient.writeContract({
    account:      callerClient.account!,
    chain,
    address:      addresses.bondVaultAddress,
    abi:          C2C_BOND_VAULT_ABI,
    functionName: 'claim',
    args:         [tokenAddress],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
