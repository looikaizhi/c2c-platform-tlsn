// packages/demo/src/components/UserPanel.tsx
// Shows user tabs with balances (ETH / USDT / USDC / DAI) and active orders.

import { useEffect, useRef, useState } from 'react';
import { formatUnits, getAddress } from 'viem';
import type { Hex } from 'viem';

import {
  getUserClientByAddress,
  MERCHANT_ADDRESSES,
  publicClient,
} from '../utils/hardhatAccounts';
import { C2C_ESCROW_ABI, C2C_RISK_MANAGER_ABI, C2C_BOND_VAULT_ABI, ERC20_ABI } from '../utils/c2cAbi';
import { c2cConfig, isC2CConfigured } from '../utils/c2cContractConfig';
import { ReputationBadge, type ReputationView } from './ReputationBadge';
import { claimBond } from '../utils/wiseC2cActions';
import { getDemoUserAddresses } from '../utils/demoUsers';
import { normalizeOrder } from '../utils/orderView';
import {
  generateWiseCryptoProof,
  makeWiseCryptoBindingContext,
  PLATFORM_WISE,
  submitWiseCryptoProof,
} from '../utils/wiseC2cActions';
import {
  generateAlipayCryptoProof,
  makeAlipayCryptoBindingContext,
  PLATFORM_ALIPAY,
  submitAlipayCryptoProof,
} from '../utils/alipayC2cActions';
import {
  buildPaymentProofArtifactStorageKey,
  PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION,
  type PaymentProofArtifactV1,
} from '../utils/paymentProofArtifact';
import { computeOrderBindingHash, type ExtensionProveResponse } from '../utils/proofTransformer';
import { loginAsUser } from '../utils/verifierAuth';
import { patchProofTx } from '../utils/proofsApi';
import { hardhatChain } from '../utils/hardhatAccounts';
import { MyProofs } from './MyProofs';

// -- Constants ---------------------------------------------------------------
const ZERO_HASH_32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

// -- Design tokens -----------------------------------------------------------
const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 24,
};
const TAB_BASE: React.CSSProperties = {
  padding: '0 16px', minHeight: 36, border: 'none',
  borderRadius: '6px 6px 0 0', cursor: 'pointer',
  fontWeight: 600, fontSize: 13, lineHeight: '36px',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: '#767676', marginBottom: 3, fontWeight: 500,
};
const VALUE: React.CSSProperties = {
  fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all',
  fontVariantNumeric: 'tabular-nums',
};
const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 12, marginBottom: 16,
};
const GRID_CELL: React.CSSProperties = {
  background: '#f8f9fa', borderRadius: 8, padding: '10px 12px',
};

// Order status badge colours (V4: 0=PENDING, 1=EXPIRED, 2=COMPLETED, 3=WAITING)
const STATUS_STYLE: Record<number, { bg: string; color: string; label: string }> = {
  0: { bg: '#e6f4ff', color: '#1677ff', label: 'PENDING' },
  1: { bg: '#fff7e6', color: '#d46b08', label: 'EXPIRED' },
  2: { bg: '#f6ffed', color: '#52c41a', label: 'COMPLETED' },
  3: { bg: '#e6f4ff', color: '#1677ff', label: 'WAITING' },
};

// -- Helpers -----------------------------------------------------------------
/** Format a token balance to exactly 4 decimal places using the token's real decimals. */
function fmt4(balance: bigint, decimals: number): string {
  return parseFloat(formatUnits(balance, decimals)).toFixed(4);
}

function resolvePlatformLabel(platformId: Hex): string {
  if (platformId === PLATFORM_WISE) return 'Wise';
  if (platformId === PLATFORM_ALIPAY) return 'Alipay';
  return `${platformId.slice(0, 10)}...`;
}

function formatUserFacingError(err: unknown): string {
  const e = err as any;
  return (
    e?.details ||
    e?.cause?.message ||
    e?.message ||
    e?.shortMessage ||
    String(err)
  );
}

/**
 * Backfill verifier proof_store rows with on-chain txHash so audit UI can
 * filter on `status=committed`. Best-effort: 409 = already committed (skip),
 * any other failure becomes a console warning — does NOT roll back the on-chain payment.
 */
