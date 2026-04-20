import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, zeroAddress } from "viem";

import { deployAll, type DeployResult } from "./helpers/deploy.js";
import {
  buildTLSNProof,
  buildKYBProof,
  buildWiseContactsProof,
  buildWiseTransferProof,
  buildAlipayProof,
  unixToAlipayDateString,
  encodePlatformParams,
} from "./helpers/buildTLSNProof.js";

describe("TLSNVerifier", async function () {
  const { viem } = await network.connect();
  let d: DeployResult;

  before(async () => {
    d = await deployAll(viem);
  });

  // ================================================================
  //  Admin Management
  // ================================================================

  describe("Admin transfer", async () => {
    it("should propose and accept admin", async () => {
      // Deploy a fresh verifier for this test
      const fresh = await viem.deployContract("TLSNVerifier");
      await fresh.write.proposeAdmin([d.newAdmin.account.address]);

      const freshAsNewAdmin = await viem.getContractAt(
        "TLSNVerifier",
        fresh.address,
        { client: { wallet: d.newAdmin } },
      );
      await freshAsNewAdmin.write.acceptAdmin();

      const currentAdmin = await fresh.read.admin();
      assert.equal(
        currentAdmin.toLowerCase(),
        d.newAdmin.account.address.toLowerCase(),
      );
    });

    it("should revert proposeAdmin from non-admin", async () => {
      const freshAsRandom = await viem.getContractAt(
        "TLSNVerifier",
        d.tlsnVerifier.address,
        { client: { wallet: d.randomUser } },
      );
      // Hardhat v3 cannot extract revert data from onlyAdmin modifier reverts via
      // revertWithCustomError; fall back to string/selector matching (same as C2CAdmin).
      try {
        await freshAsRandom.write.proposeAdmin([d.randomUser.account.address]);
        assert.fail("should have reverted with OnlyAdmin");
      } catch (err: any) {
        const msg = String(err);
        assert.ok(
          msg.includes("OnlyAdmin") || msg.includes("0x47556579"),
          `Expected OnlyAdmin revert, got: ${msg.slice(0, 300)}`,
        );
      }
    });

    it("should revert acceptAdmin from non-pending", async () => {
      const freshAsRandom = await viem.getContractAt(
        "TLSNVerifier",
        d.tlsnVerifier.address,
        { client: { wallet: d.randomUser } },
      );
      await viem.assertions.revertWithCustomError(
        freshAsRandom.write.acceptAdmin(),
        d.tlsnVerifier,
        "NotPendingAdmin",
      );
    });

    it("should revert proposeAdmin with zero address", async () => {
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.proposeAdmin([zeroAddress]),
        d.tlsnVerifier,
        "ZeroAddress",
      );
    });
  });

  // ================================================================
  //  Trusted Verifier Management
  // ================================================================

  describe("Trusted verifier management", async () => {
    it("should add trusted verifier", async () => {
      const addr = d.randomUser.account.address;
      await d.tlsnVerifier.write.addTrustedVerifier([addr]);
      const isTrusted = await d.tlsnVerifier.read.trustedVerifiers([addr]);
      assert.equal(isTrusted, true);
      // cleanup
      await d.tlsnVerifier.write.removeTrustedVerifier([addr]);
    });

    it("should remove trusted verifier", async () => {
      const addr = d.randomUser.account.address;
      await d.tlsnVerifier.write.addTrustedVerifier([addr]);
      await d.tlsnVerifier.write.removeTrustedVerifier([addr]);
      const isTrusted = await d.tlsnVerifier.read.trustedVerifiers([addr]);
      assert.equal(isTrusted, false);
    });

    it("should revert addTrustedVerifier from non-admin", async () => {
      const asRandom = await viem.getContractAt(
        "TLSNVerifier",
        d.tlsnVerifier.address,
        { client: { wallet: d.randomUser } },
      );
      // Same Hardhat v3 limitation as TLSN-02: use try-catch for onlyAdmin reverts.
      try {
        await asRandom.write.addTrustedVerifier([d.randomUser.account.address]);
        assert.fail("should have reverted with OnlyAdmin");
      } catch (err: any) {
        const msg = String(err);
        assert.ok(
          msg.includes("OnlyAdmin") || msg.includes("0x47556579"),
          `Expected OnlyAdmin revert, got: ${msg.slice(0, 300)}`,
        );
      }
    });
  });

  // ================================================================
  //  KYB Server Management
  // ================================================================

  describe("KYB server management", async () => {
    it("should add and remove KYB server", async () => {
      await viem.assertions.emit(
        d.tlsnVerifier.write.addTrustedKYBServer(["test.kyb.com"]),
        d.tlsnVerifier,
        "TrustedKYBServerAdded",
      );
      await viem.assertions.emit(
        d.tlsnVerifier.write.removeTrustedKYBServer(["test.kyb.com"]),
        d.tlsnVerifier,
        "TrustedKYBServerRemoved",
      );
    });
  });

  // ================================================================
  //  Authorized Caller
  // ================================================================

  describe("Authorized caller", async () => {
    it("should allow admin to set authorized caller", async () => {
      await d.tlsnVerifier.write.setAuthorizedCaller([
        d.randomUser.account.address,
        true,
      ]);
      const isAuth = await d.tlsnVerifier.read.authorizedCallers([
        d.randomUser.account.address,
      ]);
      assert.equal(isAuth, true);
      // cleanup
      await d.tlsnVerifier.write.setAuthorizedCaller([
        d.randomUser.account.address,
        false,
      ]);
    });

    it("should revert verifyProof from unauthorized caller", async () => {
      const asRandom = await viem.getContractAt(
        "TLSNVerifier",
        d.tlsnVerifier.address,
        { client: { wallet: d.randomUser } },
      );
      const proof = await buildKYBProof(d.verifierSigner, 31337n);
      await viem.assertions.revertWith(
        asRandom.write.verifyProof([proof]),
        "not authorized",
      );
    });
  });

  // ================================================================
  //  Proof Verification Core
  // ================================================================

  describe("Proof verification", async () => {
    it("should verify a valid proof", async () => {
      const proof = await buildKYBProof(d.verifierSigner, 31337n);
      // Call from admin (who is authorized)
      await viem.assertions.emit(
        d.tlsnVerifier.write.verifyProof([proof]),
        d.tlsnVerifier,
        "TLSNProofVerified",
      );
    });

    it("should revert on wrong chainId", async () => {
      const proof = await buildKYBProof(d.verifierSigner, 99999n);
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyProof([proof]),
        d.tlsnVerifier,
        "WrongChainId",
      );
    });

    it("should revert on duplicate sessionId", async () => {
      const proof1 = await buildTLSNProof({
        chainId: 31337n,
        sessionId: "duplicate-session",
        serverName: "kyb.example.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [
          {
            handlerType: "RECV",
            part: "BODY",
            value: '{"status":"verified"}',
            commitment_index: 0,
            start_item: 0,
            end_item: 21,
            start_value: 11,
            end_value: 19,
          },
        ],
      });

      // First call succeeds
      await d.tlsnVerifier.write.verifyProof([proof1]);

      // Build second proof with same sessionId but new blinders
      const proof2 = await buildTLSNProof({
        chainId: 31337n,
        sessionId: "duplicate-session",
        serverName: "kyb.example.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [
          {
            handlerType: "RECV",
            part: "BODY",
            value: '{"status":"verified"}',
            commitment_index: 0,
            start_item: 0,
            end_item: 21,
            start_value: 11,
            end_value: 19,
          },
        ],
      });

      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyProof([proof2]),
        d.tlsnVerifier,
        "SessionAlreadyUsed",
      );
    });

    it("should revert on tampered commitment opening", async () => {
      const proof = await buildKYBProof(d.verifierSigner, 31337n);
      // Tamper with the blinder
      const tampered = {
        ...proof,
        commitmentOpenings: [{ blinderHex: "0x" + "aa".repeat(32) as `0x${string}` }],
      };
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyProof([tampered]),
        d.tlsnVerifier,
        "CommitmentOpeningMismatch",
      );
    });

    it("should revert on tampered commitmentsHash", async () => {
      const proof = await buildKYBProof(d.verifierSigner, 31337n);
      const tampered = {
        ...proof,
        commitmentsHash: "0x" + "bb".repeat(32) as `0x${string}`,
      };
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyProof([tampered]),
        d.tlsnVerifier,
        "CommitmentsHashMismatch",
      );
    });

    it("should revert on untrusted verifier signature", async () => {
      // Sign with randomUser instead of verifierSigner
      const proof = await buildKYBProof(d.randomUser, 31337n);
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyProof([proof]),
        d.tlsnVerifier,
        "UntrustedVerifier",
      );
    });
  });

  // ================================================================
  //  KYB Verification
  // ================================================================

  describe("KYB verification", async () => {
    it("should verify valid KYB proof", async () => {
      const proof = await buildKYBProof(d.verifierSigner, 31337n);
      await d.tlsnVerifier.write.verifyKYB([proof]);
    });

    it("should revert when KYC status is not 'verified'", async () => {
      const proof = await buildTLSNProof({
        chainId: 31337n,
        sessionId: `kyb-fail-${Date.now()}`,
        serverName: "kyb.example.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [
          {
            handlerType: "RECV",
            part: "BODY",
            value: '{"status":"pending"}',
            commitment_index: 0,
            start_item: 0,
            end_item: 20,
            start_value: 11,
            end_value: 18,
          },
        ],
      });
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyKYB([proof]),
        d.tlsnVerifier,
        "KYCNotVerified",
      );
    });

    it("should revert when serverName is not trusted KYB", async () => {
      const proof = await buildTLSNProof({
        chainId: 31337n,
        sessionId: `kyb-badserver-${Date.now()}`,
        serverName: "evil.example.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [
          {
            handlerType: "RECV",
            part: "BODY",
            value: '{"status":"verified"}',
            commitment_index: 0,
            start_item: 0,
            end_item: 21,
            start_value: 11,
            end_value: 19,
          },
        ],
      });
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyKYB([proof]),
        d.tlsnVerifier,
        "NotTrustedKYBServer",
      );
    });

    it("should revert when revealedItems is empty", async () => {
      const proof = await buildTLSNProof({
        chainId: 31337n,
        sessionId: `kyb-empty-${Date.now()}`,
        serverName: "kyb.example.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [],
      });
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyKYB([proof]),
        d.tlsnVerifier,
        "MissingRevealedItems",
      );
    });
  });

  // ================================================================
  //  verifyAndDelegate — Generic Platform Delegation
  // ================================================================

  describe("verifyAndDelegate", async () => {
    const merchantName   = "KAI XU LOOI";
    const merchantHandle = "@kaixul1";
    const orderDeadline  = 9999999999n; // far future
    let wiseTransferCounter = 9000;
    function nextWiseTid() { return String(++wiseTransferCounter); }

    // ── Wise: buyer payment (CRYPTO product) ──────────────────────

    it("should verify Wise buyer payment via verifyAndDelegate", async () => {
      const PLATFORM_WISE = await d.tlsnVerifier.read.PLATFORM_WISE();
      const contactsProof = await buildWiseContactsProof(
        d.verifierSigner, 31337n, merchantName, merchantHandle,
      );
      const transferProof = await buildWiseTransferProof(
        d.verifierSigner, 31337n, "720", "CNY", nextWiseTid(),
      );
      const paramsData = encodePlatformParams(
        720000n, "CNY", orderDeadline,
      );
      await viem.assertions.emit(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_WISE, false, [contactsProof, transferProof], paramsData,
        ]),
        d.tlsnVerifier,
        "PlatformPaymentVerified",
      );
    });

    it("should verify Wise merchant sent via verifyAndDelegate", async () => {
      const PLATFORM_WISE = await d.tlsnVerifier.read.PLATFORM_WISE();
      const buyerName   = "ZHANG SAN";
      const buyerHandle = "@zhangsan";
      const contactsProof = await buildWiseContactsProof(
        d.verifierSigner, 31337n, buyerName, buyerHandle,
      );
      const transferProof = await buildWiseTransferProof(
        d.verifierSigner, 31337n, "360", "CNY", nextWiseTid(),
      );
      const paramsData = encodePlatformParams(
        360000n, "CNY", orderDeadline,
      );
      await viem.assertions.emit(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_WISE, true, [contactsProof, transferProof], paramsData,
        ]),
        d.tlsnVerifier,
        "PlatformPaymentVerified",
      );
    });

    it("should revert when platform is not registered", async () => {
      const UNKNOWN_PLATFORM = "0x" + "ab".repeat(32) as `0x${string}`;
      const transferProof = await buildWiseTransferProof(
        d.verifierSigner, 31337n, "100", "CNY", nextWiseTid(),
      );
      const paramsData = encodePlatformParams(
        100000n, "CNY", orderDeadline,
      );
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyAndDelegate([
          UNKNOWN_PLATFORM, false, [transferProof], paramsData,
        ]),
        d.tlsnVerifier,
        "PlatformNotRegistered",
      );
    });

    it("should revert when proof serverName is not trusted", async () => {
      const PLATFORM_WISE = await d.tlsnVerifier.read.PLATFORM_WISE();
      const badProof = await buildTLSNProof({
        chainId: 31337n,
        sessionId: `wise-bad-server-delegate-${Date.now()}`,
        serverName: "evil.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [
          { handlerType: "RECV", part: "ALL", value: `"title":"${merchantName}"`, commitment_index: 0, start_item: 0, end_item: 24, start_value: 0, end_value: 24 },
        ],
      });
      const paramsData = encodePlatformParams(
        720000n, "CNY", orderDeadline,
      );
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_WISE, false, [badProof], paramsData,
        ]),
        d.tlsnVerifier,
        "NotTrustedPaymentServer",
      );
    });

    it("should revert on Wise payment amount mismatch via delegate", async () => {
      const PLATFORM_WISE = await d.tlsnVerifier.read.PLATFORM_WISE();
      const contactsProof = await buildWiseContactsProof(
        d.verifierSigner, 31337n, merchantName, merchantHandle,
      );
      const transferProof = await buildWiseTransferProof(
        d.verifierSigner, 31337n, "720", "CNY", nextWiseTid(),
      );
      const paramsData = encodePlatformParams(
        99999n, "CNY", orderDeadline, // wrong amount
      );
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_WISE, false, [contactsProof, transferProof], paramsData,
        ]),
        d.wisePlatformVerifier,
        "PaymentAmountMismatch",
      );
    });

    it("should revert on Wise currency mismatch via delegate", async () => {
      const PLATFORM_WISE = await d.tlsnVerifier.read.PLATFORM_WISE();
      const contactsProof = await buildWiseContactsProof(
        d.verifierSigner, 31337n, merchantName, merchantHandle,
      );
      const transferProof = await buildWiseTransferProof(
        d.verifierSigner, 31337n, "720", "CNY", nextWiseTid(),
      );
      const paramsData = encodePlatformParams(
        720000n, "USD", orderDeadline, // wrong currency
      );
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_WISE, false, [contactsProof, transferProof], paramsData,
        ]),
        d.wisePlatformVerifier,
        "CurrencyMismatch",
      );
    });

    it("should revert when Wise transfer proof is missing required fields", async () => {
      const PLATFORM_WISE = await d.tlsnVerifier.read.PLATFORM_WISE();
      const contactsProof = await buildWiseContactsProof(
        d.verifierSigner, 31337n, merchantName, merchantHandle,
      );
      // Only has id — missing state, amount, currency, date
      const badTransferProof = await buildTLSNProof({
        chainId: 31337n,
        sessionId: `wise-few-transfer-delegate-${Date.now()}`,
        serverName: "wise.com",
        verifierWallet: d.verifierSigner,
        revealedItems: [
          { handlerType: "RECV", part: "BODY", value: `"id":999`, commitment_index: 0, start_item: 0, end_item: 8, start_value: 0, end_value: 8 },
        ],
      });
      const paramsData = encodePlatformParams(
        720000n, "CNY", orderDeadline,
      );
      await viem.assertions.revertWithCustomError(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_WISE, false, [contactsProof, badTransferProof], paramsData,
        ]),
        d.wisePlatformVerifier,
        "MissingWiseField",
      );
    });

    // ── Alipay: buyer payment (CRYPTO product) ────────────────────

    it("should verify Alipay buyer payment via verifyAndDelegate", async () => {
      const PLATFORM_ALIPAY = await d.tlsnVerifier.read.PLATFORM_ALIPAY();
      const publicClient = await viem.getPublicClient();
      const block = await publicClient.getBlock();
      const alipayProof = await buildAlipayProof(
        d.verifierSigner, 31337n,
        merchantName, "merchant@alipay.com",
        "250.00", `alipay-${Date.now()}`,
        unixToAlipayDateString(block.timestamp),
      );
      const paramsData = encodePlatformParams(
        250000n, "CNY", orderDeadline,
      );
      await viem.assertions.emit(
        d.tlsnVerifier.write.verifyAndDelegate([
          PLATFORM_ALIPAY, false, [alipayProof], paramsData,
        ]),
        d.tlsnVerifier,
        "PlatformPaymentVerified",
      );
    });
  });
});
