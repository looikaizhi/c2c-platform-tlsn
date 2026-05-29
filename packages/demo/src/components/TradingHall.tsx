// packages/demo/src/components/TradingHall.tsx
// Exchange-style advertisement list — shows all registered products from the contract.
// Click a row to open ProductDetailModal with full info, order form, and confirmation.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { parseAbiItem, formatUnits } from 'viem';
import type { Hex } from 'viem';
import {
  getUserPlatformBinding,
  loadBindingPlaintext,
  type BindingView,
  type PlatformBinding,
} from '../utils/services';
import { BindingRow } from './BindingRow';
import {
  publicClient,
  getUserClientByAddress,
  hardhatChain,
  addresses as c2cConfig,
  isConfigured as isC2CConfigured,
  decodeContractError,
} from '../utils/chain';
import { getDemoUserAddresses } from '../utils/chain';
import { C2C_ADMIN_ABI, C2C_ESCROW_ABI, C2C_RISK_MANAGER_ABI, ERC20_ABI } from '../utils/abis';
import { buildProofDebugSnapshot, backfillProofTx } from '../utils/proof';
import { fiatEstimate, formatUserFacingError } from '../utils/lib';
import { tryGetAdapter } from '../utils/platforms';
import {
  placeWiseCryptoOrder,
  placeWiseFiatOrder,
  makeWiseCryptoBindingContext,
  generateWiseCryptoProof,
  submitWiseCryptoProof,
  PLATFORM_WISE,
} from '../utils/wiseC2cActions';
import {
  placeAlipayCryptoOrder,
  placeAlipayFiatOrder,
  makeAlipayCryptoBindingContext,
  generateAlipayCryptoProof,
  submitAlipayCryptoProof,
  PLATFORM_ALIPAY,
} from '../utils/alipayC2cActions';

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction    = 'Crypto' | 'Fiat';
type SortKey      = 'rate' | 'rateVersion' | 'merchantIdx';
type SortDir      = 'asc' | 'desc';
type FilterStatus = '' | 'open' | 'closed';

interface ProductCard {
  merchantIdx:  number;
  merchantAddr: Hex;
  platformId:   Hex;      // bytes32 from getProductPlatformId
  platformName: string;   // human-readable label derived from platformId
  direction:    Direction;
  productId:    bigint;
  assetType:    0 | 1;
  rate:         bigint;
  rateVersion:  number;
  isOpen:       boolean;
  collateral:   bigint;
}

// ─── Design Tokens ───────────────────────────────────────────────────────────

const COLOR = {
  primary:      '#1677ff',
  primaryHover: '#0958d9',
  success:      '#52c41a',
  successBg:    '#f6ffed',
  successBorder:'#b7eb8f',
  danger:       '#ff4d4f',
  dangerBg:     '#fff1f0',
  dangerBorder: '#ffa39e',
  warning:      '#faad14',
  text:         '#1a1a1a',
  textSecondary:'#666',
  textMuted:    '#aaa',
  border:       '#e8e8e8',
  bgPage:       '#f5f7fa',
  bgCard:       '#fff',
  bgRow:        '#fafafa',
  bgRowHover:   '#f0f5ff',
  overlay:      'rgba(0,0,0,0.5)',
  skeleton:     '#f0f0f0',
  skeletonShine:'#e8e8e8',
} as const;

// ─── Shared Styles ────────────────────────────────────────────────────────────

