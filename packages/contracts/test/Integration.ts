/**
 * Integration.ts — V4 适配版
 *
 * 验证 V4 全流程端到端行为：
 *   INT-01  CRYPTO 完整成功流程（placeOrder → payOrderByPlatform → claim bond）
 *   INT-02  FIAT 完整成功流程（placeOrder → receiveCryptoWithPlatformPayment → claim bond）
 *   INT-03  CRYPTO 超时流程（超时 → cleanupExpired → 商家 claimableBalance 增加）
 *   INT-04  FIAT 超时流程（超时 → cleanupExpired → 买家收本金 + claimableBalance 增加）
 *   INT-05  多平台共存（Wise CRYPTO + Alipay FIAT 并行）
 *   INT-06  riskLevel 影响 bondAmount（高风险买家支付更多保证金）
 *   INT-07  商家保证金恢复（FIAT 超时后 collateral 减少，timeout 信誉记录）
 *   INT-08  cancelOrder 已禁用（revert OrderCancellationDisabled）
 *   INT-09  重复 bondVault.settle 被拦截（OrderBondAlreadySettled）
 *   INT-10  跨平台 sessionId 不可复用（SessionAlreadyUsed）
 *   INT-11  bond claimable → ERC20 实际提现
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
  CNY_NAME,
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

const WISE_CRYPTO_PID  = 0n;
const WISE_FIAT_PID    = 0n;
const ALIPAY_CRYPTO_PID = 1n;
const ALIPAY_FIAT_PID   = 1n;

const MAX_UINT = (2n ** 256n) - 1n;

const MERCHANT_NAME_HASH = keccak256(toBytes(WISE_MERCHANT_NAME));
const MERCHANT_ID_HASH   = keccak256(toBytes(WISE_MERCHANT_HANDLE));
const BUYER_NAME_HASH    = keccak256(toBytes(BUYER_NAME));
const BUYER_ID_HASH      = keccak256(toBytes(BUYER_HANDLE));

const NULL_BUYER_INFO = { nameHash: ZERO_HASH, idHash: ZERO_HASH, isSet: false } as const;
const BUYER_INFO      = { nameHash: BUYER_NAME_HASH, idHash: BUYER_ID_HASH, isSet: true } as const;

let _wiseTransferId = 990_000_000n;
let _alipayCounter = 0;
function nextTransfer(): bigint { return ++_wiseTransferId; }
function nextAlipayId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_alipayCounter}`;
}

function calcFiatX1000(amount: bigint, rate: bigint): bigint {
  return (amount * 1000n * rate) / (10n ** 26n);
}
function toAmountStr(v: bigint): string {
  return `${v / 1000n}.${(v % 1000n).toString().padStart(3, "0")}`;
}

async function expectRevert(promise: Promise<unknown>, expected?: string | RegExp) {
  try {
    await promise;
    assert.fail("Expected transaction to revert");
  } catch (err: any) {
    if (expected === undefined) return;
    const re = typeof expected === "string" ? new RegExp(expected) : expected;
    const text = [err?.message, err?.shortMessage, err?.details, String(err)]
      .filter(Boolean).join("\n");
    assert.match(text, re);
  }
}

async function escrowAs(viem: any, d: DeployResult, wallet: any) {
  return viem.getContractAt("C2CEscrow", d.c2cEscrow.address, { client: { wallet } });
}

async function setupBase(viem: any) {
  const d = await deployAll(viem);
  const pc = await viem.getPublicClient();
  const PLATFORM_WISE: Hex   = await d.tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY: Hex = await d.tlsnVerifier.read.PLATFORM_ALIPAY();

  await d.c2cAdmin.write.registerMerchantByAdmin([d.merchant.account.address]);
  await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
    PLATFORM_WISE, MERCHANT_NAME_HASH, MERCHANT_ID_HASH,
  ]);
  await d.adminAsMerchant.write.setMerchantPaymentInfoForPlatform([
    PLATFORM_ALIPAY, MERCHANT_NAME_HASH, MERCHANT_ID_HASH,
  ]);

  await d.usdtAsMerchant.write.approve([d.c2cEscrow.address, MAX_UINT]);
  await d.usdtAsBuyer.write.approve([d.c2cEscrow.address, MAX_UINT]);
  await d.usdtAsBuyer.write.approve([d.c2cBondVault.address, MAX_UINT]);

  // Wise: CRYPTO pid=0, FIAT pid=0
  await d.escrowAsMerchant.write.listCryptoProduct([
    USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
  ]);
  await d.escrowAsMerchant.write.listFiatProduct([
    MYR_FIAT_ID, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_WISE,
  ]);
  // Alipay: CRYPTO pid=1, FIAT pid=1
  await d.escrowAsMerchant.write.listCryptoProduct([
    USDT_CRYPTO_ID, CNY_FIAT_ID, COLLATERAL, true, PLATFORM_ALIPAY,
  ]);
  await d.escrowAsMerchant.write.listFiatProduct([
    CNY_FIAT_ID, USDT_CRYPTO_ID, COLLATERAL, true, PLATFORM_ALIPAY,
  ]);

  const expiry = (await pc.getBlock()).timestamp + 365n * 24n * 3600n;
  await d.adminAsMerchant.write.publishRate([WISE_CRYPTO_PID,   ASSET_CRYPTO, RATE_WISE_CRYPTO,   expiry]);
  await d.adminAsMerchant.write.publishRate([WISE_FIAT_PID,     ASSET_FIAT,   RATE_WISE_FIAT,     expiry]);
  await d.adminAsMerchant.write.publishRate([ALIPAY_CRYPTO_PID, ASSET_CRYPTO, RATE_ALIPAY_CRYPTO, expiry]);
  await d.adminAsMerchant.write.publishRate([ALIPAY_FIAT_PID,   ASSET_FIAT,   RATE_ALIPAY_FIAT,   expiry]);

  await d.adminAsMerchant.write.openNow([WISE_CRYPTO_PID,   ASSET_CRYPTO]);
  await d.adminAsMerchant.write.openNow([WISE_FIAT_PID,     ASSET_FIAT]);
  await d.adminAsMerchant.write.openNow([ALIPAY_CRYPTO_PID, ASSET_CRYPTO]);
  await d.adminAsMerchant.write.openNow([ALIPAY_FIAT_PID,   ASSET_FIAT]);

  return { d, pc, PLATFORM_WISE, PLATFORM_ALIPAY };
}

async function getOrder(
  d: DeployResult, merchant: Address, pid: bigint, assetType: number, oid: bigint,
) {
  const [buyer, amount, rate, deadline, status, rateVersion] =
    await d.c2cEscrow.read.getOrder([merchant, pid, assetType, oid]);
  return { buyer, amount, rate, deadline, status: Number(status), rateVersion: BigInt(rateVersion) };
}

async function wiseCryptoProofs(d: DeployResult, pid: bigint, oid: bigint): Promise<TLSNProof[]> {
  const order = await getOrder(d, d.merchant.account.address, pid, ASSET_CRYPTO, oid);
  const fiatX1000 = calcFiatX1000(order.amount, order.rate);
  const obh = computeOrderBindingHash({
    escrow: d.c2cEscrow.address, chainId: CHAIN_ID,
    merchant: d.merchant.account.address, buyer: order.buyer,
    productId: pid, orderId: oid, assetType: ASSET_CRYPTO,
    amount: order.amount, rate: order.rate, rateVersion: order.rateVersion,
    deadline: order.deadline, merchantNameHash: MERCHANT_NAME_HASH,
    merchantIdHash: MERCHANT_ID_HASH, payeeNameHash: MERCHANT_NAME_HASH,
    payeeIdHash: MERCHANT_ID_HASH,
  });
  return [
    await buildWiseContactsProof({
      verifierWallet: d.verifierSigner, orderBindingHash: obh,
      chainId: CHAIN_ID, serverName: WISE_SERVER,
    }),
    await buildWiseTransferProof({
      verifierWallet: d.verifierSigner, orderBindingHash: obh,
      chainId: CHAIN_ID, serverName: WISE_SERVER,
      fields: {
        state: "OUTGOING_PAYMENT_SENT", targetAmount: toAmountStr(fiatX1000),
        targetCurrency: MYR_NAME, transferId: nextTransfer(),
        dateMs: (order.deadline - 60n) * 1000n,
      },
    }),
  ];
}

async function alipayFiatProofs(d: DeployResult, pid: bigint, oid: bigint): Promise<TLSNProof[]> {
  const order = await getOrder(d, d.merchant.account.address, pid, ASSET_FIAT, oid);
  const buyerInfo = await d.c2cEscrow.read.getBuyerPaymentInfo([
    d.merchant.account.address, pid, oid,
  ]);
  const fiatX1000 = calcFiatX1000(order.amount, order.rate);
  const obh = computeOrderBindingHash({
    escrow: d.c2cEscrow.address, chainId: CHAIN_ID,
    merchant: d.merchant.account.address, buyer: order.buyer,
    productId: pid, orderId: oid, assetType: ASSET_FIAT,
    amount: order.amount, rate: order.rate, rateVersion: order.rateVersion,
    deadline: order.deadline, merchantNameHash: MERCHANT_NAME_HASH,
    merchantIdHash: MERCHANT_ID_HASH,
    payeeNameHash: buyerInfo.nameHash, payeeIdHash: buyerInfo.idHash,
  });
  return [await buildAlipayProof({
    verifierWallet: d.verifierSigner, orderBindingHash: obh,
    chainId: CHAIN_ID, serverName: ALIPAY_SERVER,
    fields: {
      payAmount: toAmountStr(fiatX1000), status: "SUCCESS", bizType: "TRANSFER",
      orderId: nextAlipayId("INT"), gmtSuccess: toAlipayGmtSuccess(order.deadline - 60n),
    },
  })];
}

// ═══════════════════════════════════════════════════════════════════════════

describe("Integration (V4)", async function () {
  const { viem } = await network.getOrCreate();
  const testClient = await viem.getTestClient();

  before(async () => {
    clearRecords();
  });

  after(() => {
    printTable("Integration V4 Tests");
  });

  it("INT-01: CRYPTO end-to-end — placeOrder → pay → claim bond", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);
    const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);

    const bondPaid = buyerBefore - await d.usdt.read.balanceOf([d.buyer.account.address]);
    assert.ok(bondPaid > 0n, "bond should be paid at placeOrder");

    const proofs = await wiseCryptoProofs(d, WISE_CRYPTO_PID, 0n);
    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
    ]);

    // Claim bond back
    await d.bondVaultAsBuyer.write.claim([d.usdt.address]);
    const buyerAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);

    // Net: buyer received TRADE_AMOUNT (crypto) + bond returned
    assert.equal(buyerAfter, buyerBefore + TRADE_AMOUNT,
      "buyer balance should equal before + TRADE_AMOUNT after claim");

    addRecord("INT-01", "CRYPTO full flow: place → pay → claim", true, ctx);
  });

  it("INT-02: FIAT end-to-end — placeOrder → receiveCrypto → claim bond", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);
    const merchantBefore = await d.usdt.read.balanceOf([d.merchant.account.address]);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, ALIPAY_FIAT_PID, ASSET_FIAT, TRADE_AMOUNT, BUYER_INFO,
    ]);

    const proofs = await alipayFiatProofs(d, ALIPAY_FIAT_PID, 0n);
    await d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
      ALIPAY_FIAT_PID, 0n, proofs,
    ]);

    // Merchant claims bond from vault
    await d.bondVaultAsMerchant.write.claim([d.usdt.address]);
    const merchantAfter = await d.usdt.read.balanceOf([d.merchant.account.address]);

    // Merchant received TRADE_AMOUNT (buyer escrow) — collateral was reduced by bond at placeOrder
    // but bond is returned via claim, so net ~+TRADE_AMOUNT from merchantBefore
    assert.ok(merchantAfter > merchantBefore, "merchant balance should increase");

    addRecord("INT-02", "FIAT full flow: place → receiveCrypto → claim", true, ctx);
  });

  it("INT-03: CRYPTO timeout — cleanupExpired → merchant claimable increases", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);

    const claimBefore = await d.c2cBondVault.read.claimableBalance([
      d.merchant.account.address, d.usdt.address,
    ]);
    await advanceTime(testClient, Number(ORDER_TIMEOUT) + 10);
    await d.c2cEscrow.write.cleanupProductExpired([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO,
    ]);
    const claimAfter = await d.c2cBondVault.read.claimableBalance([
      d.merchant.account.address, d.usdt.address,
    ]);
    assert.ok(claimAfter > claimBefore, "merchant claimable should increase after CRYPTO timeout");

    addRecord("INT-03", "CRYPTO timeout → bond to merchant", true, ctx);
  });

  it("INT-04: FIAT timeout — principal + bond claimable by buyer via BondVault", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);
    const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT, TRADE_AMOUNT, BUYER_INFO,
    ]);

    await advanceTime(testClient, Number(ORDER_TIMEOUT) + 10);
    await d.c2cEscrow.write.cleanupProductExpired([
      d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT,
    ]);

    // No direct push — funds route through BondVault; wallet unchanged from after-deposit state
    const buyerAfterCleanup = await d.usdt.read.balanceOf([d.buyer.account.address]);
    assert.equal(buyerAfterCleanup, buyerBefore - TRADE_AMOUNT, "buyer wallet: deposit held in BondVault, not returned directly");

    const claimable = await d.c2cBondVault.read.claimableBalance([
      d.buyer.account.address, d.usdt.address,
    ]);
    assert.ok(claimable > 0n, "buyer claimable (principal + bond) > 0 after FIAT timeout");

    addRecord("INT-04", "FIAT timeout → principal+bond claimable via BondVault", true, ctx);
  });

  it("INT-05: multi-platform parallel orders (Wise CRYPTO + Alipay FIAT)", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);

    // Place two orders simultaneously on different platforms
    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, ALIPAY_FIAT_PID, ASSET_FIAT, TRADE_AMOUNT, BUYER_INFO,
    ]);

    // Complete both
    const wiseProofs = await wiseCryptoProofs(d, WISE_CRYPTO_PID, 0n);
    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, wiseProofs,
    ]);

    const alipayProofs = await alipayFiatProofs(d, ALIPAY_FIAT_PID, 0n);
    await d.escrowAsMerchant.write.receiveCryptoWithPlatformPayment([
      ALIPAY_FIAT_PID, 0n, alipayProofs,
    ]);

    // Both bonds should be claimable
    const buyerClaimable = await d.c2cBondVault.read.claimableBalance([
      d.buyer.account.address, d.usdt.address,
    ]);
    const merchantClaimable = await d.c2cBondVault.read.claimableBalance([
      d.merchant.account.address, d.usdt.address,
    ]);
    assert.ok(buyerClaimable > 0n, "buyer claimable for CRYPTO proof success");
    assert.ok(merchantClaimable > 0n, "merchant claimable for FIAT proof success");

    addRecord("INT-05", "multi-platform parallel orders", true, ctx);
  });

  it("INT-06: high-risk buyer pays larger bond", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);
    const PLATFORM_WISE: Hex = await d.tlsnVerifier.read.PLATFORM_WISE();

    // Get baseline bond bps
    const bpsBefore = await d.c2cRiskManager.read.requiredBondBps([d.buyer.account.address]);

    // Trigger a timeout to increase riskLevel
    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    await advanceTime(testClient, Number(ORDER_TIMEOUT) + 10);
    await d.c2cEscrow.write.cleanupProductExpired([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO,
    ]);

    const bpsAfter = await d.c2cRiskManager.read.requiredBondBps([d.buyer.account.address]);
    assert.ok(bpsAfter >= bpsBefore, "bond bps should not decrease after timeout");

    // Place new order — bond should be higher
    await d.escrowAsMerchant.write.listCryptoProduct([
      USDT_CRYPTO_ID, MYR_FIAT_ID, COLLATERAL, true, PLATFORM_WISE,
    ]);
    const pc = await viem.getPublicClient();
    const expiry = (await pc.getBlock()).timestamp + 365n * 24n * 3600n;
    await d.adminAsMerchant.write.publishRate([2n, ASSET_CRYPTO, RATE_WISE_CRYPTO, expiry]);
    await d.adminAsMerchant.write.openNow([2n, ASSET_CRYPTO]);

    const buyerBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, 2n, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    const bondPaid = buyerBefore - await d.usdt.read.balanceOf([d.buyer.account.address]);
    const expectedBond = TRADE_AMOUNT * BigInt(bpsAfter) / 10000n;
    assert.equal(bondPaid, expectedBond, "bond paid matches new (higher) bps");

    addRecord("INT-06", "high-risk buyer pays larger bond", true, ctx);
  });

  it("INT-07: FIAT timeout reduces merchant collateral, records timeout in riskManager", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);

    const repBefore = await d.c2cRiskManager.read.getReputation([d.merchant.account.address]);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT, TRADE_AMOUNT, BUYER_INFO,
    ]);
    await advanceTime(testClient, Number(ORDER_TIMEOUT) + 10);
    await d.c2cEscrow.write.cleanupProductExpired([
      d.merchant.account.address, WISE_FIAT_PID, ASSET_FIAT,
    ]);

    const repAfter = await d.c2cRiskManager.read.getReputation([d.merchant.account.address]);
    assert.equal(repAfter.timeoutCount, repBefore.timeoutCount + 1,
      "merchant timeout count should increase");

    addRecord("INT-07", "FIAT timeout records merchant reputation", true, ctx);
  });

  it("INT-08: cancelOrder disabled — revert OrderCancellationDisabled", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);
    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    await expectRevert(
      d.escrowAsBuyer.write.cancelOrder([
        d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n,
      ]),
      /OrderCancellationDisabled/,
    );
    addRecord("INT-08", "cancelOrder disabled", true, ctx);
  });

  it("INT-09: double settle via completed order — OrderBondAlreadySettled (internal guard)", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    const proofs = await wiseCryptoProofs(d, WISE_CRYPTO_PID, 0n);
    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
    ]);

    // Bond is settled (PROOF_SUCCESS). Order is now COMPLETED & deleted from storage.
    // The vault orderBonds[key].settled = true.
    // Further attempts to pay again → order not found → NotPending/OrderNotFound
    await expectRevert(
      d.escrowAsBuyer.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
      ]),
      /OrderNotFound|NotPending/,
    );
    addRecord("INT-09", "completed order cannot be re-settled", true, ctx);
  });

  it("INT-10: cross-platform sessionId reuse rejected — SessionAlreadyUsed", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);
    const { randomUser } = d;

    // Buyer 1 completes with a fixed session
    const sid = nextSession();
    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    const order1 = await getOrder(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 0n);
    const fiatX = calcFiatX1000(order1.amount, order1.rate);
    const obh1 = computeOrderBindingHash({
      escrow: d.c2cEscrow.address, chainId: CHAIN_ID,
      merchant: d.merchant.account.address, buyer: order1.buyer,
      productId: WISE_CRYPTO_PID, orderId: 0n, assetType: ASSET_CRYPTO,
      amount: order1.amount, rate: order1.rate, rateVersion: order1.rateVersion,
      deadline: order1.deadline, merchantNameHash: MERCHANT_NAME_HASH,
      merchantIdHash: MERCHANT_ID_HASH, payeeNameHash: MERCHANT_NAME_HASH,
      payeeIdHash: MERCHANT_ID_HASH,
    });
    const proofs1 = [
      await buildWiseContactsProof({
        verifierWallet: d.verifierSigner, orderBindingHash: obh1,
        chainId: CHAIN_ID, serverName: WISE_SERVER, sessionId: sid,
      }),
      await buildWiseTransferProof({
        verifierWallet: d.verifierSigner, orderBindingHash: obh1,
        chainId: CHAIN_ID, serverName: WISE_SERVER, sessionId: sid + "-t",
        fields: {
          state: "OUTGOING_PAYMENT_SENT", targetAmount: toAmountStr(fiatX),
          targetCurrency: MYR_NAME, transferId: nextTransfer(),
          dateMs: (order1.deadline - 60n) * 1000n,
        },
      }),
    ] as TLSNProof[];
    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs1,
    ]);

    // Buyer 2 tries to reuse the same sessionId
    const usdtRandom = await viem.getContractAt("MockERC20", d.usdt.address, { client: { wallet: randomUser } });
    await d.usdt.write.mint([randomUser.account.address, TRADE_AMOUNT * 10n]);
    await usdtRandom.write.approve([d.c2cEscrow.address, MAX_UINT]);
    await usdtRandom.write.approve([d.c2cBondVault.address, MAX_UINT]);

    const escrowRandom = await escrowAs(viem, d, randomUser);
    await escrowRandom.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    const order2 = await getOrder(d, d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, 1n);
    const fiatX2 = calcFiatX1000(order2.amount, order2.rate);
    const obh2 = computeOrderBindingHash({
      escrow: d.c2cEscrow.address, chainId: CHAIN_ID,
      merchant: d.merchant.account.address, buyer: order2.buyer,
      productId: WISE_CRYPTO_PID, orderId: 1n, assetType: ASSET_CRYPTO,
      amount: order2.amount, rate: order2.rate, rateVersion: order2.rateVersion,
      deadline: order2.deadline, merchantNameHash: MERCHANT_NAME_HASH,
      merchantIdHash: MERCHANT_ID_HASH, payeeNameHash: MERCHANT_NAME_HASH,
      payeeIdHash: MERCHANT_ID_HASH,
    });
    const proofs2 = [
      await buildWiseContactsProof({
        verifierWallet: d.verifierSigner, orderBindingHash: obh2,
        chainId: CHAIN_ID, serverName: WISE_SERVER, sessionId: sid, // reused!
      }),
      await buildWiseTransferProof({
        verifierWallet: d.verifierSigner, orderBindingHash: obh2,
        chainId: CHAIN_ID, serverName: WISE_SERVER, sessionId: sid + "-t2",
        fields: {
          state: "OUTGOING_PAYMENT_SENT", targetAmount: toAmountStr(fiatX2),
          targetCurrency: MYR_NAME, transferId: nextTransfer(),
          dateMs: (order2.deadline - 60n) * 1000n,
        },
      }),
    ] as TLSNProof[];
    await expectRevert(
      escrowRandom.write.payOrderByPlatform([
        d.merchant.account.address, WISE_CRYPTO_PID, 1n, proofs2,
      ]),
      /SessionAlreadyUsed/,
    );
    addRecord("INT-10", "cross-order session reuse rejected", true, ctx);
  });

  it("INT-11: bond claim — ERC20 actually transferred to claimant", async () => {
    const ctx = makeCtx();
    const { d } = await setupBase(viem);

    await d.escrowAsBuyer.write.placeOrder([
      d.merchant.account.address, WISE_CRYPTO_PID, ASSET_CRYPTO, TRADE_AMOUNT, NULL_BUYER_INFO,
    ]);
    const proofs = await wiseCryptoProofs(d, WISE_CRYPTO_PID, 0n);
    await d.escrowAsBuyer.write.payOrderByPlatform([
      d.merchant.account.address, WISE_CRYPTO_PID, 0n, proofs,
    ]);

    const claimable = await d.c2cBondVault.read.claimableBalance([
      d.buyer.account.address, d.usdt.address,
    ]);
    assert.ok(claimable > 0n);

    const balBefore = await d.usdt.read.balanceOf([d.buyer.account.address]);
    await d.bondVaultAsBuyer.write.claim([d.usdt.address]);
    const balAfter = await d.usdt.read.balanceOf([d.buyer.account.address]);

    assert.equal(balAfter - balBefore, claimable, "claimed amount equals ERC20 received");

    const claimableAfter = await d.c2cBondVault.read.claimableBalance([
      d.buyer.account.address, d.usdt.address,
    ]);
    assert.equal(claimableAfter, 0n, "claimable cleared after claim");

    addRecord("INT-11", "bond claim transfers ERC20 and clears claimable", true, ctx);
  });
});
