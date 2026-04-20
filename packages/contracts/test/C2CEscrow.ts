/**
 * C2CEscrow.ts
 *
 * Full test suite for C2CEscrow contract.
 * Covers: ESC-FLOW-01~16, ESC-ERR-01~30, ESC-ATT-01~16, ESC-TAMPER-01~13
 *
 * Note:
 * - This suite intentionally asserts current on-chain behavior where it differs from
 *   legacy spec wording (e.g. ESC-ERR-19, ESC-ERR-30, ESC-ATT-03).
 */

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, toBytes, type Address, type Hex } from "viem";

import { deployAll, type DeployResult } from "./helpers/deploy.js";
import {
  addRecord,
  clearRecords,
  makeCtx,
  printTable,
} from "./helpers/tableReporter.js";
import { advanceTime } from "./helpers/time.js";
import { computeOrderBindingHash } from "./helpers/orderBindingHash.js";
import {
  buildAlipayProof,
  buildWiseContactsProof,
  buildWiseTransferProof,
  nextSession,
  toAlipayGmtSuccess,
  type TLSNProof,
} from "./helpers/proofBuilder.js";
import {
  ALIPAY_AMOUNT_STR,
  ALIPAY_SERVER,
  BUYER_HANDLE,
  BUYER_NAME,
  COLLATERAL,
  CNY_FIAT_ID,
  CNY_NAME,
  MYR_FIAT_ID,
  MYR_NAME,
  ORDER_TIMEOUT,
  RATE_ALIPAY_CRYPTO,
  RATE_ALIPAY_FIAT,
  RATE_WISE_CRYPTO,
  RATE_WISE_FIAT,
  TRADE_AMOUNT,
  USDT_CRYPTO_ID,
  WISE_AMOUNT_STR,
  WISE_MERCHANT_HANDLE,
  WISE_MERCHANT_NAME,
  WISE_SERVER,
  ZERO_HASH,
} from "./helpers/constants.js";

const CHAIN_ID = 31337n;
const ASSET_CRYPTO = 0;
const ASSET_FIAT = 1;

const STATUS_PENDING = 0;
const STATUS_WAITING = 4;

const WISE_CRYPTO_PID = 0n;
const WISE_FIAT_PID = 0n;
const ALIPAY_CRYPTO_PID = 1n;
const ALIPAY_FIAT_PID = 1n;

const MAX_UINT = (2n ** 256n) - 1n;

const MERCHANT_NAME_HASH = keccak256(toBytes(WISE_MERCHANT_NAME));
const MERCHANT_ID_HASH = keccak256(toBytes(WISE_MERCHANT_HANDLE));
const BUYER_NAME_HASH = keccak256(toBytes(BUYER_NAME));
const BUYER_ID_HASH = keccak256(toBytes(BUYER_HANDLE));

const ALT_MERCHANT_NAME_HASH = keccak256(toBytes("ALT-WISE-MERCHANT"));
const ALT_MERCHANT_ID_HASH = keccak256(toBytes("@alt-wise-merchant"));
const ATTACKER_NAME_HASH = keccak256(toBytes("ATTACKER-NAME"));
const ATTACKER_ID_HASH = keccak256(toBytes("attacker@example.com"));

const NULL_BUYER_INFO = {
  nameHash: ZERO_HASH,
  idHash: ZERO_HASH,
  isSet: false,
} as const;

const BUYER_INFO = {
  nameHash: BUYER_NAME_HASH,
  idHash: BUYER_ID_HASH,
  isSet: true,
} as const;

let _wiseTransferId = 900_000_000n;
let _alipayOrderCounter = 0;
function nextWiseTransferId(): bigint {
  _wiseTransferId += 1n;
  return _wiseTransferId;
}
function nextAlipayOrderId(prefix: string): string {
  _alipayOrderCounter += 1;
  return `${prefix}-${Date.now()}-${_alipayOrderCounter}`;
}

function calcFiatX1000(amount: bigint, rate: bigint, assetType: number): bigint {
  if (assetType === ASSET_CRYPTO) {
    return (amount * rate) / (10n ** 33n);
  }
  return (amount * rate * 10n) / (10n ** 18n);
}

function toAmountX1000String(v: bigint): string {
  const intPart = v / 1000n;
  const fracPart = (v % 1000n).toString().padStart(3, "0");
  return `${intPart}.${fracPart}`;
}

async function nowTs(pc: any): Promise<bigint> {
  return (await pc.getBlock()).timestamp;
}

async function expectRevert(
  promise: Promise<unknown>,
  expected?: string | RegExp,
) {
  try {
    await promise;
    assert.fail("Expected transaction to revert");
  } catch (err: any) {
    if (expected === undefined) return;
    const re = typeof expected === "string" ? new RegExp(expected) : expected;
    const text = [
      err?.message,
      err?.shortMessage,
      err?.details,
      String(err),
    ].filter(Boolean).join("\n");
    assert.match(text, re);
  }
}

async function escrowAs(viem: any, d: DeployResult, wallet: any) {
  return viem.getContractAt("C2CEscrow", d.c2cEscrow.address, {
    client: { wallet },
  });
}

async function adminAs(viem: any, d: DeployResult, wallet: any) {
  return viem.getContractAt("C2CAdmin", d.c2cAdmin.address, {
    client: { wallet },
  });
}

async function usdtAs(viem: any, d: DeployResult, wallet: any) {
  return viem.getContractAt("MockERC20", d.usdt.address, {
    client: { wallet },
  });
}

async function fundAndApproveBuyer(viem: any, d: DeployResult, wallet: any, amount = 5_000n * 10n ** 18n) {
  await d.usdt.write.mint([wallet.account.address, amount]);
  const token = await usdtAs(viem, d, wallet);
  await token.write.approve([d.c2cEscrow.address, MAX_UINT]);
}

async function setupBase(viem: any) {
  const d = await deployAll(viem);
  const pc = await viem.getPublicClient();
  const PLATFORM_WISE: Hex = await d.tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY: Hex = await d.tlsnVerifier.read.PLATFORM_ALIPAY();

  await d.c2cAdmin.write.registerMerchantByAdmin([d.merchant.account.address]);
  await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
    PLATFORM_WISE,
    MERCHANT_NAME_HASH,
    MERCHANT_ID_HASH,
  ]);
  await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
    PLATFORM_ALIPAY,
    MERCHANT_NAME_HASH,
    MERCHANT_ID_HASH,
  ]);

  await d.usdtAsMerchant.write.approve([d.c2cEscrow.address, MAX_UINT]);
  await d.usdtAsBuyer.write.approve([d.c2cEscrow.address, MAX_UINT]);

  // Wise products: CRYPTO pid=0, FIAT pid=0
  await d.escrowAsMerchant.write.listCryptoProduct([
    USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
  ]);
  await d.escrowAsMerchant.write.listFiatProduct([
    MYR_FIAT_ID, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_WISE,
  ]);

  // Alipay products: CRYPTO pid=1, FIAT pid=1
  await d.escrowAsMerchant.write.listCryptoProduct([
    USDT_CRYPTO_ID, CNY_FIAT_ID, COLLATERAL, true, PLATFORM_ALIPAY,
  ]);
  await d.escrowAsMerchant.write.listFiatProduct([
    CNY_FIAT_ID, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_ALIPAY,
  ]);

  const expiry = (await pc.getBlock()).timestamp + 365n * 24n * 3600n;
  await d.adminAsMerchant.write.publishRate([WISE_CRYPTO_PID, ASSET_CRYPTO, RATE_WISE_CRYPTO, expiry]);
  await d.adminAsMerchant.write.publishRate([WISE_FIAT_PID, ASSET_FIAT, RATE_WISE_FIAT, expiry]);
  await d.adminAsMerchant.write.publishRate([ALIPAY_CRYPTO_PID, ASSET_CRYPTO, RATE_ALIPAY_CRYPTO, expiry]);
  await d.adminAsMerchant.write.publishRate([ALIPAY_FIAT_PID, ASSET_FIAT, RATE_ALIPAY_FIAT, expiry]);

  await d.adminAsMerchant.write.openNow([WISE_CRYPTO_PID, ASSET_CRYPTO]);
  await d.adminAsMerchant.write.openNow([WISE_FIAT_PID, ASSET_FIAT]);
  await d.adminAsMerchant.write.openNow([ALIPAY_CRYPTO_PID, ASSET_CRYPTO]);
  await d.adminAsMerchant.write.openNow([ALIPAY_FIAT_PID, ASSET_FIAT]);

  return { d, pc, PLATFORM_WISE, PLATFORM_ALIPAY };
}