const S = {
  card: {
    background: COLOR.bgCard,
    borderRadius: 12,
    padding: '20px 24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    marginBottom: 24,
  } as React.CSSProperties,

  btn: (color: string, disabled = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '7px 16px',
    minHeight: 36,
    borderRadius: 6,
    border: 'none',
    background: disabled ? '#d9d9d9' : color,
    color: '#fff',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    transition: 'background 0.15s',
    opacity: disabled ? 0.7 : 1,
  }),

  btnOutline: (disabled = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '7px 16px',
    minHeight: 36,
    borderRadius: 6,
    border: `1px solid ${COLOR.border}`,
    background: '#fff',
    color: disabled ? COLOR.textMuted : COLOR.text,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    transition: 'border-color 0.15s',
  }),

  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: COLOR.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  modal: {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 32px',
    width: 540,
    maxHeight: '88vh',
    overflowY: 'auto' as const,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    position: 'relative' as const,
  },

  input: {
    padding: '7px 10px',
    borderRadius: 6,
    border: `1px solid ${COLOR.border}`,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.15s',
  },

  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${COLOR.border}`,
    fontSize: 13,
    background: '#fff',
    cursor: 'pointer',
  },

  label: {
    display: 'block' as const,
    fontSize: 12,
    fontWeight: 600,
    color: COLOR.textSecondary,
    marginBottom: 5,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },

  badge: (open: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    background: open ? COLOR.successBg : COLOR.dangerBg,
    color: open ? COLOR.success : COLOR.danger,
    border: `1px solid ${open ? COLOR.successBorder : COLOR.dangerBorder}`,
    letterSpacing: '0.04em',
  }),

  divider: {
    borderTop: `1px solid ${COLOR.border}`,
    margin: '18px 0',
  } as React.CSSProperties,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvePlatformName(platformId: Hex): string {
  return tryGetAdapter(platformId)?.label ?? `${platformId.slice(0, 10)}…`;
}

function getCurrencyForPlatform(platformId: Hex): string {
  return tryGetAdapter(platformId)?.currency ?? 'FIAT';
}

function rateDisplay(c: ProductCard): string {
  const curr = getCurrencyForPlatform(c.platformId);
  return `${(Number(c.rate) / 1e8).toFixed(3)} ${curr}/USDT`;
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', width: size, height: size }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
      </svg>
    </span>
  );
}

// ─── SkeletonRow ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  const cell = (w: string | number): React.CSSProperties => ({
    height: 14,
    borderRadius: 4,
    background: `linear-gradient(90deg, ${COLOR.skeleton} 25%, ${COLOR.skeletonShine} 50%, ${COLOR.skeleton} 75%)`,
    backgroundSize: '400% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
    width: typeof w === 'number' ? w : w,
  });
  return (
    <tr style={{ borderBottom: `1px solid ${COLOR.border}` }}>
      {[80, 72, 70, 110, 52, 60, 72].map((w, i) => (
        <td key={i} style={{ padding: '14px 12px' }}>
          <div style={cell(w)} />
        </td>
      ))}
    </tr>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  card,
  amount,
  userIndex,
  userAddress,
  onConfirm,
  onCancel,
}: {
  card:     ProductCard;
  amount:   string;
  userIndex: number;
  userAddress: Hex;
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  const curr        = getCurrencyForPlatform(card.platformId);
  const usdtAmt     = parseFloat(amount) || 0;
  const estimate    = fiatEstimate(card.rate, card.assetType, usdtAmt, curr);
  const dirLabel    = card.direction === 'Crypto'
    ? `You pay ${curr} → receive USDT`
    : `You lock USDT → merchant pays ${curr}`;

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ ...S.modal, width: 400 }}>
        <h3 style={{ margin: '0 0 18px', fontSize: 17 }}>Confirm Order</h3>

        <div style={{
          background: COLOR.bgPage,
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 18,
          fontSize: 13,
          lineHeight: 1.8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>Platform</span>
            <strong>{card.platformName}-{card.direction}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>Merchant</span>
            <span style={{ fontFamily: 'monospace' }}>M{card.merchantIdx + 1} ({card.merchantAddr.slice(0, 10)}…)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>User</span>
            <span>User {userIndex + 1} ({userAddress.slice(0, 10)}…)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>Amount</span>
            <strong>{usdtAmt.toFixed(3)} USDT</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>Fiat estimate</span>
            <span style={{ color: COLOR.primary }}>{estimate}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>Direction</span>
            <span style={{ color: COLOR.textSecondary }}>{dirLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: COLOR.textSecondary }}>Rate (v{card.rateVersion})</span>
            <span>{rateDisplay(card)}</span>
          </div>
        </div>

        <p style={{ fontSize: 12, color: COLOR.textSecondary, margin: '0 0 18px' }}>
          This will submit a transaction to the blockchain. Please confirm the details above before proceeding.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.btnOutline()} onClick={onCancel}>Cancel</button>
          <button style={S.btn(COLOR.primary)} onClick={onConfirm}>Confirm Order</button>
        </div>
      </div>
    </div>
  );
}

// ─── ProductDetailModal ───────────────────────────────────────────────────────

function ProductDetailModal({
  card,
  onClose,
}: {
  card:    ProductCard;
  onClose: () => void;
}) {
  const demoUserAddresses = useMemo(() => getDemoUserAddresses(), []);
  const [selectedUserAddress, setSelectedUserAddress] = useState<Hex | ''>(demoUserAddresses[0] ?? '');
  const [amount, setAmount]           = useState('1');
  const [log, setLog]                 = useState<{ msg: string; type: 'info' | 'error' | 'success' }[]>([]);
  const [running, setRunning]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone]               = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState(18);

  // Buyer's binding for THIS product's platform (loaded per user/platform change)
  const [buyerBinding, setBuyerBinding]               = useState<PlatformBinding | null>(null);
  const [buyerBindingLoading, setBuyerBindingLoading] = useState(false);
  const [bindingReloadKey, setBindingReloadKey]       = useState(0);

  // V4 bond estimate state
  const [bondBps, setBondBps]             = useState<number | null>(null);
  const [bondBpsLoading, setBondBpsLoading] = useState(false);
  const [bondBpsError, setBondBpsError]   = useState<string | null>(null);

  useEffect(() => {
    if (demoUserAddresses.length === 0) {
      setSelectedUserAddress('');
      return;
    }
    const exists = !!selectedUserAddress
      && demoUserAddresses.some((a) => a.toLowerCase() === selectedUserAddress.toLowerCase());
    if (!exists) setSelectedUserAddress(demoUserAddresses[0]);
  }, [demoUserAddresses, selectedUserAddress]);

  useEffect(() => {
    if (!c2cConfig.usdtAddress || c2cConfig.usdtAddress.length < 3) return;
    publicClient.readContract({
      address: c2cConfig.usdtAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }).then((d) => setTokenDecimals(Number(d))).catch(() => {});
  }, []);

  // V4: query requiredBondBps when user selection changes (CRYPTO orders only)
  useEffect(() => {
    if (card.direction !== 'Crypto') return;
    if (!selectedUserAddress || !c2cConfig.riskManagerAddress || c2cConfig.riskManagerAddress.length < 3) return;
    setBondBps(null);
    setBondBpsError(null);
    setBondBpsLoading(true);
    publicClient.readContract({
      address: c2cConfig.riskManagerAddress,
      abi: C2C_RISK_MANAGER_ABI,
      functionName: 'requiredBondBps',
      args: [selectedUserAddress as Hex],
    }).then((bps) => {
      setBondBps(Number(bps));
      setBondBpsError(null);
    }).catch((err: unknown) => {
      const msg = (err as any)?.message ?? String(err);
      if (msg.includes('UserBlacklisted')) setBondBpsError('账户已被列入黑名单，无法下单');
      else if (msg.includes('UserTemporarilyFrozen')) setBondBpsError('账户暂时冻结中，请等待解冻');
      else setBondBpsError('风险参数查询失败');
      setBondBps(null);
    }).finally(() => setBondBpsLoading(false));
  }, [selectedUserAddress, card.direction]);

  // Buyer must have a platform binding before placing ANY order (CRYPTO or FIAT).
  // The contract enforces this; we read here to gate the UI button + show the
  // bound name/handle, or expose an inline form when missing.
  useEffect(() => {
    if (!selectedUserAddress) { setBuyerBinding(null); return; }
    setBuyerBindingLoading(true);
    setBuyerBinding(null);
    getUserPlatformBinding(selectedUserAddress as Hex, card.platformId)
      .then((b) => setBuyerBinding(b))
      .catch(() => setBuyerBinding({ nameHash: '0x0' as Hex, idHash: '0x0' as Hex, isSet: false }))
      .finally(() => setBuyerBindingLoading(false));
  }, [selectedUserAddress, card.platformId, bindingReloadKey]);

  const curr     = getCurrencyForPlatform(card.platformId);
  const usdtAmt  = parseFloat(amount) || 0;
  const estimate = fiatEstimate(card.rate, card.assetType, usdtAmt, curr);
  const selectedUserIndex = demoUserAddresses.findIndex(
    (a) => !!selectedUserAddress && a.toLowerCase() === selectedUserAddress.toLowerCase(),
  );

  function addLog(msg: string, type: 'info' | 'error' | 'success' = 'info') {
    setLog((p) => [...p, { msg, type }]);
  }

  function validateForm(): string | null {
    if (demoUserAddresses.length === 0) return 'No demo users found in .env. Deploy contracts first.';
    if (!selectedUserAddress) return 'Please select a valid user.';
    if (!amount || usdtAmt <= 0) return 'Please enter a valid USDT amount.';
    if (!buyerBinding || !buyerBinding.isSet) {
      return `You must set your ${card.platformName} payment account before placing this order.`;
    }
    return null;
  }

  type PrecheckResult =
    | {
        ok: true;
        buyerClient: any;
        buyerAddr: Hex;
        amountBig: bigint;
      }
    | {
        ok: false;
        message: string;
      };

  async function precheckOrder(): Promise<PrecheckResult> {
    if (!selectedUserAddress) {
      return { ok: false, message: 'Please select a user before placing the order.' };
    }

    const buyerClient = getUserClientByAddress(selectedUserAddress);
    if (!buyerClient) {
      return {
        ok: false,
        message: `Selected user ${selectedUserAddress.slice(0, 10)}… has no local signer mapping.`,
      };
    }

    const amountBig = BigInt(Math.floor(usdtAmt * 10 ** tokenDecimals));
    if (amountBig <= 0n) {
      return { ok: false, message: 'Please enter a valid USDT amount.' };
    }

    if (!c2cConfig.usdtAddress || c2cConfig.usdtAddress.length < 3) {
      return { ok: false, message: 'USDT contract address is missing. Re-deploy demo state first.' };
    }

    const [ethBalance, usdtBalance] = await Promise.all([
      publicClient.getBalance({ address: selectedUserAddress }),
      publicClient.readContract({
        address: c2cConfig.usdtAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [selectedUserAddress],
      }) as Promise<bigint>,
    ]);

    if (ethBalance <= 0n) {
      return {
        ok: false,
        message: `Selected user ${selectedUserAddress.slice(0, 10)}… has 0 ETH for gas.`,
      };
    }

    if (usdtBalance < amountBig) {
      return {
        ok: false,
        message: `Insufficient USDT balance. Need ${amountBig.toString()} raw units, have ${usdtBalance.toString()}.`,
      };
    }

    if (card.direction === 'Fiat') {
      const allowance = await publicClient.readContract({
        address: c2cConfig.usdtAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [selectedUserAddress, c2cConfig.escrowAddress],
      }) as bigint;
      if (allowance < amountBig) {
        return {
          ok: false,
          message: `USDT allowance to escrow is too low (${allowance.toString()}). Required: ${amountBig.toString()}.`,
        };
      }
    }

    return {
      ok: true,
      buyerClient,
      buyerAddr: selectedUserAddress,
      amountBig,
    };
  }

  async function handlePlaceOrderClick() {
    const err = validateForm();
    if (err) { addLog(`⚠ ${err}`, 'error'); return; }

    const precheck = await precheckOrder();
    if (!precheck.ok) { addLog(`⚠ ${precheck.message}`, 'error'); return; }

    setShowConfirm(true);
  }

  async function handleConfirmedOrder() {
    setShowConfirm(false);
    setRunning(true);
    let proofDiagnostics: unknown[] = [];
    try {
      const precheck = await precheckOrder();
      if (!precheck.ok) {
        throw new Error(precheck.message);
      }
      const { buyerClient, buyerAddr, amountBig } = precheck;

      addLog(`Placing ${card.platformName}-${card.direction} order…`);

      if (card.platformId === PLATFORM_WISE && card.direction === 'Crypto') {
        addLog('步骤 1/4: 查询保证金比率 (RiskManager.requiredBondBps)…');
        addLog('步骤 2/4: 检查并授权 BondVault (approve if needed)…');
        addLog('步骤 3/4: 提交下单 (placeOrder)…');
        const { orderId, deadline: dl } = await placeWiseCryptoOrder(buyerClient, card.merchantAddr, card.productId, amountBig);
        addLog(`步骤 4/4: 链上确认 — orderId=${orderId}  deadline=${new Date(Number(dl) * 1000).toLocaleTimeString()}`);
        addLog('Building binding context (reads rateVersion from chain)…');
        const ctx = await makeWiseCryptoBindingContext(card.merchantAddr, buyerAddr, card.productId, amountBig, orderId);
        addLog(`rateVersion=${ctx.rateVersion}  rate=${ctx.rate}`);
        addLog('Launching TLSN Wise plugin (contacts + transfer)…');
        const { contacts, transfer } = await generateWiseCryptoProof(ctx);
        proofDiagnostics = await Promise.all([
          buildProofDebugSnapshot(contacts),
          buildProofDebugSnapshot(transfer),
        ]);
        addLog('Proofs generated, submitting to contract…');
        const txHash = await submitWiseCryptoProof(buyerClient, card.merchantAddr, card.productId, orderId, contacts, transfer);
        addLog(`Transaction confirmed — tx=${txHash}`, 'success');
        {
          const r = await backfillProofTx([contacts, transfer], txHash, buyerAddr, hardhatChain.id);
          const total = r.patched + r.alreadyCommitted + r.failed;
          if (r.failed) addLog(`⚠ ${r.failed}/${total} 链上回填失败(不影响留存): ${r.failures.join('; ')}`);
          else addLog(`链上回填完成 (${total} session)`);
        }
        setDone(true);

      } else if (card.platformId === PLATFORM_WISE && card.direction === 'Fiat') {
        if (!buyerBinding?.isSet) throw new Error('Buyer binding not set — UI gate bypassed.');
        const { orderId } = await placeWiseFiatOrder(
          buyerClient, card.merchantAddr, card.productId, amountBig,
          buyerBinding.nameHash, buyerBinding.idHash,
        );
        addLog(`Order placed — orderId=${orderId}  USDT locked.`);
        addLog('Merchant must now pay MYR and submit Wise proof (see Merchant Panel).', 'success');
        setDone(true);

      } else if (card.platformId === PLATFORM_ALIPAY && card.direction === 'Crypto') {
        addLog('步骤 1/4: 查询保证金比率 (RiskManager.requiredBondBps)…');
        addLog('步骤 2/4: 检查并授权 BondVault (approve if needed)…');
        addLog('步骤 3/4: 提交下单 (placeOrder)…');
        const { orderId } = await placeAlipayCryptoOrder(buyerClient, card.merchantAddr, card.productId, amountBig);
        addLog(`步骤 4/4: 链上确认 — orderId=${orderId}`);
        const ctx = await makeAlipayCryptoBindingContext(card.merchantAddr, buyerAddr, card.productId, amountBig, orderId);
        addLog(`rateVersion=${ctx.rateVersion}  rate=${ctx.rate}`);
        addLog('Launching TLSN Alipay plugin…');
        const proof = await generateAlipayCryptoProof(ctx);
        proofDiagnostics = [await buildProofDebugSnapshot(proof)];
        addLog('Proof generated, submitting to contract…');
        const txHash = await submitAlipayCryptoProof(buyerClient, card.merchantAddr, card.productId, orderId, proof);
        addLog(`Transaction confirmed — tx=${txHash}`, 'success');
        {
          const r = await backfillProofTx([proof], txHash, buyerAddr, hardhatChain.id);
          const total = r.patched + r.alreadyCommitted + r.failed;
          if (r.failed) addLog(`⚠ ${r.failed}/${total} 链上回填失败(不影响留存): ${r.failures.join('; ')}`);
          else addLog(`链上回填完成 (${total} session)`);
        }
        setDone(true);

      } else if (card.platformId === PLATFORM_ALIPAY && card.direction === 'Fiat') {
        if (!buyerBinding?.isSet) throw new Error('Buyer binding not set — UI gate bypassed.');
        const { orderId } = await placeAlipayFiatOrder(
          buyerClient, card.merchantAddr, card.productId, amountBig,
          buyerBinding.nameHash, buyerBinding.idHash,
        );
        addLog(`Order placed — orderId=${orderId}  USDT locked.`);
        addLog('Merchant must now pay CNY and submit Alipay proof (see Merchant Panel).', 'success');
        setDone(true);

      } else {
        addLog(`Unsupported platform: ${card.platformName} (${card.platformId})`, 'error');
      }
    } catch (err: unknown) {
      if (proofDiagnostics.length > 0) {
        for (let i = 0; i < proofDiagnostics.length; i += 1) {
          addLog(`Proof#${i + 1} diagnostics: ${JSON.stringify(proofDiagnostics[i])}`, 'info');
        }
      }
      const decoded = decodeContractError(err);
      if (decoded) {
        addLog(
          `Contract revert decoded: ${decoded.errorName ?? 'UnknownCustomError'} (${decoded.selector})`,
          'error',
        );
      }
      const msg = formatUserFacingError(err);
      addLog(`Error: ${msg}`, 'error');
      if (card.direction === 'Crypto') {
        addLog('If auto-submission failed, open UserPanel → Active Orders and use "Generate Payment Proof" to retry.', 'info');
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
        <div style={S.modal}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>
                {card.platformName}
                <span style={{ color: COLOR.textSecondary, fontWeight: 400, fontSize: 14, marginLeft: 6 }}>
                  {card.direction === 'Crypto' ? 'Buy USDT' : 'Sell USDT'}
                </span>
              </h3>
              <span style={S.badge(card.isOpen)}>{card.isOpen ? '● OPEN' : '● CLOSED'}</span>
            </div>
            {!running && (
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: COLOR.textMuted, lineHeight: 1, padding: 4 }}
                aria-label="Close"
              >×</button>
            )}
          </div>

          {/* Section 1: Product Info */}
          <div style={{ background: COLOR.bgPage, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              Product Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
              <div>
                <div style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 2 }}>Merchant</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12 }}>M{card.merchantIdx + 1} — {card.merchantAddr.slice(0, 16)}…</div>
              </div>
              <div>
                <div style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 2 }}>Rate</div>
                <div style={{ fontWeight: 600, color: COLOR.primary }}>{rateDisplay(card)}</div>
              </div>
              <div>
                <div style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 2 }}>Rate Version</div>
                <div>v{card.rateVersion}</div>
              </div>
              <div>
                <div style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 2 }}>Direction</div>
                <div>{card.direction === 'Crypto'
                  ? `Pay ${curr} → Receive USDT`
                  : `Lock USDT → Receive ${curr}`
                }</div>
              </div>
              <div>
                <div style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 2 }}>Product ID</div>
                <div style={{ fontFamily: 'monospace' }}>{card.productId.toString()}</div>
              </div>
              <div>
                <div style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 2 }}>Asset Type</div>
                <div>{card.assetType === 0 ? 'Crypto (0)' : 'Fiat (1)'}</div>
              </div>
            </div>
          </div>

          <div style={S.divider} />

          {/* Section 2: Order Form */}
          <div style={{ fontSize: 11, fontWeight: 700, color: COLOR.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
            Place Order
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={S.label}>Acting as user</label>
              <select
                value={selectedUserAddress}
                onChange={(e) => setSelectedUserAddress(e.target.value as Hex)}
                style={{ ...S.select, width: '100%' }}
                disabled={running}
              >
                {demoUserAddresses.length === 0
                  ? <option value="">No users available</option>
                  : demoUserAddresses.map((a, i) => (
                      <option key={a} value={a}>User {i + 1} ({a.slice(0, 10)}…)</option>
                    ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Amount (USDT)</label>
              <input
                type="number" min="0.001" step="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={S.input}
                disabled={running}
              />
              {usdtAmt > 0 && (
                <div style={{ fontSize: 11, color: COLOR.primary, marginTop: 4 }}>{estimate}</div>
              )}
              {/* V4 bond estimate (CRYPTO orders only) */}
              {card.direction === 'Crypto' && (
                <div style={{ marginTop: 6 }}>
                  {bondBpsLoading && (
                    <div style={{ fontSize: 11, color: COLOR.textMuted }}>
                      <Spinner size={10} /> 查询保证金比率中…
                    </div>
                  )}
                  {!bondBpsLoading && bondBpsError && (
                    <div style={{ fontSize: 11, color: COLOR.danger }}>⚠ {bondBpsError}</div>
                  )}
                  {!bondBpsLoading && !bondBpsError && bondBps != null && usdtAmt > 0 && (
                    <div style={{ fontSize: 11, color: '#d46b08' }}>
                      预计保证金：{formatUnits(BigInt(Math.floor(usdtAmt * 10 ** tokenDecimals)) * BigInt(bondBps) / 10000n, tokenDecimals)} USDT（{(bondBps / 100).toFixed(1)}%）
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Buyer payment binding panel — required for BOTH directions by the contract */}
          {(() => {
            const buyerClient = selectedUserAddress ? getUserClientByAddress(selectedUserAddress) : null;
            if (!selectedUserAddress) return null;
            if (buyerBindingLoading) {
              return (
                <div style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <Spinner size={12} />
                  Checking your {card.platformName} binding…
                </div>
              );
            }
            if (buyerBinding?.isSet) {
              const pt = loadBindingPlaintext(selectedUserAddress as Hex, card.platformId);
              return (
                <div style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}>
                  <span aria-hidden style={{
                    flexShrink: 0,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#15803d', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, marginTop: 1,
                  }}>✓</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', lineHeight: 1.4 }}>
                      Using your bound {card.platformName} account
                    </div>
                    {pt ? (
                      <div style={{ fontSize: 13, color: '#166534', marginTop: 4, lineHeight: 1.5 }}>
                        {pt.name}
                        <span style={{ color: '#86efac', margin: '0 6px' }}>·</span>
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {pt.handle}
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4, fontStyle: 'italic', lineHeight: 1.5 }}>
                        Plaintext not cached in this browser — on-chain hash will still be used.
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            // Not set → render inline BindingRow in compact mode
            const view: BindingView = {
              ...(buyerBinding ?? { nameHash: '0x0' as Hex, idHash: '0x0' as Hex, isSet: false }),
              platformId:    card.platformId,
              platformLabel: card.platformName,
              plaintext:     null,
            };
            return (
              <div style={{
                marginBottom: 16,
                padding: 14,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 10,
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#92400e',
                  marginBottom: 4,
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span aria-hidden>⚠</span>
                  {card.platformName} account not set
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#a16207',
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}>
                  Bind your {card.platformName} account on-chain (hashed) before placing this order — required by the contract.
                </div>
                <BindingRow
                  binding={view}
                  walletClient={buyerClient ?? undefined}
                  onChange={() => setBindingReloadKey((k) => k + 1)}
                  defaultOpen
                  compact
                />
              </div>
            );
          })()}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: log.length > 0 ? 16 : 0 }}>
              <button
                style={S.btn(
                  COLOR.primary,
                  running || !card.isOpen || demoUserAddresses.length === 0 || !!bondBpsError
                    || !buyerBinding?.isSet || buyerBindingLoading,
                )}
                disabled={
                  running || !card.isOpen || demoUserAddresses.length === 0 || !!bondBpsError
                  || !buyerBinding?.isSet || buyerBindingLoading
                }
                onClick={handlePlaceOrderClick}
              >
                {running ? <><Spinner />Processing…</> : 'Place Order'}
              </button>
            {!card.isOpen && (
              <span style={{ fontSize: 12, color: COLOR.danger }}>Merchant is currently closed</span>
            )}
            {done && (
              <button style={S.btnOutline()} onClick={onClose}>Close</button>
            )}
          </div>

          {/* Execution Log */}
          {log.length > 0 && (
            <div style={{
              background: '#1a1a2e',
              borderRadius: 8,
              padding: '12px 14px',
              fontFamily: 'monospace',
              fontSize: 12,
              maxHeight: 180,
              overflowY: 'auto',
              lineHeight: 1.7,
            }}>
              {log.map((entry, i) => (
                <div key={i} style={{ color: entry.type === 'error' ? '#ff6b6b' : entry.type === 'success' ? '#69db7c' : '#c8d6e5' }}>
                  <span style={{ color: '#546e7a', marginRight: 8 }}>{String(i + 1).padStart(2, '0')}</span>
                  {entry.msg}
                </div>
              ))}
              {running && (
                <div style={{ color: '#546e7a', marginTop: 4 }}>
                  <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation overlay (stacked above modal) */}
      {showConfirm && (
        <ConfirmDialog
          card={card}
          amount={amount}
          userIndex={selectedUserIndex >= 0 ? selectedUserIndex : 0}
          userAddress={selectedUserAddress || (demoUserAddresses[0] as Hex)}
          onConfirm={handleConfirmedOrder}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ─── SortIcon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10, verticalAlign: 'middle' }}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );
}

// ─── TradingHall ──────────────────────────────────────────────────────────────

export function TradingHall() {
  const [cards, setCards]               = useState<ProductCard[]>([]);
  const [loading, setLoading]           = useState(false);
  const [filterPlatform, setFilterP]    = useState('');
  const [filterDir, setFilterDir]       = useState<'' | Direction>('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('');
  const [sortKey, setSortKey]           = useState<SortKey>('merchantIdx');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');
  const [selectedCard, setSelectedCard] = useState<ProductCard | null>(null);
  const [hoveredRow, setHoveredRow]     = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!isC2CConfigured()) return;
    setLoading(true);
    try {
      // ── Phase 1: Discover all registered merchants from contract events ──
      const merchantLogs = await publicClient.getLogs({
        address: c2cConfig.adminAddress,
        event: parseAbiItem('event MerchantRegistered(address indexed merchant, uint256 registeredAt)'),
        fromBlock: 0n,
        toBlock: 'latest',
      });
      const merchantAddresses = [
        ...new Map(
          merchantLogs.map((l) => [(l.args as any).merchant as string, (l.args as any).merchant as Hex])
        ).values(),
      ];

      if (merchantAddresses.length === 0) {
        setCards([]);
        return;
      }

      // ── Phase 2: Discover all listed products from contract events ──
      const productLogs = await publicClient.getLogs({
        address: c2cConfig.escrowAddress,
        event: parseAbiItem('event ProductListed(address indexed merchant, uint256 indexed productId, uint8 indexed assetType, uint256 cryptoID, uint256 fiatID, uint256 collateralAmount, bool isActive)'),
        fromBlock: 0n,
        toBlock: 'latest',
      });

      // Deduplicate by (merchant, productId, assetType) — keep the latest listing
      const merchantSet = new Set(merchantAddresses.map((a) => a.toLowerCase()));
      const tupleMap = new Map<string, typeof productLogs[0]>();
      for (const log of productLogs) {
        const args = log.args as any;
        const merchant = (args.merchant as string).toLowerCase();
        if (!merchantSet.has(merchant)) continue;
        const key = `${merchant}-${args.productId}-${args.assetType}`;
        tupleMap.set(key, log);
      }

      // ── Phase 3: Enrich each (merchant, productId, assetType) tuple ──
      const newCards: ProductCard[] = [];
      await Promise.all(
        [...tupleMap.values()].map(async (log) => {
          const args        = log.args as any;
          const merchantAddr = args.merchant as Hex;
          const productId   = args.productId as bigint;
          const assetType   = args.assetType as 0 | 1;
          const merchantIdx = merchantAddresses.findIndex(
            (a) => a.toLowerCase() === merchantAddr.toLowerCase()
          );

          try {
            const [rateInfo, isOpen, platformId] = await Promise.all([
              publicClient.readContract({
                address: c2cConfig.adminAddress,
                abi: C2C_ADMIN_ABI,
                functionName: 'getMerchantRate',
                args: [merchantAddr, productId, assetType],
              }).then((r: any) => r),
              publicClient.readContract({
                address: c2cConfig.adminAddress,
                abi: C2C_ADMIN_ABI,
                functionName: 'isMerchantOpen',
                args: [merchantAddr, productId, assetType],
              }),
              publicClient.readContract({
                address: c2cConfig.escrowAddress,
                abi: C2C_ESCROW_ABI,
                functionName: 'getProductPlatformId',
                args: [merchantAddr, productId, assetType],
              }),
            ]);

            const rate: bigint        = rateInfo?.rate    ?? 0n;
            const rateVersion: number = rateInfo?.version ?? 0;

            // Skip products not yet priced (unregistered in rate table)
            if (rate === 0n && rateVersion === 0) return;

            newCards.push({
              merchantIdx,
              merchantAddr,
              platformId:   platformId as Hex,
              platformName: resolvePlatformName(platformId as Hex),
              direction:    assetType === 0 ? 'Crypto' : 'Fiat',
              productId,
              assetType,
              rate,
              rateVersion,
              isOpen: isOpen as boolean,
              collateral: 0n,
            });
          } catch {
            // Product enrichment failed — skip silently
          }
        })
      );

      // Sort by merchantIdx then productId for stable initial order
      newCards.sort((a, b) =>
        a.merchantIdx !== b.merchantIdx
          ? a.merchantIdx - b.merchantIdx
          : Number(a.productId - b.productId)
      );
      setCards(newCards);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  // ── Derive available platform names for filter dropdown ──
  const availablePlatforms = [...new Set(cards.map((c) => c.platformName))].sort();

  // ── Filter ──
  const filtered = cards.filter((c) => {
    if (filterPlatform && c.platformName !== filterPlatform) return false;
    if (filterDir && c.direction !== filterDir) return false;
    if (filterStatus === 'open' && !c.isOpen) return false;
    if (filterStatus === 'closed' && c.isOpen) return false;
    return true;
  });

  // ── Sort ──
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    let v = 0;
    if (sortKey === 'rate') {
      v = Number(a.rate - b.rate);
    } else if (sortKey === 'rateVersion') {
      v = a.rateVersion - b.rateVersion;
    } else {
      v = a.merchantIdx - b.merchantIdx;
    }
    return sortDir === 'asc' ? v : -v;
  });

  const thStyle = (key?: SortKey): React.CSSProperties => ({
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    color: COLOR.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    cursor: key ? 'pointer' : 'default',
    userSelect: 'none',
    borderBottom: `2px solid ${COLOR.border}`,
    background: COLOR.bgPage,
  });

  const tdStyle: React.CSSProperties = {
    padding: '13px 12px',
    fontSize: 13,
    borderBottom: `1px solid ${COLOR.border}`,
    verticalAlign: 'middle',
  };

  return (
    <>
      {/* Global animation keyframes */}
      <style>{`
        @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
      `}</style>

      <div style={S.card}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Trading Hall</h2>
            {!loading && cards.length > 0 && (
              <div style={{ fontSize: 12, color: COLOR.textMuted, marginTop: 3 }}>
                {sorted.length} of {cards.length} products shown
              </div>
            )}
          </div>

          {/* ── Filter Bar ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={filterPlatform}
              onChange={(e) => setFilterP(e.target.value)}
              style={S.select}
            >
              <option value="">All platforms</option>
              {availablePlatforms.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              value={filterDir}
              onChange={(e) => setFilterDir(e.target.value as '' | Direction)}
              style={S.select}
            >
              <option value="">All directions</option>
              <option value="Crypto">Crypto (buy USDT)</option>
              <option value="Fiat">Fiat (sell USDT)</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              style={S.select}
            >
              <option value="">All status</option>
              <option value="open">Open only</option>
              <option value="closed">Closed only</option>
            </select>

            <button
              onClick={loadCards}
              disabled={loading}
              style={{
                ...S.btnOutline(loading),
                minHeight: 33,
                padding: '5px 14px',
              }}
            >
              {loading ? <><Spinner size={12} /> Loading…</> : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {!isC2CConfigured() ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: COLOR.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Contracts not deployed</div>
            <div style={{ fontSize: 13 }}>Deploy contracts first using the Deploy Panel above.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', animation: 'fadeIn 0.2s ease' }}>
              <thead>
                <tr>
                  <th style={thStyle()}>Platform</th>
                  <th style={thStyle()}>Direction</th>
                  <th
                    style={thStyle('merchantIdx')}
                    onClick={() => handleSort('merchantIdx')}
                  >
                    Merchant
                    <SortIcon active={sortKey === 'merchantIdx'} dir={sortDir} />
                  </th>
                  <th
                    style={thStyle('rate')}
                    onClick={() => handleSort('rate')}
                  >
                    Rate
                    <SortIcon active={sortKey === 'rate'} dir={sortDir} />
                  </th>
                  <th
                    style={thStyle('rateVersion')}
                    onClick={() => handleSort('rateVersion')}
                  >
                    Version
                    <SortIcon active={sortKey === 'rateVersion'} dir={sortDir} />
                  </th>
                  <th style={thStyle()}>Status</th>
                  <th style={{ ...thStyle(), textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '52px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.textSecondary, marginBottom: 6 }}>
                        No products found
                      </div>
                      <div style={{ fontSize: 13, color: COLOR.textMuted, marginBottom: 16 }}>
                        {cards.length === 0
                          ? 'No products have been registered in the contract yet.'
                          : 'No products match the current filters.'}
                      </div>
                      <button
                        onClick={loadCards}
                        style={{ ...S.btn(COLOR.primary), margin: '0 auto' }}
                      >
                        Refresh
                      </button>
                    </td>
                  </tr>
                ) : (
                  sorted.map((c) => {
                    const rowKey  = `${c.merchantIdx}-${c.platformId}-${c.productId}-${c.assetType}`;
                    const isHovered = hoveredRow === rowKey;
                    return (
                      <tr
                        key={rowKey}
                        onClick={() => c.isOpen && setSelectedCard(c)}
                        onMouseEnter={() => setHoveredRow(rowKey)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          cursor: c.isOpen ? 'pointer' : 'default',
                          background: isHovered && c.isOpen ? COLOR.bgRowHover : 'transparent',
                          transition: 'background 0.12s',
                          opacity: c.isOpen ? 1 : 0.55,
                        }}
                      >
                        {/* Platform */}
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 600,
                            fontSize: 13,
                          }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: '50%',
                              background: c.platformId === PLATFORM_WISE ? '#9de0fb' : '#1677ff',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 800, color: '#fff',
                              flexShrink: 0,
                            }}>
                              {c.platformName.charAt(0).toUpperCase()}
                            </span>
                            {c.platformName}
                          </span>
                        </td>

                        {/* Direction */}
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: c.direction === 'Crypto' ? '#e6f4ff' : '#fff7e6',
                            color: c.direction === 'Crypto' ? '#0958d9' : '#d46b08',
                          }}>
                            {c.direction === 'Crypto' ? '↑ Buy USDT' : '↓ Sell USDT'}
                          </span>
                        </td>

                        {/* Merchant */}
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>M{c.merchantIdx + 1}</div>
                          <div style={{ fontSize: 11, color: COLOR.textMuted, fontFamily: 'monospace' }}>
                            {c.merchantAddr.slice(0, 14)}…
                          </div>
                        </td>

                        {/* Rate */}
                        <td style={{ ...tdStyle, fontWeight: 700, color: COLOR.primary, fontFamily: 'monospace' }}>
                          {rateDisplay(c)}
                        </td>

                        {/* Version */}
                        <td style={{ ...tdStyle, color: COLOR.textSecondary }}>
                          v{c.rateVersion}
                        </td>

                        {/* Status */}
                        <td style={tdStyle}>
                          <span style={S.badge(c.isOpen)}>
                            {c.isOpen ? '● OPEN' : '● CLOSED'}
                          </span>
                        </td>

                        {/* Action */}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            style={S.btn(c.isOpen ? COLOR.primary : '#d9d9d9', !c.isOpen)}
                            disabled={!c.isOpen}
                            onClick={(e) => { e.stopPropagation(); if (c.isOpen) setSelectedCard(c); }}
                          >
                            Trade →
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedCard && (
        <ProductDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </>
  );
}
