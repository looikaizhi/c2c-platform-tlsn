/**
 * Integration.ts
 *
 * Cross-contract integration tests for end-to-end flows and attack chains.
 * Covers: INT-01~INT-11
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
  ALIPAY_SERVER,
  BUYER_HANDLE,
  BUYER_NAME,
  COLLATERAL,
  CNY_FIAT_ID,
  MYR_FIAT_ID,
  MYR_NAME,
  ORDER_TIMEOUT,
  RATE_ALIPAY_CRYPTO,
  RATE_ALIPAY_FIAT,
  RATE_WISE_CRYPTO,
  RATE_WISE_FIAT,
  TRADE_AMOUNT,
  USDT_CRYPTO_ID,
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

let _wiseTransferId = 990_000_000n;
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

  await d.escrowAsMerchant.write.listCryptoProduct([
    USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
  ]);
  await d.escrowAsMerchant.write.listFiatProduct([
    MYR_FIAT_ID, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_WISE,
  ]);

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
    platform?: "wise" | "alipay";
  } = {},
) {
  const buyerWallet = p.buyerWallet ?? d.buyer;
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? (p.platform === "alipay" ? ALIPAY_CRYPTO_PID : WISE_CRYPTO_PID);
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
    platform?: "wise" | "alipay";
  } = {},
) {
  const buyerWallet = p.buyerWallet ?? d.buyer;
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? (p.platform === "alipay" ? ALIPAY_FIAT_PID : WISE_FIAT_PID);
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
    sessionId?: string;
    serverName?: string;
    orderBindingHash?: Hex;
    orderIdField?: string;
    payAmount?: string;
    status?: string;
    bizType?: string;
    gmtSuccess?: string;
    merchantNameHash?: Hex;
    merchantIdHash?: Hex;
    payeeNameHash?: Hex;
    payeeIdHash?: Hex;
    buyer?: Address;
    verifierWallet?: any;
  } = {},
) {
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? ALIPAY_CRYPTO_PID;
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
  const payAmount = p.payAmount ?? toAmountX1000String(fiatX1000);
  const orderIdField = p.orderIdField ?? nextAlipayOrderId("ALI-C");

  const proof = await buildAlipayProof({
    fields: {
      payAmount,
      status: p.status ?? "SUCCESS",
      bizType: p.bizType ?? "TRANSFER",
      orderId: orderIdField,
      gmtSuccess: p.gmtSuccess ?? toAlipayGmtSuccess(order.deadline - 60n),
    },
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    sessionId: p.sessionId,
    serverName: p.serverName ?? ALIPAY_SERVER,
  });

  return { proofs: [proof] as TLSNProof[], order, orderBindingHash: obh, orderIdField };
}

async function buildAlipayProofForFiat(
  d: DeployResult,
  p: {
    merchant?: Address;
    productId?: bigint;
    orderId?: bigint;
    chainId?: bigint;
    sessionId?: string;
    serverName?: string;
    orderBindingHash?: Hex;
    orderIdField?: string;
    payAmount?: string;
    status?: string;
    bizType?: string;
    gmtSuccess?: string;
    merchantNameHash?: Hex;
    merchantIdHash?: Hex;
    payeeNameHash?: Hex;
    payeeIdHash?: Hex;
    verifierWallet?: any;
  } = {},
) {
  const merchant = p.merchant ?? d.merchant.account.address;
  const productId = p.productId ?? ALIPAY_FIAT_PID;
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
  const payAmount = p.payAmount ?? toAmountX1000String(fiatX1000);
  const orderIdField = p.orderIdField ?? nextAlipayOrderId("ALI-F");

  const proof = await buildAlipayProof({
    fields: {
      payAmount,
      status: p.status ?? "SUCCESS",
      bizType: p.bizType ?? "TRANSFER",
      orderId: orderIdField,
      gmtSuccess: p.gmtSuccess ?? toAlipayGmtSuccess(order.deadline - 60n),
    },
    verifierWallet: p.verifierWallet ?? d.verifierSigner,
    orderBindingHash: obh,
    chainId: p.chainId ?? CHAIN_ID,
    sessionId: p.sessionId,
    serverName: p.serverName ?? ALIPAY_SERVER,
  });

  return { proofs: [proof] as TLSNProof[], order, orderBindingHash: obh, orderIdField };
}

describe("Integration — 跨合约联动", async function () {
  const { viem } = await network.connect();
  const testClient = await viem.getTestClient();

  let d: DeployResult;
  let pc: any;
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
    snap = await testClient.snapshot();
  });

  beforeEach(async () => {
    await testClient.revert({ id: snap });
    snap = await testClient.snapshot();
  });

  after(() => {
    printTable("Integration 测试报告");
  });

  T("INT-01", "Wise-CRYPTO 全链路完成，买家收币", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "wise" });

    const order0 = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
    assert.equal(order0.status, STATUS_PENDING);

    const built = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
    });

    const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
    await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
    ]));
    const buyerAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);

    assert.equal(buyerAfter - buyerBefore, TRADE_AMOUNT);

    const active = await d.c2cEscrow.read.hasActiveOrder([
      d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
    ]);
    assert.equal(active, false);
  });

  T("INT-02", "Wise-FIAT 全链路完成，商家收币", async (ctx) => {
    await placeFiatOrder(viem, d, { platform: "wise" });

    const order0 = await getOrderSnapshot(d, d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT, 0n);
    assert.equal(order0.status, STATUS_WAITING);

    const built = await buildWiseProofPairForFiat(d, {
      productId: WISE_FIAT_PID,
      orderId: 0n,
    });

    const merchantBefore = await d.usdt.read.balanceOf([d.merchant.account.address]);
    await sendTx(ctx, d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
      WISE_FIAT_PID, 0n, built.proofs,
    ]));
    const merchantAfter = await d.usdt.read.balanceOf([d.merchant.account.address]);

    assert.equal(merchantAfter - merchantBefore, TRADE_AMOUNT);

    const buyerInfo = await d.c2cEscrow.read.getBuyerPaymentInfo([
      d.merchant.account.address, WISE_FIAT_PID, 0n,
    ]);
    assert.equal(buyerInfo.isSet, false);

    const active = await d.c2cEscrow.read.hasActiveOrder([
      d.buyer.account.address, d.merchant.account.address, ASSET_FIAT, WISE_FIAT_PID,
    ]);
    assert.equal(active, false);
  });

  T("INT-03", "Alipay-CRYPTO 全链路完成，买家收币", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "alipay" });

    const order0 = await getOrderSnapshot(d, d.merchant.account.address, ALIPAY_CRYPTO_PID, ASSET_CRYPTO, 0n);
    assert.equal(order0.status, STATUS_PENDING);

    const built = await buildAlipayProofForCrypto(d, {
      productId: ALIPAY_CRYPTO_PID,
      orderId: 0n,
    });

    const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
    await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, ALIPAY_CRYPTO_PID, 0n, built.proofs,
    ]));
    const buyerAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);

    assert.equal(buyerAfter - buyerBefore, TRADE_AMOUNT);

    const active = await d.c2cEscrow.read.hasActiveOrder([
      d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, ALIPAY_CRYPTO_PID,
    ]);
    assert.equal(active, false);
  });

  T("INT-04", "Alipay-FIAT 全链路完成，商家收币", async (ctx) => {
    await placeFiatOrder(viem, d, { platform: "alipay" });

    const order0 = await getOrderSnapshot(d, d.merchant.account.address, ALIPAY_FIAT_PID, ASSET_FIAT, 0n);
    assert.equal(order0.status, STATUS_WAITING);

    const built = await buildAlipayProofForFiat(d, {
      productId: ALIPAY_FIAT_PID,
      orderId: 0n,
    });

    const merchantBefore = await d.usdt.read.balanceOf([d.merchant.account.address]);
    await sendTx(ctx, d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
      ALIPAY_FIAT_PID, 0n, built.proofs,
    ]));
    const merchantAfter = await d.usdt.read.balanceOf([d.merchant.account.address]);

    assert.equal(merchantAfter - merchantBefore, TRADE_AMOUNT);

    const buyerInfo = await d.c2cEscrow.read.getBuyerPaymentInfo([
      d.merchant.account.address, ALIPAY_FIAT_PID, 0n,
    ]);
    assert.equal(buyerInfo.isSet, false);

    const active = await d.c2cEscrow.read.hasActiveOrder([
      d.buyer.account.address, d.merchant.account.address, ASSET_FIAT, ALIPAY_FIAT_PID,
    ]);
    assert.equal(active, false);
  });

  T("INT-05", "deadline 前 1 秒可过，后 1 秒拒绝", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "wise" });

    const order0 = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
    const tNow0 = await nowTs(pc);
    const deltaBefore = Number((order0.deadline - 1n) - tNow0);
    if (deltaBefore > 0) {
      await advanceTime(testClient, deltaBefore);
    }

    const p0 = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
      dateMs: order0.deadline * 1000n,
    });

    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, p0.proofs,
    ]);

    await placeCryptoOrder(viem, d, { platform: "wise" });
    const order1 = await getOrderSnapshot(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 1n);

    const tNow1 = await nowTs(pc);
    const deltaAfter = Number((order1.deadline + 1n) - tNow1);
    if (deltaAfter > 0) {
      await advanceTime(testClient, deltaAfter);
    }

    const p1 = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 1n,
      dateMs: order1.deadline * 1000n,
    });

    await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 1n, p1.proofs,
    ]), "OutOfDeadline");
  });

  T("INT-06", "同 session 跨平台复用 -> SessionAlreadyUsed", async (ctx) => {
    const shared = `int6-shared-${Date.now()}`;

    await placeCryptoOrder(viem, d, { platform: "wise" });
    const wiseBuilt = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
      sessionIdContacts: nextSession(),
      sessionIdTransfer: shared,
    });

    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, wiseBuilt.proofs,
    ]);

    await placeCryptoOrder(viem, d, { platform: "alipay" });
    const alipayBuilt = await buildAlipayProofForCrypto(d, {
      productId: ALIPAY_CRYPTO_PID,
      orderId: 0n,
      sessionId: shared,
    });

    await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, ALIPAY_CRYPTO_PID, 0n, alipayBuilt.proofs,
    ]), "SessionAlreadyUsed");
  });

  T("INT-07", "跨链 proof 注入 -> WrongChainId", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "wise" });
    const built = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
      chainId: 1n,
    });

    await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
    ]), /(WrongChainId|unknown RPC error)/i);
  });

  T("INT-08", "批量挂单+cleanup 压力，状态和资金一致", async (ctx) => {
    const wallets = await viem.getWalletClients();
    const buyers = wallets.slice(3, 13);
    assert.equal(buyers.length, 10, "need 10 wallets for stress case");

    const escrowBefore = await d.usdt.read.balanceOf([d.c2cEscrow.address]);

    for (let i = 0; i < buyers.length; i++) {
      const platform = i < 5 ? "wise" : "alipay";
      const buyerEscrow = await escrowAs(viem, d, buyers[i]);
      const productId = platform === "wise" ? WISE_CRYPTO_PID : ALIPAY_CRYPTO_PID;
      await buyerEscrow.write.placeOrder([
        d.merchant.account.address,
        productId,
        ASSET_CRYPTO,
        TRADE_AMOUNT,
        NULL_BUYER_INFO,
      ]);
    }

    await advanceTime(testClient, Number(ORDER_TIMEOUT + 1n));

    await sendTx(ctx, d.c2cEscrow.write.cleanupProductExpired([
      d.merchant.account.address,
      WISE_CRYPTO_PID,
      ASSET_CRYPTO,
    ]));
    await d.c2cEscrow.write.cleanupProductExpired([
      d.merchant.account.address,
      ALIPAY_CRYPTO_PID,
      ASSET_CRYPTO,
    ]);

    for (let i = 0; i < buyers.length; i++) {
      const platform = i < 5 ? "wise" : "alipay";
      const pid = platform === "wise" ? WISE_CRYPTO_PID : ALIPAY_CRYPTO_PID;
      const active = await d.c2cEscrow.read.hasActiveOrder([
        buyers[i].account.address,
        d.merchant.account.address,
        ASSET_CRYPTO,
        pid,
      ]);
      assert.equal(active, false, `active order should be cleared: idx=${i}`);
    }

    const escrowAfter = await d.usdt.read.balanceOf([d.c2cEscrow.address]);
    assert.equal(escrowAfter, escrowBefore, "escrow balance should remain unchanged for expired CRYPTO pending orders");
  });

  T("INT-09", "改商家支付身份后，旧 hash proof 仍可通过", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "wise" });
    const platformWise: Hex = await d.tlsnVerifier.read.PLATFORM_WISE();

    await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
      platformWise,
      ALT_MERCHANT_NAME_HASH,
      ALT_MERCHANT_ID_HASH,
    ]);

    const built = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
      merchantNameHash: MERCHANT_NAME_HASH,
      merchantIdHash: MERCHANT_ID_HASH,
      payeeNameHash: MERCHANT_NAME_HASH,
      payeeIdHash: MERCHANT_ID_HASH,
    });

    await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
    ]));

    const active = await d.c2cEscrow.read.hasActiveOrder([
      d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
    ]);
    assert.equal(active, false);
  });

  T("INT-10", "下单后关门/下架，不影响已有订单结算", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "wise" });

    await d.adminAsMerchant.write.closeNow([WISE_CRYPTO_PID, ASSET_CRYPTO]);
    await d.escrowAsMerchant.write.inactiveProduct([WISE_CRYPTO_PID, ASSET_CRYPTO]);

    const built = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
    });

    await sendTx(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
    ]));

    const active = await d.c2cEscrow.read.hasActiveOrder([
      d.buyer.account.address, d.merchant.account.address, ASSET_CRYPTO, WISE_CRYPTO_PID,
    ]);
    assert.equal(active, false);
  });

  T("INT-11", "改支付身份后用新 hash proof 打旧单 -> OrderBindingHashMismatch", async (ctx) => {
    await placeCryptoOrder(viem, d, { platform: "wise" });
    const platformWise: Hex = await d.tlsnVerifier.read.PLATFORM_WISE();

    await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
      platformWise,
      ALT_MERCHANT_NAME_HASH,
      ALT_MERCHANT_ID_HASH,
    ]);

    const built = await buildWiseProofPairForCrypto(d, {
      productId: WISE_CRYPTO_PID,
      orderId: 0n,
      merchantNameHash: ALT_MERCHANT_NAME_HASH,
      merchantIdHash: ALT_MERCHANT_ID_HASH,
      payeeNameHash: ALT_MERCHANT_NAME_HASH,
      payeeIdHash: ALT_MERCHANT_ID_HASH,
    });

    await expectRevertTracked(ctx, d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, built.proofs,
    ]), "OrderBindingHashMismatch");
  });
});