async function backfillTx(
  sessionIds: string[],
  txHash: Hex,
  userAddr: Hex,
  onLog: (message: string) => void,
): Promise<void> {
  if (sessionIds.length === 0) return;
  const results = await Promise.allSettled(
    sessionIds.map((sid) =>
      patchProofTx(sid, txHash, hardhatChain.id, userAddr),
    ),
  );
  const failed: string[] = [];
  let alreadyCount = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (r.value.alreadyCommitted) alreadyCount += 1;
      else if (!r.value.ok) failed.push(`${sessionIds[i]} → ${r.value.status}`);
    } else {
      failed.push(`${sessionIds[i]} → ${(r.reason as any)?.message ?? r.reason}`);
    }
  });
  if (alreadyCount > 0) {
    onLog(`ℹ ${alreadyCount}/${sessionIds.length} 链上回填已完成(409,跳过)`);
  }
  if (failed.length) {
    onLog(`⚠ ${failed.length}/${sessionIds.length} 链上回填失败(不影响留存): ${failed.join('; ')}`);
  } else {
    onLog(`链上回填完成 (${sessionIds.length} session)`);
  }
}

function extractSessionIds(proofs: ExtensionProveResponse[]): string[] {
  const set = new Set<string>();
  for (const proof of proofs) {
    const sid = proof.verifierSignature?.sessionId;
    if (sid) set.add(sid);
  }
  return [...set];
}

function storageKeyForOrder(buyerAddress: Hex, order: ActiveOrder): string {
  return buildPaymentProofArtifactStorageKey({
    buyer: buyerAddress,
    merchant: order.merchantAddress,
    assetType: order.assetType,
    productId: order.productId,
    orderId: order.orderId,
  });
}

function loadStoredArtifact(key: string): PaymentProofArtifactV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PaymentProofArtifactV1;
    if (parsed?.schemaVersion !== PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredArtifact(key: string, artifact: PaymentProofArtifactV1): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(artifact));
    return true;
  } catch {
    return false;
  }
}