async function placeCryptoOrder(
  viem: any,
  d: DeployResult,
  p: {
    buyerWallet?: any;
    merchant?: Address;
    productId?: bigint;
    amount?: bigint;
  } = {},
) {
  const buyerWallet = p.buyerWallet ?? d.buyer;
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? WISE_CRYPTO_PID;
  const amount = p.amount ?? TRADE_AMOUNT;
  const esc =
    buyerWallet.account.address.toLowerCase() === d.buyer.account.address.toLowerCase()
      ? d.escrowAsBuyer
      : await escrowAs(viem, d, buyerWallet);
  return esc.write.placeOrder([merchant, productId, ASSET_CRYPTO, amount, NULL_BUYER_INFO]);
}

async function placeFiatOrder(
  viem: any,
  d: DeployResult,
  p: {
    buyerWallet?: any;
    merchant?: Address;
    productId?: bigint;
    amount?: bigint;
    buyerInfo?: { nameHash: Hex; idHash: Hex; isSet: boolean };
  } = {},
) {
  const buyerWallet = p.buyerWallet ?? d.buyer;
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? WISE_FIAT_PID;
  const amount = p.amount ?? TRADE_AMOUNT;
  const buyerInfo = p.buyerInfo ?? BUYER_INFO;
  const esc =
    buyerWallet.account.address.toLowerCase() === d.buyer.account.address.toLowerCase()
      ? d.escrowAsBuyer
      : await escrowAs(viem, d, buyerWallet);
  return esc.write.placeOrder([merchant, productId, ASSET_FIAT, amount, buyerInfo]);
}

async function getOrderSnapshot(
  d: DeployResult,
  merchant: Address,
  productId: bigint,
  assetType: number,
  orderId: bigint,
) {
  const [buyer, amount, rate, deadline, status, rateVersion] = await d.c2cEscrow.read.getOrder([
    merchant, productId, assetType, orderId,
  ]);
  return {
    buyer,
    amount,
    rate,
    deadline,
    status: Number(status),
    rateVersion: BigInt(rateVersion),
  };
}

async function buildWiseProofPairForCrypto(
  d: DeployResult,
  p: {
    merchant?: Address;
    productId?: bigint;
    orderId?: bigint;
    chainId?: bigint;
    serverName?: string;
    transferId?: bigint;
    sessionIdContacts?: string;
    sessionIdTransfer?: string;
    state?: string;
    targetAmount?: string;
    targetCurrency?: string;
    dateMs?: bigint;
    orderBindingHash?: Hex;
    merchantNameHash?: Hex;
    merchantIdHash?: Hex;
    payeeNameHash?: Hex;
    payeeIdHash?: Hex;
    buyer?: Address;
    verifierWallet?: any;
    overrideCommitmentsHash?: Hex;
    overrideSignature?: Hex;
  } = {},
) {
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? WISE_CRYPTO_PID;
  const orderId = p.orderId ?? 0n;
  const order = await getOrderSnapshot(d, merchant, productId, ASSET_CRYPTO, orderId);
  const merchantNameHash = p.merchantNameHash ?? MERCHANT_NAME_HASH;
  const merchantIdHash = p.merchantIdHash ?? MERCHANT_ID_HASH;
  const payeeNameHash = p.payeeNameHash ?? merchantNameHash;
  const payeeIdHash = p.payeeIdHash ?? merchantIdHash;

  const obh = p.orderBindingHash ?? computeOrderBindingHash({
    escrow: d.c2cEscrow.address,
    chainId: p.chainId ?? CHAIN_ID,
    merchant,
    buyer: p.buyer ?? order.buyer,
    productId,
    orderId,
    assetType: ASSET_CRYPTO,
    amount: order.amount,
    rate: order.rate,
    rateVersion: order.rateVersion,
    deadline: order.deadline,
    merchantNameHash,
    merchantIdHash,
    payeeNameHash,
    payeeIdHash,
  });

  const fiatX1000 = calcFiatX1000(order.amount, order.rate, ASSET_CRYPTO);
  const transferAmount = p.targetAmount ?? toAmountX1000String(fiatX1000);

  const contacts = await buildWiseContactsProof({
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    sessionId: p.sessionIdContacts,
    serverName: p.serverName ?? WISE_SERVER,
    overrideSignature: p.overrideSignature,
  });

  const transfer = await buildWiseTransferProof({
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    sessionId: p.sessionIdTransfer,
    serverName: p.serverName ?? WISE_SERVER,
    fields: {
      state: p.state ?? "OUTGOING_PAYMENT_SENT",
      targetAmount: transferAmount,
      targetCurrency: p.targetCurrency ?? MYR_NAME,
      transferId: p.transferId ?? nextWiseTransferId(),
      dateMs: p.dateMs ?? (order.deadline - 60n) * 1000n,
    },
    overrideCommitmentsHash: p.overrideCommitmentsHash,
    overrideSignature: p.overrideSignature,
  });

  return { proofs: [contacts, transfer] as TLSNProof[], order, orderBindingHash: obh };
}