function downloadArtifactJson(artifact: PaymentProofArtifactV1): void {
  const ts = artifact.createdAt.replace(/[:.]/g, '-');
  const fileName = `payment-proof-${artifact.platform.platformLabel.toLowerCase()}-ord-${artifact.order.orderId}-${ts}.json`;
  const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -- Data types --------------------------------------------------------------
interface ActiveOrder {
  merchantAddress: Hex;
  productId: bigint;
  assetType: 0 | 1;
  orderId: bigint;
  amount: bigint;
  rate: bigint;
  deadline: bigint;
  status: number;
  rateVersion: number;
  platformId: Hex;
  platformLabel: string;
}

interface UserData {
  eth: bigint;
  usdtBal: bigint;
  usdcBal: bigint;
  daiBal: bigint;
  usdtDecimals: number;
  usdcDecimals: number;
  daiDecimals: number;
  activeOrders: ActiveOrder[];
}

type ProofActionStatus = 'idle' | 'running' | 'success' | 'error';

interface ProofActionState {
  status: ProofActionStatus;
  logs: string[];
  txHash?: Hex;
  error?: string;
  artifactSaved?: boolean;
}

// -- Data loader -------------------------------------------------------------
async function loadUser(userAddress: Hex): Promise<UserData> {
  const checkedAddress = getAddress(userAddress);

  const fetchBalance = (tokenAddr: Hex) =>
    tokenAddr.length > 2
      ? publicClient.readContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [checkedAddress],
        }).catch(() => 0n)
      : Promise.resolve(0n);

  const fetchDecimals = (tokenAddr: Hex): Promise<number> =>
    tokenAddr.length > 2
      ? publicClient.readContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).then(Number).catch(() => 18)
      : Promise.resolve(18);

  const [eth, usdtBal, usdcBal, daiBal, usdtDecimals, usdcDecimals, daiDecimals] = await Promise.all([
    publicClient.getBalance({ address: checkedAddress }),
    fetchBalance(c2cConfig.usdtAddress),
    fetchBalance(c2cConfig.usdcAddress),
    fetchBalance(c2cConfig.daiAddress),
    fetchDecimals(c2cConfig.usdtAddress),
    fetchDecimals(c2cConfig.usdcAddress),
    fetchDecimals(c2cConfig.daiAddress),
  ]);

  // Check all (merchant × productId × assetType) combinations for active orders
  const activeOrders: ActiveOrder[] = [];
  const combos: Array<{ merchantAddress: Hex; productId: bigint; assetType: 0 | 1 }> = [];
  for (const m of MERCHANT_ADDRESSES as Hex[]) {
    for (const pid of [0n, 1n]) {
      for (const at of [0, 1] as Array<0 | 1>) {
        combos.push({ merchantAddress: m, productId: pid, assetType: at });
      }
    }
  }

  const hasActive = await Promise.all(
    combos.map(({ merchantAddress, productId, assetType }) =>
      publicClient.readContract({
        address: c2cConfig.escrowAddress,
        abi: C2C_ESCROW_ABI,
        functionName: 'hasActiveOrder',
        args: [checkedAddress, merchantAddress, assetType, productId],
      }).catch(() => false),
    ),
  );

  for (let i = 0; i < combos.length; i++) {
    if (!hasActive[i]) continue;

    const { merchantAddress, productId, assetType } = combos[i];
    for (let oid = 0n; oid < 200n; oid++) {
      try {
        const rawOrder = await publicClient.readContract({
          address: c2cConfig.escrowAddress,
          abi: C2C_ESCROW_ABI,
          functionName: 'getOrder',
          args: [merchantAddress, productId, assetType, oid],
        });
        const order = normalizeOrder(rawOrder);
        if (
          getAddress(order.buyer) === checkedAddress &&
          order.status === 0  // V4: only PENDING orders need buyer action
        ) {
          const platformId = await publicClient.readContract({
            address: c2cConfig.escrowAddress,
            abi: C2C_ESCROW_ABI,
            functionName: 'getProductPlatformId',
            args: [merchantAddress, productId, assetType],
          }).then((id) => id as Hex).catch(() => ZERO_HASH_32);

          activeOrders.push({
            merchantAddress,
            productId,
            assetType,
            orderId: oid,
            amount: order.amount,
            rate: order.rate,
            deadline: order.deadline,
            status: order.status,
            rateVersion: order.rateVersion,
            platformId,
            platformLabel: resolvePlatformLabel(platformId),
          });
          break;
        }
      } catch {
        break;
      }
    }
  }

  activeOrders.sort((a, b) => Number(a.deadline - b.deadline));

  return {
    eth: eth as bigint,
    usdtBal: usdtBal as bigint,
    usdcBal: usdcBal as bigint,
    daiBal: daiBal as bigint,
    usdtDecimals,
    usdcDecimals,
    daiDecimals,
    activeOrders,
  };
}

// -- Skeleton loader ---------------------------------------------------------
const shimmerKeyframes = `
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}`;

function SkeletonBlock({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div style={{
      width,
      height,
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
      backgroundSize: '800px 100%',
      animation: 'shimmer 1.4s infinite linear',
      borderRadius: 4,
    }} />
  );
}

function SkeletonTab() {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ width: 72, height: 36, borderRadius: 6, background: '#f0f0f0' }} />
      </div>
      <div style={GRID}>
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} style={GRID_CELL}>
            <SkeletonBlock width={60} height={10} />
            <div style={{ marginTop: 6 }}><SkeletonBlock height={14} /></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        {[1, 2].map((k) => (
          <div key={k} style={{ height: 48, borderRadius: 6, background: '#f0f0f0', marginBottom: 8 }} />
        ))}
      </div>
    </>
  );
}

// -- Copy helper -------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy address'}
      title={copied ? 'Copied!' : 'Copy'}
      style={{
        marginLeft: 6,
        padding: '2px 6px',
        fontSize: 11,
        border: '1px solid #d9d9d9',
        borderRadius: 4,
        cursor: 'pointer',
        background: copied ? '#f6ffed' : '#fff',
        color: copied ? '#52c41a' : '#595959',
        transition: 'all 150ms ease-out',
      }}
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