async function buildWiseProofPairForFiat(
  d: DeployResult,
  p: {
    merchant?: Address;
    productId?: bigint;
    orderId?: bigint;
    chainId?: bigint;
    serverName?: string;
    transferId?: bigint;
    sessionIdContacts?: string;
    sessionIdTransfer?: string;
    state?: string;
    targetAmount?: string;
    targetCurrency?: string;
    dateMs?: bigint;
    orderBindingHash?: Hex;
    merchantNameHash?: Hex;
    merchantIdHash?: Hex;
    payeeNameHash?: Hex;
    payeeIdHash?: Hex;
    verifierWallet?: any;
    overrideCommitmentsHash?: Hex;
    overrideSignature?: Hex;
  } = {},
) {
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? WISE_FIAT_PID;
  const orderId = p.orderId ?? 0n;
  const order = await getOrderSnapshot(d, merchant, productId, ASSET_FIAT, orderId);
  const buyerInfo = await d.c2cEscrow.read.getBuyerPaymentInfo([merchant, productId, orderId]);

  const merchantNameHash = p.merchantNameHash ?? MERCHANT_NAME_HASH;
  const merchantIdHash = p.merchantIdHash ?? MERCHANT_ID_HASH;
  const payeeNameHash = p.payeeNameHash ?? buyerInfo.nameHash;
  const payeeIdHash = p.payeeIdHash ?? buyerInfo.idHash;

  const obh = p.orderBindingHash ?? computeOrderBindingHash({
    escrow: d.c2cEscrow.address,
    chainId: p.chainId ?? CHAIN_ID,
    merchant,
    buyer: order.buyer,
    productId,
    orderId,
    assetType: ASSET_FIAT,
    amount: order.amount,
    rate: order.rate,
    rateVersion: order.rateVersion,
    deadline: order.deadline,
    merchantNameHash,
    merchantIdHash,
    payeeNameHash,
    payeeIdHash,
  });

  const fiatX1000 = calcFiatX1000(order.amount, order.rate, ASSET_FIAT);
  const transferAmount = p.targetAmount ?? toAmountX1000String(fiatX1000);

  const contacts = await buildWiseContactsProof({
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    sessionId: p.sessionIdContacts,
    serverName: p.serverName ?? WISE_SERVER,
    overrideSignature: p.overrideSignature,
  });

  const transfer = await buildWiseTransferProof({
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    sessionId: p.sessionIdTransfer,
    serverName: p.serverName ?? WISE_SERVER,
    fields: {
      state: p.state ?? "OUTGOING_PAYMENT_SENT",
      targetAmount: transferAmount,
      targetCurrency: p.targetCurrency ?? MYR_NAME,
      transferId: p.transferId ?? nextWiseTransferId(),
      dateMs: p.dateMs ?? (order.deadline - 60n) * 1000n,
    },
    overrideCommitmentsHash: p.overrideCommitmentsHash,
    overrideSignature: p.overrideSignature,
  });

  return { proofs: [contacts, transfer] as TLSNProof[], order, orderBindingHash: obh };
}

async function buildAlipayProofForCrypto(
  d: DeployResult,
  p: {
    merchant?: Address;
    productId?: bigint;
    orderId?: bigint;
    chainId?: bigint;
    serverName?: string;
    orderBindingHash?: Hex;
    orderIdField?: string;
    payAmount?: string;
    status?: string;
    bizType?: string;
    gmtSuccess?: string;
    verifierWallet?: any;
  } = {},
) {
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? ALIPAY_CRYPTO_PID;
  const orderId = p.orderId ?? 0n;
  const order = await getOrderSnapshot(d, merchant, productId, ASSET_CRYPTO, orderId);

  const obh = p.orderBindingHash ?? computeOrderBindingHash({
    escrow: d.c2cEscrow.address,
    chainId: p.chainId ?? CHAIN_ID,
    merchant,
    buyer: order.buyer,
    productId,
    orderId,
    assetType: ASSET_CRYPTO,
    amount: order.amount,
    rate: order.rate,
    rateVersion: order.rateVersion,
    deadline: order.deadline,
    merchantNameHash: MERCHANT_NAME_HASH,
    merchantIdHash: MERCHANT_ID_HASH,
    payeeNameHash: MERCHANT_NAME_HASH,
    payeeIdHash: MERCHANT_ID_HASH,
  });

  const proof = await buildAlipayProof({
    fields: {
      payAmount: p.payAmount ?? ALIPAY_AMOUNT_STR,
      status: p.status ?? "SUCCESS",
      bizType: p.bizType ?? "TRANSFER",
      orderId: p.orderIdField ?? nextAlipayOrderId("ALI-C"),
      gmtSuccess: p.gmtSuccess ?? toAlipayGmtSuccess(order.deadline - 60n),
    },
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    serverName: p.serverName ?? ALIPAY_SERVER,
  });

  return { proofs: [proof] as TLSNProof[], order, orderBindingHash: obh };
}

async function buildAlipayProofForFiat(
  d: DeployResult,
  p: {
    merchant?: Address;
    productId?: bigint;
    orderId?: bigint;
    chainId?: bigint;
    serverName?: string;
    orderBindingHash?: Hex;
    orderIdField?: string;
    payAmount?: string;
    status?: string;
    bizType?: string;
    gmtSuccess?: string;
    verifierWallet?: any;
  } = {},
) {
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? ALIPAY_FIAT_PID;
  const orderId = p.orderId ?? 0n;
  const order = await getOrderSnapshot(d, merchant, productId, ASSET_FIAT, orderId);
  const buyerInfo = await d.c2cEscrow.read.getBuyerPaymentInfo([merchant, productId, orderId]);

  const obh = p.orderBindingHash ?? computeOrderBindingHash({
    escrow: d.c2cEscrow.address,
    chainId: p.chainId ?? CHAIN_ID,
    merchant,
    buyer: order.buyer,
    productId,
    orderId,
    assetType: ASSET_FIAT,
    amount: order.amount,
    rate: order.rate,
    rateVersion: order.rateVersion,
    deadline: order.deadline,
    merchantNameHash: MERCHANT_NAME_HASH,
    merchantIdHash: MERCHANT_ID_HASH,
    payeeNameHash: buyerInfo.nameHash,
    payeeIdHash: buyerInfo.idHash,
  });

  const proof = await buildAlipayProof({
    fields: {
      payAmount: p.payAmount ?? ALIPAY_AMOUNT_STR,
      status: p.status ?? "SUCCESS",
      bizType: p.bizType ?? "TRANSFER",
      orderId: p.orderIdField ?? nextAlipayOrderId("ALI-F"),
      gmtSuccess: p.gmtSuccess ?? toAlipayGmtSuccess(order.deadline - 60n),
    },
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    serverName: p.serverName ?? ALIPAY_SERVER,
  });

  return { proofs: [proof] as TLSNProof[], order, orderBindingHash: obh };
}

describe("C2CEscrow", async function () {
  const { viem, networkHelpers } = await network.connect();
  const testClient = await viem.getTestClient();

  let d: DeployResult;
  let pc: any;
  let PLATFORM_WISE: Hex;
  let PLATFORM_ALIPAY: Hex;
  let snap: Hex;

  async function sendTx(ctx: ReturnType<typeof makeCtx>, txPromise: Promise<Hex>) {
    ctx.markVerifyStart();
    const hash = await txPromise;
    const rcpt = await pc.getTransactionReceipt({ hash });
    ctx.markVerifyEnd();
    ctx.setGas(rcpt.gasUsed);
    return hash;
  }

  async function expectRevertTracked(
    ctx: ReturnType<typeof makeCtx>,
    txPromise: Promise<unknown>,
    expected?: string | RegExp,
  ) {
    ctx.markVerifyStart();
    await expectRevert(txPromise, expected);
    ctx.markVerifyEnd();
  }

  async function runCase(
    id: string,
    desc: string,
    fn: (ctx: ReturnType<typeof makeCtx>) => Promise<void>,
  ) {
    const t0 = Date.now();
    const ctx = makeCtx();
    let pass = false;
    try {
      await fn(ctx);
      pass = true;
    } finally {
      addRecord({
        id,
        desc,
        pass,
        totalMs: Date.now() - t0,
        verifyMs: ctx.verifyMs(),
        gasUsed: ctx.gasUsed,
      });
    }
  }

  function T(
    id: string,
    desc: string,
    fn: (ctx: ReturnType<typeof makeCtx>) => Promise<void>,
  ) {
    it(`${id}: ${desc}`, async () => {
      await runCase(id, desc, fn);
    });
  }

  before(async () => {
    clearRecords();
    const base = await setupBase(viem);
    d = base.d;
    pc = base.pc;
    PLATFORM_WISE = base.PLATFORM_WISE;
    PLATFORM_ALIPAY = base.PLATFORM_ALIPAY;
    snap = await testClient.snapshot();
  });

  beforeEach(async () => {
    await testClient.revert({ id: snap });
    snap = await testClient.snapshot();
  });

  after(() => {
    printTable("C2CEscrow 测试报告");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FLOW — ESC-FLOW-01~16
  // ═══════════════════════════════════════════════════════════════════════
  describe("FLOW", () => {
    T("ESC-FLOW-01", "商家上架 CRYPTO 产品记录正确、抵押入池", async () => {
      const fresh = await setupBase(viem);
      const platform = await fresh.d.c2cEscrow.read.getProductPlatformId([
        fresh.d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO,
      ]);
      assert.equal(platform, fresh.PLATFORM_WISE);
      const escrowBal = await fresh.d.usdt.read.balanceOf([fresh.d.c2cEscrow.address]);
      assert.ok(escrowBal >= COLLATERAL, "escrow must hold collateral");
    });

    T("ESC-FLOW-02", "商家上架 FIAT 产品记录正确、抵押入池", async () => {
      const platform = await d.c2cEscrow.read.getProductPlatformId([
        d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT,
      ]);
      assert.equal(platform, PLATFORM_WISE);
      const escrowBal = await d.usdt.read.balanceOf([d.c2cEscrow.address]);
      assert.ok(escrowBal >= COLLATERAL, "escrow must hold collateral");
    });

    T("ESC-FLOW-03", "CRYPTO 下单成功 -> PENDING", async (ctx) => {
      await sendTx(ctx, placeCryptoOrder(viem, d));
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      assert.equal(order.status, STATUS_PENDING);
      const active = await d.c2cEscrow.read.hasActiveOrder([
        d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
      ]);
      assert.equal(active, true);
    });

    T("ESC-FLOW-04", "FIAT 下单成功 -> WAITING + 买家锁币", async (ctx) => {
      const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
      await sendTx(ctx, placeFiatOrder(viem, d));
      const buyerAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT, 0n);
      assert.equal(order.status, STATUS_WAITING);
      assert.equal(buyerBefore - buyerAfter, TRADE_AMOUNT);
    });

    T("ESC-FLOW-05", "CRYPTO 完整支付成功 -> buyer 收币", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
      const buyerAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);
      assert.equal(buyerAfter - buyerBefore, TRADE_AMOUNT);
      const active = await d.c2cEscrow.read.hasActiveOrder([
        d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
      ]);
      assert.equal(active, false);
    });

    T("ESC-FLOW-06", "FIAT 完整支付成功 -> merchant 收币 + buyerInfo 删除", async (ctx) => {
      await placeFiatOrder(viem, d);
      const { proofs } = await buildWiseProofPairForFiat(d);
      const merchantBefore = await d.usdt.read.balanceOf([d.merchant.account.address]);
      await sendTx(ctx, d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 0n, proofs,
      ]));
      const merchantAfter = await d.usdt.read.balanceOf([d.merchant.account.address]);
      assert.equal(merchantAfter - merchantBefore, TRADE_AMOUNT);
      const buyerInfo = await d.c2cEscrow.read.getBuyerPaymentInfo([
        d.merchant.account.address, WISE_FIAT_PID, 0n,
      ]);
      assert.equal(buyerInfo.isSet, false);
    });

    T("ESC-FLOW-07", "CRYPTO 买家取消 PENDING -> 释放活跃标记", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await sendTx(ctx, d.escrowAsBuyer.write.cancelOrder([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n,
      ]));
      const active = await d.c2cEscrow.read.hasActiveOrder([
        d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
      ]);
      assert.equal(active, false);
    });

    T("ESC-FLOW-08", "FIAT 超时索赔成功 -> buyer 获 2x", async (ctx) => {
      await placeFiatOrder(viem, d);
      await advanceTime(testClient, Number(ORDER_TIMEOUT + 1n));
      const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
      await sendTx(ctx, d.escrowAsBuyer.write.claimRefundAfterTimeout([
        d.merchant.account.address, WISE_FIAT_PID, 0n,
      ]));
      const buyerAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);
      assert.equal(buyerAfter - buyerBefore, TRADE_AMOUNT * 2n);
    });

    T("ESC-FLOW-09", "cleanup 自动处理过期单", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await advanceTime(testClient, Number(ORDER_TIMEOUT + 1n));
      await sendTx(ctx, d.c2cEscrow.write.cleanupProductExpired([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO,
      ]));
      const active = await d.c2cEscrow.read.hasActiveOrder([
        d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
      ]);
      assert.equal(active, false);
    });

    T("ESC-FLOW-10", "产品启停切换正确", async (ctx) => {
      await d.escrowAsMerchant.write.inactiveProduct([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      await expectRevert(
        placeCryptoOrder(viem, d),
        "ProductInactive",
      );
      await sendTx(ctx, d.escrowAsMerchant.write.activeProduct([WISE_CRYPTO_PID, ASSET_CRYPTO]));
      await placeCryptoOrder(viem, d);
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      assert.equal(order.status, STATUS_PENDING);
    });

    T("ESC-FLOW-11", "商家补充抵押 addAmount 成功", async (ctx) => {
      await sendTx(ctx, d.escrowAsMerchant.write.addAmount([
        WISE_CRYPTO_PID, ASSET_CRYPTO, 5n * 10n ** 18n,
      ]));
      await placeCryptoOrder(viem, d, { amount: 12n * 10n ** 18n });
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      assert.equal(order.amount, 12n * 10n ** 18n);
    });

    T("ESC-FLOW-12", "商家提取可用抵押 takeAmount（分批成功）", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const merchantBefore = await d.usdt.read.balanceOf([d.merchant.account.address]);
      const takeAmountA = 4n * 10n ** 18n;
      const takeAmountB = (COLLATERAL - TRADE_AMOUNT) - takeAmountA;
      await sendTx(ctx, d.escrowAsMerchant.write.takeAmount([
        WISE_CRYPTO_PID, ASSET_CRYPTO, takeAmountA,
      ]));
      await sendTx(ctx, d.escrowAsMerchant.write.takeAmount([
        WISE_CRYPTO_PID, ASSET_CRYPTO, takeAmountB,
      ]));
      const merchantAfter = await d.usdt.read.balanceOf([d.merchant.account.address]);
      assert.equal(merchantAfter - merchantBefore, takeAmountA + takeAmountB);
    });

    T("ESC-FLOW-13", "商家提取超出可用抵押 -> InsufficientPendingLocked", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const overAmount = (COLLATERAL - TRADE_AMOUNT) + 1n;
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.takeAmount([
        WISE_CRYPTO_PID, ASSET_CRYPTO, overAmount,
      ]), "InsufficientPendingLocked");
    });

    T("ESC-FLOW-14", "读取 getOrder 字段正确", async () => {
      await placeCryptoOrder(viem, d);
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      assert.equal(order.buyer.toLowerCase(), d.buyer.account.address.toLowerCase());
      assert.equal(order.amount, TRADE_AMOUNT);
      assert.ok(order.rate > 0n);
      assert.ok(order.deadline > 0n);
      assert.equal(order.status, STATUS_PENDING);
      assert.equal(order.rateVersion, 1n);
    });

    T("ESC-FLOW-15", "读取 buyerPaymentInfo：在途 true，结束 false", async () => {
      await placeFiatOrder(viem, d);
      const infoInFlight = await d.c2cEscrow.read.getBuyerPaymentInfo([
        d.merchant.account.address, WISE_FIAT_PID, 0n,
      ]);
      assert.equal(infoInFlight.isSet, true);
      const { proofs } = await buildWiseProofPairForFiat(d);
      await d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([WISE_FIAT_PID, 0n, proofs]);
      const infoCleared = await d.c2cEscrow.read.getBuyerPaymentInfo([
        d.merchant.account.address, WISE_FIAT_PID, 0n,
      ]);
      assert.equal(infoCleared.isSet, false);
    });

    T("ESC-FLOW-16", "读取平台 ID 与上架一致", async () => {
      const p1 = await d.c2cEscrow.read.getProductPlatformId([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO,
      ]);
      const p2 = await d.c2cEscrow.read.getProductPlatformId([
        d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT,
      ]);
      assert.equal(p1, PLATFORM_WISE);
      assert.equal(p2, PLATFORM_WISE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ERR — ESC-ERR-01~30
  // ═══════════════════════════════════════════════════════════════════════
  describe("ERR", () => {
    T("ESC-ERR-01", "非商家上架产品 -> NotMerchant", async (ctx) => {
      const escRandom = await escrowAs(viem, d, d.randomUser);
      // In current Hardhat+viem path this revert may surface as unrecognized custom
      // error selector (0x3b6405f4), so match either textual token or selector.
      await expectRevertTracked(ctx, escRandom.write.listCryptoProduct([
        USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
      ]), /(NotMerchant|0x3b6405f4)/);
    });

    T("ESC-ERR-02", "上架时 cryptoId 越界 -> WrongId", async (ctx) => {
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.listCryptoProduct([
        999n, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
      ]), "WrongId");
    });

    T("ESC-ERR-03", "上架时 fiatId 越界 -> WrongId", async (ctx) => {
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.listFiatProduct([
        999n, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_WISE,
      ]), "WrongId");
    });

    T("ESC-ERR-04", "激活已激活产品 -> AlreadyActive", async (ctx) => {
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.activeProduct([
        WISE_CRYPTO_PID, ASSET_CRYPTO,
      ]), "AlreadyActive");
    });

    T("ESC-ERR-05", "下架已下架产品 -> AlreadyInactive", async (ctx) => {
      await d.escrowAsMerchant.write.inactiveProduct([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.inactiveProduct([
        WISE_CRYPTO_PID, ASSET_CRYPTO,
      ]), "AlreadyInactive");
    });

    T("ESC-ERR-06", "提取超可用抵押 -> InsufficientPendingLocked", async (ctx) => {
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.takeAmount([
        WISE_CRYPTO_PID, ASSET_CRYPTO, COLLATERAL + 1n,
      ]), "InsufficientPendingLocked");
    });

    T("ESC-ERR-07", "产品关闭时下单 -> ProductInactive", async (ctx) => {
      await d.escrowAsMerchant.write.inactiveProduct([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d), "ProductInactive");
    });

    T("ESC-ERR-08", "非营业时间下单 -> MerchantClosed", async (ctx) => {
      await d.adminAsMerchant.write.closeNow([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d), "MerchantClosed");
    });

    T("ESC-ERR-09", "汇率未发布下单 -> RateNotPublished", async (ctx) => {
      await d.escrowAsMerchant.write.listCryptoProduct([
        USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
      ]);
      await d.adminAsMerchant.write.openNow([2n, ASSET_CRYPTO]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d, { productId: 2n }), "RateNotPublished");
    });

    T("ESC-ERR-10", "汇率过期下单 -> RateExpired", async (ctx) => {
      const ts = await nowTs(pc);
      await d.adminAsMerchant.write.publishRate([
        WISE_CRYPTO_PID, ASSET_CRYPTO, RATE_WISE_CRYPTO, ts + 120n,
      ]);
      await advanceTime(testClient, 130);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d), "RateExpired");
    });

    T("ESC-ERR-11", "amount=0 下单 -> ZeroAmount", async (ctx) => {
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d, { amount: 0n }), "ZeroAmount");
    });

    T("ESC-ERR-12", "超过单笔限额 -> ExceedsUsdCap", async (ctx) => {
      await d.c2cAdmin.write.setMaxOrderAmount([1n * 10n ** 18n]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d, { amount: 2n * 10n ** 18n }), "ExceedsUsdCap");
    });

    T("ESC-ERR-13", "超过可用抵押下单 -> InsufficientAvailable", async (ctx) => {
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d, { amount: COLLATERAL + 1n }), "InsufficientAvailable");
    });

    T("ESC-ERR-14", "同买家同产品重复活跃下单 -> AlreadyHasActiveOrder", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d), "AlreadyHasActiveOrder");
    });

    T("ESC-ERR-15", "FIAT 不传 buyerInfo -> BuyerPaymentInfoRequired", async (ctx) => {
      await expectRevertTracked(ctx, placeFiatOrder(viem, d, { buyerInfo: NULL_BUYER_INFO }), "BuyerPaymentInfoRequired");
    });

    T("ESC-ERR-31", "订单平台未配置支付信息 -> MerchantPaymentInfoNotSet", async (ctx) => {
      await d.c2cAdmin.write.registerMerchantByAdmin([d.newAdmin.account.address]);
      await d.usdt.write.mint([d.newAdmin.account.address, COLLATERAL * 2n]);

      const usdtOther = await usdtAs(viem, d, d.newAdmin);
      await usdtOther.write.approve([d.c2cEscrow.address, MAX_UINT]);

      const adminOther = await adminAs(viem, d, d.newAdmin);
      const escOther = await escrowAs(viem, d, d.newAdmin);
      await escOther.write.listCryptoProduct([
        USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
      ]);
      const expiry = (await nowTs(pc)) + 365n * 24n * 3600n;
      await adminOther.write.publishRate([WISE_CRYPTO_PID, ASSET_CRYPTO, RATE_WISE_CRYPTO, expiry]);
      await adminOther.write.openNow([WISE_CRYPTO_PID, ASSET_CRYPTO]);

      await expectRevertTracked(ctx, d.escrowAsBuyer.write.placeOrder([
        d.newAdmin.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
      ]), "MerchantPaymentInfoNotSet");
    });

    T("ESC-ERR-16", "WAITING 订单调用 cancel -> NotPending", async (ctx) => {
      await placeFiatOrder(viem, d);
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.cancelOrder([
        d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT, 0n,
      ]), "NotPending");
    });

    T("ESC-ERR-17", "非买家取消订单 -> NotAllowed", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const escRandom = await escrowAs(viem, d, d.randomUser);
      await expectRevertTracked(ctx, escRandom.write.cancelOrder([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n,
      ]), "NotAllowed");
    });

    T("ESC-ERR-18", "订单过期后提交 proof -> OutOfDeadline", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await advanceTime(testClient, Number(ORDER_TIMEOUT + 1n));
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "OutOfDeadline");
    });

    T("ESC-ERR-19", "FIAT 非 WAITING 场景提交收款证明 -> NotWaiting", async (ctx) => {
      // 下两笔 FIAT 单：order0 保持 WAITING（队列头），order1 完成后不会被立即 cleanup 删除。
      await placeFiatOrder(viem, d);
      await fundAndApproveBuyer(viem, d, d.newAdmin);
      await placeFiatOrder(viem, d, { buyerWallet: d.newAdmin });

      // 完成 order1（WAITING -> COMPLETED）。
      const first = await buildWiseProofPairForFiat(d, { orderId: 1n });
      await d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 1n, first.proofs,
      ]);

      // 再构造一份新的、未过期 proof 重放同一 order1，应命中 NotWaiting。
      const second = await buildWiseProofPairForFiat(d, { orderId: 1n });
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 1n, second.proofs,
      ]), "NotWaiting");
    });

    T("ESC-ERR-20", "claimRefund 未超时 -> NotYetExpired", async (ctx) => {
      await placeFiatOrder(viem, d);
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.claimRefundAfterTimeout([
        d.merchant.account.address, WISE_FIAT_PID, 0n,
      ]), "NotYetExpired");
    });

    T("ESC-ERR-21", "cancel 不存在订单 -> OrderNotFound", async (ctx) => {
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.cancelOrder([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 999n,
      ]), "OrderNotFound");
    });

    T("ESC-ERR-22", "pay proof OBH 错误 -> OrderBindingHashMismatch", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d, { orderBindingHash: ZERO_HASH });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "OrderBindingHashMismatch");
    });

    T("ESC-ERR-23", "平台未注册且未配置支付信息 -> MerchantPaymentInfoNotSet", async (ctx) => {
      const unregisteredPlatform = keccak256(toBytes("unregistered-platform"));
      await d.escrowAsMerchant.write.listCryptoProduct([
        USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, unregisteredPlatform,
      ]);
      const exp = (await nowTs(pc)) + 86400n;
      await d.adminAsMerchant.write.publishRate([2n, ASSET_CRYPTO, RATE_WISE_CRYPTO, exp]);
      await d.adminAsMerchant.write.openNow([2n, ASSET_CRYPTO]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d, { productId: 2n }), "MerchantPaymentInfoNotSet");
    });

    T("ESC-ERR-24", "payment server 不可信 -> NotTrustedPaymentServer", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d, {
        serverName: "evil.wise.com",
      });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "NotTrustedPaymentServer");
    });

    T("ESC-ERR-25", "proof chainId 错误 -> WrongChainId", async (ctx) => {
      await placeCryptoOrder(viem, d);

      // Keep orderBindingHash on the real chainId so Escrow OBH check passes first,
      // then trigger WrongChainId inside TLSNVerifier with proof.chainId = 1.
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      const obh = computeOrderBindingHash({
        escrow: d.c2cEscrow.address,
        chainId: CHAIN_ID,
        merchant: d.merchant.account.address,
        buyer: order.buyer,
        productId: WISE_CRYPTO_PID,
        orderId: 0n,
        assetType: ASSET_CRYPTO,
        amount: order.amount,
        rate: order.rate,
        rateVersion: order.rateVersion,
        deadline: order.deadline,
        merchantNameHash: MERCHANT_NAME_HASH,
        merchantIdHash: MERCHANT_ID_HASH,
        payeeNameHash: MERCHANT_NAME_HASH,
        payeeIdHash: MERCHANT_ID_HASH,
      });
      const { proofs } = await buildWiseProofPairForCrypto(d, { chainId: 1n, orderBindingHash: obh });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "WrongChainId");
    });

    T("ESC-ERR-26", "sessionId 重放 -> SessionAlreadyUsed", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const s1 = nextSession();
      const s2 = nextSession();
      const p1 = await buildWiseProofPairForCrypto(d, { sessionIdContacts: s1, sessionIdTransfer: s2 });
      await d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, p1.proofs,
      ]);

      await placeCryptoOrder(viem, d);
      const p2 = await buildWiseProofPairForCrypto(d, { orderId: 1n, sessionIdContacts: s1, sessionIdTransfer: nextSession() });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 1n, p2.proofs,
      ]), "SessionAlreadyUsed");
    });

    T("ESC-ERR-27", "verifier 签名不可信 -> UntrustedVerifier", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d, { verifierWallet: d.randomUser });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "UntrustedVerifier");
    });

    T("ESC-ERR-28", "commitmentsHash 篡改 -> CommitmentsHashMismatch", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d, {
        overrideCommitmentsHash: ZERO_HASH,
      });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "CommitmentsHashMismatch");
    });

    T("ESC-ERR-29", "blinder 篡改 -> CommitmentOpeningMismatch", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const built = await buildWiseProofPairForCrypto(d);
      (built.proofs[1] as any).commitmentOpenings[0].blinderHex = ZERO_HASH;
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
      ]), "CommitmentOpeningMismatch");
    });

    T("ESC-ERR-30", "FIAT 非商家提交证明 -> WrongId（当前实现）", async (ctx) => {
      await placeFiatOrder(viem, d);
      const { proofs } = await buildWiseProofPairForFiat(d);
      const escRandom = await escrowAs(viem, d, d.randomUser);
      await expectRevertTracked(ctx, escRandom.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 0n, proofs,
      ]), "WrongId");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ATTACK — ESC-ATT-01~16
  // ═══════════════════════════════════════════════════════════════════════
  describe("ATTACK", () => {
    T("ESC-ATT-01", "用户抢跑提交买家 proof -> NotAllowed", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      const escRandom = await escrowAs(viem, d, d.randomUser);
      await expectRevertTracked(ctx, escRandom.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "NotAllowed");
    });

    T("ESC-ATT-02", "其他商家抢跑提交买家 proof -> NotAllowed", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.c2cAdmin.write.registerMerchantByAdmin([d.newAdmin.account.address]);
      const adminOther = await adminAs(viem, d, d.newAdmin);
      await adminOther.write.setMerchantPaymentInfoForPlatform([
        PLATFORM_WISE,
        ATTACKER_NAME_HASH,
        ATTACKER_ID_HASH,
      ]);
      const escOther = await escrowAs(viem, d, d.newAdmin);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await expectRevertTracked(ctx, escOther.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "NotAllowed");
    });

    T("ESC-ATT-03", "用户抢跑提交商家 proof -> WrongId（当前实现）", async (ctx) => {
      await placeFiatOrder(viem, d);
      const { proofs } = await buildWiseProofPairForFiat(d);
      const escRandom = await escrowAs(viem, d, d.randomUser);
      await expectRevertTracked(ctx, escRandom.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 0n, proofs,
      ]), "WrongId");
    });

    T("ESC-ATT-04", "其他商家抢跑提交商家 proof -> OrderBindingHashMismatch", async (ctx) => {
      await placeFiatOrder(viem, d);
      const victim = await buildWiseProofPairForFiat(d, { orderId: 0n });

      await d.c2cAdmin.write.registerMerchantByAdmin([d.newAdmin.account.address]);
      const adminOther = await adminAs(viem, d, d.newAdmin);
      await adminOther.write.setMerchantPaymentInfoForPlatform([
        PLATFORM_WISE,
        ATTACKER_NAME_HASH,
        ATTACKER_ID_HASH,
      ]);

      await d.usdt.write.mint([d.newAdmin.account.address, COLLATERAL * 2n]);
      const usdtOther = await usdtAs(viem, d, d.newAdmin);
      await usdtOther.write.approve([d.c2cEscrow.address, MAX_UINT]);

      const escOther = await escrowAs(viem, d, d.newAdmin);
      await escOther.write.listFiatProduct([
        MYR_FIAT_ID, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_WISE,
      ]);
      const expiry = (await pc.getBlock()).timestamp + 365n * 24n * 3600n;
      await adminOther.write.publishRate([WISE_FIAT_PID, ASSET_FIAT, RATE_WISE_FIAT, expiry]);
      await adminOther.write.openNow([WISE_FIAT_PID, ASSET_FIAT]);

      await placeFiatOrder(viem, d, {
        merchant: d.newAdmin.account.address,
        productId: WISE_FIAT_PID,
      });

      await expectRevertTracked(ctx, escOther.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 0n, victim.proofs,
      ]), "OrderBindingHashMismatch");
    });

    T("ESC-ATT-05", "跨订单 replay -> OrderBindingHashMismatch", async (ctx) => {
      await fundAndApproveBuyer(viem, d, d.newAdmin);
      await placeCryptoOrder(viem, d, { buyerWallet: d.buyer });
      await placeCryptoOrder(viem, d, { buyerWallet: d.newAdmin });
      const pA = await buildWiseProofPairForCrypto(d, { orderId: 0n });
      const escNewAdmin = await escrowAs(viem, d, d.newAdmin);
      await expectRevertTracked(ctx, escNewAdmin.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 1n, pA.proofs,
      ]), "OrderBindingHashMismatch");
    });

    T("ESC-ATT-06", "同订单重复提交 proof：cleanup 后 OrderNotFound；未 cleanup 时 NotPending", async (ctx) => {
      // Case A: completed order is cleaned up, replay hits OrderNotFound.
      await placeCryptoOrder(viem, d);
      const built = await buildWiseProofPairForCrypto(d, { orderId: 0n });
      await d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
      ]);
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
      ]), "OrderNotFound");

      // Case B: head pending order blocks cleanup, replayed completed order still exists => NotPending.
      await fundAndApproveBuyer(viem, d, d.newAdmin);
      await placeCryptoOrder(viem, d, { buyerWallet: d.buyer }); // orderId = 1 (head pending)
      await placeCryptoOrder(viem, d, { buyerWallet: d.newAdmin }); // orderId = 2 (target completed)
      const escNewAdmin = await escrowAs(viem, d, d.newAdmin);
      const secondBuilt = await buildWiseProofPairForCrypto(d, { orderId: 2n });
      await escNewAdmin.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 2n, secondBuilt.proofs,
      ]);
      await expectRevertTracked(ctx, escNewAdmin.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 2n, secondBuilt.proofs,
      ]), "NotPending");
    });

    T("ESC-ATT-07", "跨平台 proof 注入 -> NotTrustedPaymentServer", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const { proofs } = await buildWiseProofPairForCrypto(d, {
        serverName: "alipay.com",
      });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "NotTrustedPaymentServer");
    });

    T("ESC-ATT-08", "平台唯一交易 ID 重放 -> DuplicateTransferId", async (ctx) => {
      await fundAndApproveBuyer(viem, d, d.newAdmin);
      const transferId = nextWiseTransferId();

      await placeCryptoOrder(viem, d, { buyerWallet: d.buyer });
      const p1 = await buildWiseProofPairForCrypto(d, { transferId });
      await d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, p1.proofs,
      ]);

      await placeCryptoOrder(viem, d, { buyerWallet: d.newAdmin });
      const escNewAdmin = await escrowAs(viem, d, d.newAdmin);
      const p2 = await buildWiseProofPairForCrypto(d, { orderId: 1n, transferId });
      await expectRevertTracked(ctx, escNewAdmin.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 1n, p2.proofs,
      ]), "DuplicateTransferId");
    });

    T("ESC-ATT-09", "伪造买家身份哈希 -> OrderBindingHashMismatch", async (ctx) => {
      await placeFiatOrder(viem, d);
      const { proofs } = await buildWiseProofPairForFiat(d, {
        payeeNameHash: ATTACKER_NAME_HASH,
        payeeIdHash: ATTACKER_ID_HASH,
      });
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 0n, proofs,
      ]), "OrderBindingHashMismatch");
    });

    T("ESC-ATT-10", "篡改 rateVersion -> OrderBindingHashMismatch", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const order = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      const obh = computeOrderBindingHash({
        escrow: d.c2cEscrow.address,
        chainId: CHAIN_ID,
        merchant: d.merchant.account.address,
        buyer: order.buyer,
        productId: WISE_CRYPTO_PID,
        orderId: 0n,
        assetType: ASSET_CRYPTO,
        amount: order.amount,
        rate: order.rate,
        rateVersion: order.rateVersion + 1n,
        deadline: order.deadline,
        merchantNameHash: MERCHANT_NAME_HASH,
        merchantIdHash: MERCHANT_ID_HASH,
        payeeNameHash: MERCHANT_NAME_HASH,
        payeeIdHash: MERCHANT_ID_HASH,
      });
      const { proofs } = await buildWiseProofPairForCrypto(d, { orderBindingHash: obh });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "OrderBindingHashMismatch");
    });

    T("ESC-ATT-11", "commitments 组合碰撞尝试 -> CommitmentOpeningMismatch/CommitmentsHashMismatch", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const built = await buildWiseProofPairForCrypto(d);
      (built.proofs[1] as any).commitmentOpenings[0].blinderHex = ZERO_HASH;
      await expectRevertTracked(
        ctx,
        d.escrowAsBuyer.write.payOrderByPlatform([d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs]),
        /(CommitmentOpeningMismatch|CommitmentsHashMismatch)/,
      );
    });

    T("ESC-ATT-12", "旧 session 多次利用 -> SessionAlreadyUsed", async (ctx) => {
      await fundAndApproveBuyer(viem, d, d.newAdmin);
      const s = nextSession();
      const s2 = nextSession();

      await placeCryptoOrder(viem, d, { buyerWallet: d.buyer });
      const p1 = await buildWiseProofPairForCrypto(d, { sessionIdContacts: s, sessionIdTransfer: s2 });
      await d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, p1.proofs,
      ]);

      await placeCryptoOrder(viem, d, { buyerWallet: d.newAdmin });
      const escNewAdmin = await escrowAs(viem, d, d.newAdmin);
      const p2 = await buildWiseProofPairForCrypto(d, { orderId: 1n, sessionIdContacts: nextSession(), sessionIdTransfer: s2 });
      await expectRevertTracked(ctx, escNewAdmin.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 1n, p2.proofs,
      ]), "SessionAlreadyUsed");
    });

    T("ESC-ATT-13", "DoS 填满 pending 队列 -> TooManyPending", async (ctx) => {
      await d.escrowAsMerchant.write.addAmount([WISE_CRYPTO_PID, ASSET_CRYPTO, 500n * 10n ** 18n]);
      const baseInt = 0x1000_0000_0000_0000_0000_0000_0000_0000_0000n;
      const merchant = d.merchant.account.address;

      for (let i = 0; i < 200; i++) {
        const addrBig = baseInt + BigInt(i);
        const addr = (`0x${addrBig.toString(16).padStart(40, "0")}`) as Address;
        await networkHelpers.setBalance(addr, 10n ** 20n);
        await networkHelpers.impersonateAccount(addr);
        await d.usdt.write.mint([addr, 5n * 10n ** 18n]);
        const wallet = await viem.getWalletClient(addr);
        const token = await viem.getContractAt("MockERC20", d.usdt.address, {
          client: { wallet },
        });
        await token.write.approve([d.c2cEscrow.address, MAX_UINT]);
        const esc = await viem.getContractAt("C2CEscrow", d.c2cEscrow.address, {
          client: { wallet },
        });
        await esc.write.placeOrder([merchant, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO]);
      }

      const overflow = (`0x${(baseInt + 200n).toString(16).padStart(40, "0")}`) as Address;
      await networkHelpers.setBalance(overflow, 10n ** 20n);
      await networkHelpers.impersonateAccount(overflow);
      await d.usdt.write.mint([overflow, 5n * 10n ** 18n]);
      const overflowWallet = await viem.getWalletClient(overflow);
      const tokenOverflow = await viem.getContractAt("MockERC20", d.usdt.address, {
        client: { wallet: overflowWallet },
      });
      await tokenOverflow.write.approve([d.c2cEscrow.address, MAX_UINT]);
      const escOverflow = await viem.getContractAt("C2CEscrow", d.c2cEscrow.address, {
        client: { wallet: overflowWallet },
      });

      await expectRevertTracked(ctx, escOverflow.write.placeOrder([
        merchant, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
      ]), "TooManyPending");
    });

    T("ESC-ATT-14", "商家趁挂单提走抵押 -> InsufficientPendingLocked", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.takeAmount([
        WISE_CRYPTO_PID, ASSET_CRYPTO, COLLATERAL,
      ]), "InsufficientPendingLocked");
    });

    T("ESC-ATT-15", "非授权直调平台 verifier -> only TLSNVerifier", async (ctx) => {
      await expectRevertTracked(ctx, d.wisePlatformVerifier.write.verifyBuyerPayment([
        "0x", "0x",
      ]), /only TLSNVerifier/);
    });

    T("ESC-ATT-16", "过期后再 release/claim 提交 proof -> OutOfDeadline", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await advanceTime(testClient, Number(ORDER_TIMEOUT + 1n));
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "OutOfDeadline");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TAMPER — ESC-TAMPER-01~13
  // ═══════════════════════════════════════════════════════════════════════
  describe("TAMPER", () => {
    T("ESC-TAMPER-01", "下单后改汇率不影响旧单（rateVersion 快照）", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.adminAsMerchant.write.publishRate([WISE_CRYPTO_PID, ASSET_CRYPTO, RATE_WISE_CRYPTO * 2n, 0n]);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
    });

    T("ESC-TAMPER-02", "下单后商家改支付哈希，旧单按快照仍可通过", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
        PLATFORM_WISE,
        ALT_MERCHANT_NAME_HASH,
        ALT_MERCHANT_ID_HASH,
      ]);
      const { proofs } = await buildWiseProofPairForCrypto(d, {
        merchantNameHash: MERCHANT_NAME_HASH,
        merchantIdHash: MERCHANT_ID_HASH,
        payeeNameHash: MERCHANT_NAME_HASH,
        payeeIdHash: MERCHANT_ID_HASH,
      });
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
    });

    T("ESC-TAMPER-03", "FIAT 下单后已是 WAITING，买家调用 cancelOrder 会被拒绝（NotPending）", async (ctx) => {
      await placeFiatOrder(viem, d);
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.cancelOrder([
        d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT, 0n,
      ]), "NotPending");
    });

    T("ESC-TAMPER-04", "非营业时间下单 -> MerchantClosed", async (ctx) => {
      await d.adminAsMerchant.write.closeNow([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d), "MerchantClosed");
    });

    T("ESC-TAMPER-05", "下单后关门，不影响已有订单完成", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.adminAsMerchant.write.closeNow([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
    });

    T("ESC-TAMPER-06", "下单后下架产品，不影响已有订单完成", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.escrowAsMerchant.write.inactiveProduct([WISE_CRYPTO_PID, ASSET_CRYPTO]);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
    });

    T("ESC-TAMPER-07", "下单后汇率过期，旧单仍可处理", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const ts = await nowTs(pc);
      await d.adminAsMerchant.write.publishRate([WISE_CRYPTO_PID, ASSET_CRYPTO, RATE_WISE_CRYPTO, ts + 120n]);
      await advanceTime(testClient, 130);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
    });

    T("ESC-TAMPER-08", "下单后管理员调低 cap，只影响新单", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.c2cAdmin.write.setMaxOrderAmount([TRADE_AMOUNT - 1n]);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]);
      await expectRevertTracked(ctx, placeCryptoOrder(viem, d), "ExceedsUsdCap");
    });

    T("ESC-TAMPER-09", "提交 proof 时篡改 payee hash -> OrderBindingHashMismatch", async (ctx) => {
      await placeFiatOrder(viem, d);
      const { proofs } = await buildWiseProofPairForFiat(d, {
        payeeNameHash: ATTACKER_NAME_HASH,
        payeeIdHash: ATTACKER_ID_HASH,
      });
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
        WISE_FIAT_PID, 0n, proofs,
      ]), "OrderBindingHashMismatch");
    });

    T("ESC-TAMPER-10", "FIAT 订单处于 WAITING 时，商家不能提走被占用抵押（InsufficientPendingLocked）", async (ctx) => {
      await placeFiatOrder(viem, d);
      await expectRevertTracked(ctx, d.escrowAsMerchant.write.takeAmount([
        WISE_FIAT_PID, ASSET_FIAT, COLLATERAL,
      ]), "InsufficientPendingLocked");
    });

    T("ESC-TAMPER-11", "错误时机 cleanup 不应影响有效未过期订单", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.c2cEscrow.write.cleanupProductExpired([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO,
      ]);
      const { proofs } = await buildWiseProofPairForCrypto(d);
      await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]));
    });

    T("ESC-TAMPER-12", "deadline 边界：==deadline 可过，>deadline 必拒绝", async (ctx) => {
      await placeCryptoOrder(viem, d);
      const order0 = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
      const p0 = await buildWiseProofPairForCrypto(d, {
        dateMs: order0.deadline * 1000n,
      });
      await d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, p0.proofs,
      ]);

      await placeCryptoOrder(viem, d);
      const order1 = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 1n);
      const delta = Number((order1.deadline + 1n) - (await nowTs(pc)));
      if (delta > 0) {
        await advanceTime(testClient, delta);
      }
      const p1 = await buildWiseProofPairForCrypto(d, {
        orderId: 1n,
        dateMs: order1.deadline * 1000n,
      });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 1n, p1.proofs,
      ]), "OutOfDeadline");
    });

    T("ESC-TAMPER-13", "旧订单必须使用下单时商家收款哈希；改哈希后用新值签旧单会失败", async (ctx) => {
      await placeCryptoOrder(viem, d);
      await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
        PLATFORM_WISE,
        ALT_MERCHANT_NAME_HASH,
        ALT_MERCHANT_ID_HASH,
      ]);
      const { proofs } = await buildWiseProofPairForCrypto(d, {
        merchantNameHash: ALT_MERCHANT_NAME_HASH,
        merchantIdHash: ALT_MERCHANT_ID_HASH,
        payeeNameHash: ALT_MERCHANT_NAME_HASH,
        payeeIdHash: ALT_MERCHANT_ID_HASH,
      });
      await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]), "OrderBindingHashMismatch");
    });
  });
});