// -- Status badge ------------------------------------------------------------
function StatusBadge({ status }: { status: number }) {
  const style = STATUS_STYLE[status] ?? { bg: '#f5f5f5', color: '#595959', label: String(status) };
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: 10,
      background: style.bg,
      color: style.color,
      fontSize: 11,
      fontWeight: 600,
      lineHeight: '18px',
    }}>
      {style.label}
    </span>
  );
}

// -- Per-user tab ------------------------------------------------------------
function UserTab({ address }: { address: Hex }) {
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowStates, setRowStates] = useState<Record<string, ProofActionState>>({});
  const [savedArtifacts, setSavedArtifacts] = useState<Record<string, PaymentProofArtifactV1>>({});

  // V4: reputation + claimable bond state
  const [reputation, setReputation]     = useState<ReputationView | null>(null);
  const [userBondBps, setUserBondBps]   = useState<number | null>(null);
  const [userBondBpsError, setUserBondBpsError] = useState<string | null>(null);
  const [claimableBalances, setClaimableBalances] = useState<Record<string, bigint>>({});
  const [claimLoading, setClaimLoading] = useState<Record<string, boolean>>({});

  const checkedAddress = getAddress(address);

  function updateRowState(orderKey: string, updater: (prev: ProofActionState) => ProofActionState) {
    setRowStates((prev) => ({
      ...prev,
      [orderKey]: updater(prev[orderKey] ?? { status: 'idle', logs: [] }),
    }));
  }

  function appendOrderLog(orderKey: string, message: string) {
    updateRowState(orderKey, (prev) => ({
      ...prev,
      status: 'running',
      logs: [...prev.logs, message],
    }));
  }

  function hydrateSavedArtifacts(orders: ActiveOrder[]) {
    const next: Record<string, PaymentProofArtifactV1> = {};
    for (const order of orders) {
      const key = storageKeyForOrder(checkedAddress, order);
      const artifact = loadStoredArtifact(key);
      if (artifact) next[key] = artifact;
    }
    setSavedArtifacts(next);
  }

  async function loadV4Data() {
    const checkedAddr = getAddress(address);
    const rmAddr = c2cConfig.riskManagerAddress;
    const bvAddr = c2cConfig.bondVaultAddress;
    if (!rmAddr || rmAddr.length < 3 || !bvAddr || bvAddr.length < 3) return;

    // Reputation (never reverts)
    try {
      const rep = await publicClient.readContract({
        address: rmAddr,
        abi: C2C_RISK_MANAGER_ABI,
        functionName: 'getReputation',
        args: [checkedAddr],
      }) as ReputationView;
      setReputation(rep);
    } catch { /* silent */ }

    // requiredBondBps (may revert if blacklisted/frozen)
    try {
      const bps = await publicClient.readContract({
        address: rmAddr,
        abi: C2C_RISK_MANAGER_ABI,
        functionName: 'requiredBondBps',
        args: [checkedAddr],
      }) as number;
      setUserBondBps(bps);
      setUserBondBpsError(null);
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? String(err);
      setUserBondBps(null);
      if (msg.includes('UserBlacklisted')) setUserBondBpsError('账户已被列入黑名单，无法下单');
      else if (msg.includes('UserTemporarilyFrozen')) setUserBondBpsError('账户暂时冻结中，请等待解冻');
      else setUserBondBpsError('风险参数查询失败');
    }

    // Claimable balances for USDT / USDC / DAI
    const tokens: Record<string, Hex> = {
      USDT: c2cConfig.usdtAddress,
      USDC: c2cConfig.usdcAddress,
      DAI:  c2cConfig.daiAddress,
    };
    const entries = await Promise.all(
      Object.entries(tokens).map(async ([, tokenAddr]) => {
        if (!tokenAddr || tokenAddr.length < 3) return [tokenAddr, 0n] as [string, bigint];
        const bal = await publicClient.readContract({
          address: bvAddr,
          abi: C2C_BOND_VAULT_ABI,
          functionName: 'claimableBalance',
          args: [checkedAddr, tokenAddr],
        }).catch(() => 0n) as bigint;
        return [tokenAddr, bal] as [string, bigint];
      }),
    );
    setClaimableBalances(Object.fromEntries(entries));
  }

  async function handleClaimBond(tokenAddr: Hex) {
    const walletClient = getUserClientByAddress(getAddress(address));
    if (!walletClient) return;
    setClaimLoading((prev) => ({ ...prev, [tokenAddr]: true }));
    try {
      await claimBond(walletClient, tokenAddr);
      await loadV4Data();
    } catch (e) {
      console.error('[UserPanel] claimBond error', e);
    } finally {
      setClaimLoading((prev) => ({ ...prev, [tokenAddr]: false }));
    }
  }

  async function reload() {
    if (!isC2CConfigured()) return;
    setLoading(true);
    try {
      const loaded = await loadUser(address);
      setData(loaded);
      hydrateSavedArtifacts(loaded.activeOrders);
      await loadV4Data();
    } catch (e) {
      console.error('[UserPanel] load error', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateAndSubmit(order: ActiveOrder) {
    const orderKey = storageKeyForOrder(checkedAddress, order);
    setRowStates((prev) => ({ ...prev, [orderKey]: { status: 'running', logs: [] } }));

    try {
      if (order.assetType !== 0 || order.status !== 0) {
        throw new Error('Only CRYPTO orders in PENDING state can generate buyer payment proof.');
      }

      const walletClient = getUserClientByAddress(checkedAddress);
      if (!walletClient) {
        throw new Error(`No local wallet client found for user ${checkedAddress}.`);
      }

      const isWise = order.platformId === PLATFORM_WISE;
      const isAlipay = order.platformId === PLATFORM_ALIPAY;
      if (!isWise && !isAlipay) {
        throw new Error(`Unsupported platform for buyer proof flow: ${order.platformId}`);
      }

      appendOrderLog(orderKey, 'Building order binding context...');

      let txHash: Hex;
      let artifact: PaymentProofArtifactV1;

      if (isWise) {
        const ctx = await makeWiseCryptoBindingContext(
          order.merchantAddress,
          checkedAddress,
          order.productId,
          order.amount,
          order.orderId,
        );
        const bindingHash = computeOrderBindingHash(ctx);
        appendOrderLog(orderKey, `Binding hash ready: ${bindingHash.slice(0, 12)}...`);
        appendOrderLog(orderKey, 'Launching Wise TLSN plugin...');

        const { contacts, transfer } = await generateWiseCryptoProof(ctx);
        appendOrderLog(orderKey, 'Proofs generated, submitting on-chain...');

        txHash = await submitWiseCryptoProof(
          walletClient,
          order.merchantAddress,
          order.productId,
          order.orderId,
          contacts,
          transfer,
        );

        artifact = {
          schemaVersion: PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
          order: {
            buyer: checkedAddress,
            merchant: order.merchantAddress,
            productId: order.productId.toString(),
            orderId: order.orderId.toString(),
            assetType: order.assetType,
            amount: order.amount.toString(),
            rate: order.rate.toString(),
            rateVersion: order.rateVersion,
            deadline: order.deadline.toString(),
          },
          platform: {
            platformId: order.platformId,
            platformLabel: order.platformLabel,
          },
          orderBindingHash: bindingHash,
          sessionIds: extractSessionIds([contacts, transfer]),
          txHash,
          proofs: {
            type: 'wise',
            contactsProof: contacts,
            transferProof: transfer,
          },
        };
      } else {
        const ctx = await makeAlipayCryptoBindingContext(
          order.merchantAddress,
          checkedAddress,
          order.productId,
          order.amount,
          order.orderId,
        );
        const bindingHash = computeOrderBindingHash(ctx);
        appendOrderLog(orderKey, `Binding hash ready: ${bindingHash.slice(0, 12)}...`);
        appendOrderLog(orderKey, 'Launching Alipay TLSN plugin...');

        const proof = await generateAlipayCryptoProof(ctx);
        appendOrderLog(orderKey, 'Proof generated, submitting on-chain...');

        txHash = await submitAlipayCryptoProof(
          walletClient,
          order.merchantAddress,
          order.productId,
          order.orderId,
          proof,
        );

        artifact = {
          schemaVersion: PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
          order: {
            buyer: checkedAddress,
            merchant: order.merchantAddress,
            productId: order.productId.toString(),
            orderId: order.orderId.toString(),
            assetType: order.assetType,
            amount: order.amount.toString(),
            rate: order.rate.toString(),
            rateVersion: order.rateVersion,
            deadline: order.deadline.toString(),
          },
          platform: {
            platformId: order.platformId,
            platformLabel: order.platformLabel,
          },
          orderBindingHash: bindingHash,
          sessionIds: extractSessionIds([proof]),
          txHash,
          proofs: {
            type: 'alipay',
            proof,
          },
        };
      }

      const saved = saveStoredArtifact(orderKey, artifact);
      setSavedArtifacts((prev) => ({ ...prev, [orderKey]: artifact }));

      appendOrderLog(orderKey, `✅ Submitted: ${txHash}`);
      appendOrderLog(orderKey, saved
        ? 'Proof artifact saved. Use Download Proof JSON to export it.'
        : '⚠ Submitted, but local proof artifact save failed.');

      // Backfill txHash → verifier proof_store (best-effort, see PROOF_AUDIT_PLAN §5.5)
      await backfillTx(artifact.sessionIds, txHash, checkedAddress, (m) =>
        appendOrderLog(orderKey, m),
      );

      updateRowState(orderKey, (prev) => ({
        ...prev,
        status: 'success',
        txHash,
        artifactSaved: saved,
      }));

      setTimeout(() => { reload(); }, 800);
    } catch (err) {
      const msg = formatUserFacingError(err);
      updateRowState(orderKey, (prev) => ({
        ...prev,
        status: 'error',
        error: msg,
        logs: [...prev.logs, `❌ ${msg}`],
      }));
    }
  }

  useEffect(() => {
    setRowStates({});
    setSavedArtifacts({});
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Wall-clock tick used to gate `canGenerate` so an order's "Generate Proof"
  // button disables the moment its on-screen deadline passes — even before
  // the keeper sweep flips status to EXPIRED on-chain. Submitting after the
  // deadline would just revert with OutOfDeadline.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-reload when the count of locally-expired orders increases — the
  // keeper will have swept within `GRACE_PERIOD_SECONDS`, so pulling fresh
  // state shrinks the list and surfaces the timeoutCount update.
  const expiredCount =
    data?.activeOrders.filter((o) => Number(o.deadline) <= nowSec).length ?? 0;
  const lastExpiredCountRef = useRef(0);
  useEffect(() => {
    if (expiredCount > lastExpiredCountRef.current) {
      lastExpiredCountRef.current = expiredCount;
      reload();
    } else if (expiredCount < lastExpiredCountRef.current) {
      // List shrank (sweep landed) — reset the watermark.
      lastExpiredCountRef.current = expiredCount;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredCount]);

  // ── SIWE: lazy-login when this tab becomes active (one user per tab switch).
  //   Skipped when JWT cache already valid (verifierAuth.getCachedJwt handles it).
  //   Failure is non-fatal — audit panel will surface its own 401.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wc = getUserClientByAddress(checkedAddress);
        if (!wc) return;
        await loginAsUser(wc as any);
      } catch (err) {
        if (!cancelled) console.warn('[UserPanel] SIWE login failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [checkedAddress]);

  if (!isC2CConfigured()) {
    return <p style={{ color: '#767676', fontSize: 14 }}>Deploy contracts first.</p>;
  }

  if (loading && !data) return <SkeletonTab />;

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#767676', fontSize: 14 }}>
        <div style={{ marginBottom: 8 }}>No data loaded</div>
        <button
          onClick={reload}
          aria-label='Load user data'
          style={{
            padding: '0 16px',
            minHeight: 36,
            borderRadius: 6,
            border: '1px solid #1677ff',
            cursor: 'pointer',
            background: '#e6f4ff',
            color: '#1677ff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Load
        </button>
      </div>
    );
  }

  const balances = [
    { label: 'ETH', value: fmt4(data.eth, 18) },
    { label: 'USDT', value: fmt4(data.usdtBal, data.usdtDecimals) },
    { label: 'USDC', value: fmt4(data.usdcBal, data.usdcDecimals) },
    { label: 'DAI', value: fmt4(data.daiBal, data.daiDecimals) },
  ];

  return (
    <div>
      <style>{shimmerKeyframes}</style>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={reload}
          disabled={loading}
          aria-label='Refresh user data'
          style={{
            padding: '0 16px',
            minHeight: 36,
            borderRadius: 6,
            border: '1px solid #d9d9d9',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
            background: loading ? '#f5f5f5' : '#fff',
            color: loading ? '#bfbfbf' : '#333',
            opacity: loading ? 0.65 : 1,
            transition: 'all 150ms ease-out',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Address */}
      <div style={{ ...GRID_CELL, marginBottom: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <div style={{ flex: '0 0 auto', ...LABEL, marginBottom: 0, marginRight: 8 }}>Address</div>
        <div style={{ flex: 1, ...VALUE, fontSize: 12 }}>{checkedAddress}</div>
        <CopyButton text={checkedAddress} />
      </div>

      {/* Balances */}
      <div style={GRID}>
        {balances.map(({ label, value }) => (
          <div key={label} style={GRID_CELL}>
            <div style={LABEL}>{label}</div>
            <div style={{ ...VALUE, fontSize: 14, fontWeight: 600, color: '#111' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* V4 Reputation block */}
      {reputation && (
        <div style={{ ...GRID_CELL, marginBottom: 12 }}>
          <div style={{ ...LABEL, marginBottom: 6 }}>声誉 / Reputation</div>
          <ReputationBadge
            reputation={reputation}
            bondBps={userBondBps}
            bondBpsError={userBondBpsError}
          />
          {userBondBpsError && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#cf1322', fontWeight: 600 }}>
              ⚠ 账户受限，无法下单
            </div>
          )}
        </div>
      )}

      {/* V4 Claimable bond block */}
      {(() => {
        const tokenEntries: Array<{ symbol: string; addr: Hex; decimals: number }> = [
          { symbol: 'USDT', addr: c2cConfig.usdtAddress, decimals: 18 },
          { symbol: 'USDC', addr: c2cConfig.usdcAddress, decimals: 6 },
          { symbol: 'DAI',  addr: c2cConfig.daiAddress,  decimals: 18 },
        ];
        const hasAny = tokenEntries.some((t) => (claimableBalances[t.addr] ?? 0n) > 0n);
        if (!hasAny) return null;
        return (
          <div style={{ ...GRID_CELL, marginBottom: 12 }}>
            <div style={{ ...LABEL, marginBottom: 6 }}>可领取保证金 / Claimable Bond</div>
            {tokenEntries.map(({ symbol, addr, decimals }) => {
              const bal = claimableBalances[addr] ?? 0n;
              if (bal === 0n) return null;
              const isLoading = claimLoading[addr] ?? false;
              return (
                <div key={addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>
                    {symbol}: <strong>{parseFloat(formatUnits(bal, decimals)).toFixed(4)}</strong>
                  </span>
                  <button
                    disabled={isLoading}
                    onClick={() => handleClaimBond(addr)}
                    style={{
                      padding: '3px 10px', borderRadius: 4, border: 'none',
                      background: isLoading ? '#d9d9d9' : '#1677ff',
                      color: '#fff', fontSize: 11, fontWeight: 600,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isLoading ? 'Claiming…' : 'Claim'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Active orders */}
      <div>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 8 }}>Active Orders</div>
        {data.activeOrders.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '20px 0',
            color: '#767676',
            fontSize: 13,
            background: '#fafafa',
            borderRadius: 8,
            border: '1px dashed #e8e8e8',
          }}>
            No active orders for this user
          </div>
        ) : data.activeOrders.map((order) => {
          const merchantIdx =
            (MERCHANT_ADDRESSES as string[]).findIndex(
              (m) => m.toLowerCase() === order.merchantAddress.toLowerCase(),
            ) + 1;

          const direction = order.assetType === 0 ? 'Crypto' : 'Fiat';
          const orderKey = storageKeyForOrder(checkedAddress, order);
          const rowState = rowStates[orderKey] ?? { status: 'idle', logs: [] };
          const savedArtifact = savedArtifacts[orderKey];

          const knownPlatform = order.platformId === PLATFORM_WISE || order.platformId === PLATFORM_ALIPAY;
          const isCountdownExpired = Number(order.deadline) <= nowSec;
          const canGenerate =
            order.assetType === 0 &&
            order.status === 0 &&
            knownPlatform &&
            !isCountdownExpired;
          const running = rowState.status === 'running';

          const actionLabel = running
            ? 'Generating...'
            : rowState.status === 'error'
              ? 'Retry Generate Proof'
              : 'Generate Payment Proof';

          return (
            <div
              key={`${order.merchantAddress}-${order.productId}-${order.assetType}-${order.orderId}`}
              style={{
                background: '#fafafa',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 8,
                border: '1px solid #f0f0f0',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  Order #{String(order.orderId)}
                </span>
                <span style={{ fontSize: 12, color: '#595959' }}>
                  {order.platformLabel}-{direction} · M{merchantIdx}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt4(order.amount, data.usdtDecimals)} USDT
                </span>
                <StatusBadge status={order.status} />
                <span style={{ fontSize: 11, color: '#767676', marginLeft: 'auto' }}>
                  Deadline: {new Date(Number(order.deadline) * 1000).toLocaleTimeString()}
                  {' · '}RateV: {order.rateVersion}
                  {isCountdownExpired && order.status === 0 && (
                    <span style={{ color: '#d4380d', marginLeft: 6, fontWeight: 600 }}>
                      · awaiting keeper sweep…
                    </span>
                  )}
                </span>
              </div>

              {(canGenerate || savedArtifact) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {canGenerate && (
                    <button
                      onClick={() => handleGenerateAndSubmit(order)}
                      disabled={running}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: '1px solid #1677ff',
                        background: running ? '#f0f5ff' : '#1677ff',
                        color: running ? '#7aa8ff' : '#fff',
                        cursor: running ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {actionLabel}
                    </button>
                  )}

                  {savedArtifact && (
                    <button
                      onClick={() => downloadArtifactJson(savedArtifact)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        background: '#fff',
                        color: '#333',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      Download Proof JSON
                    </button>
                  )}
                </div>
              )}

              {!knownPlatform && order.assetType === 0 && order.status === 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#cf1322' }}>
                  Unsupported platform for auto proof flow: {order.platformId}
                </div>
              )}

              {rowState.txHash && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#0f766e', fontFamily: 'monospace' }}>
                  tx: {rowState.txHash}
                </div>
              )}

              {rowState.logs.length > 0 && (
                <div style={{
                  marginTop: 8,
                  background: '#1a1a2e',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  lineHeight: 1.6,
                }}>
                  {rowState.logs.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        color: line.startsWith('❌') ? '#ff6b6b' : line.startsWith('✅') ? '#69db7c' : '#c8d6e5',
                      }}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {rowState.error && rowState.status === 'error' && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#cf1322' }}>
                  {rowState.error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Panel shell -------------------------------------------------------------
export function UserPanel() {
  const [tab, setTab] = useState(0);
  const addresses = getDemoUserAddresses();

  if (addresses.length === 0) {
    return (
      <div style={CARD}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>User Panel</h2>
        <p style={{ color: '#767676', fontSize: 14 }}>Deploy contracts first to load user addresses.</p>
      </div>
    );
  }

  const activeTab = Math.min(tab, addresses.length - 1);

  return (
    <div style={CARD}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>User Panel</h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {addresses.map((_, i) => (
          <button
            key={i}
            aria-label={`User ${i + 1}`}
            aria-pressed={activeTab === i}
            style={{
              ...TAB_BASE,
              background: activeTab === i ? '#1677ff' : '#f5f5f5',
              color: activeTab === i ? '#fff' : '#333',
              transition: 'background 150ms ease-out, color 150ms ease-out',
            }}
            onClick={() => setTab(i)}
          >
            User {i + 1}
          </button>
        ))}
      </div>

      <UserTab address={addresses[activeTab]} />

      <div style={{ marginTop: 24 }}>
        <MyProofs activeUserAddr={addresses[activeTab]} />
      </div>
    </div>
  );
}
