/**
 * Deploy all C2C platform contracts and write addresses to packages/web/.env.local.
 *
 * Usage:
 *   # Terminal 1 — start local node (keep running)
 *   cd packages/contracts && npx hardhat node --network hardhatMainnet
 *
 *   # Terminal 2 — deploy
 *   cd packages/contracts && npm run deploy:web
 *
 * The script preserves all existing non-contract variables in .env.local and
 * only updates the NEXT_PUBLIC_* contract address lines.
 */

import { network } from "hardhat";
import { parseUnits, keccak256, toBytes } from "viem";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Asset registry — single source of truth shared with the web app ─────────
const ASSETS_PATH = path.resolve(__dirname, "../../web/src/config/assets.json");
type CryptoEntry = { symbol: string; displayName: string; coingeckoId: string; onChain: { id: number; decimals: number } | null };
type FiatEntry   = { symbol: string; displayName: string; coingeckoVs: string; onChain: { id: number } | null };
const assets = JSON.parse(fs.readFileSync(ASSETS_PATH, "utf-8")) as { crypto: CryptoEntry[]; fiat: FiatEntry[] };
const onChainCryptos = assets.crypto.filter((c): c is CryptoEntry & { onChain: { id: number; decimals: number } } => c.onChain !== null);
const onChainFiats   = assets.fiat.filter((f): f is FiatEntry & { onChain: { id: number } } => f.onChain !== null);

// Rust verifier server signing address (from packages/verifier/.env VERIFIER_PRIVATE_KEY)
// Private key 0x2a871d…09c6 → Hardhat default account[9]
const VERIFIER_SIGNER_ADDRESS = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";

const COLLATERAL_18 = parseUnits("100", 18);   // 100 USDT collateral per product
const MINT_AMOUNT_18 = parseUnits("500", 18);  // 500 USDT minted per account
const MINT_AMOUNT_6  = parseUnits("500",  6);  // 500 USDC minted per account
const MAX_ORDER_AMOUNT = parseUnits("1000000", 18);  // 1M USDT global cap (avoids placeOrder revert)
const MAX_UINT256 = (2n ** 256n) - 1n;
const RATE_CNY = 1_000_000n;                   // 0.01 CNY / USDT (RATE_PRECISION_EXP = 8)
const RATE_MYR = 2_000_000n;                   // 0.02 MYR / USDT
const MERCHANT_WISE_NAME     = "KAI XU LOOI";
const MERCHANT_WISE_HANDLE   = "@kaixul1";
const MERCHANT_ALIPAY_NAME   = "* LIM HOOI YEN";
const MERCHANT_ALIPAY_HANDLE = "kel***@hotmail.com";

// Risk config (matches thesis defaults; reset/freeze/reward/decay per user spec):
//   min=500 bps (5%), base=1000 bps (10%), max=10000 bps (100%), step=300 bps (3% per level)
//   reset=5, freezeThreshold=3, rewardThreshold=10, decayIntervalDays=1
const RISK_MIN    = 500;
const RISK_BASE   = 1000;
const RISK_MAX    = 10000;
const RISK_STEP   = 300;
const RISK_RESET  = 5;
const RISK_FREEZE = 3;
const RISK_REWARD = 10;
const RISK_DECAY  = 1;

const TRUSTED_KYB_SERVERS = ["kyb.example.com"];
const TRUSTED_PAYMENT_SERVERS = ["wise.com", "mbillexprod.alipay.com"];

async function main() {
  const { viem } = await network.connect();

  console.log("=== C2C Web Deployment ===\n");

  // ── 1. MockERC20 tokens (driven by assets.json) ──────────────────────────
  const tokens: Record<string, Awaited<ReturnType<typeof viem.deployContract>>> = {};
  for (const [i, c] of onChainCryptos.entries()) {
    if (c.onChain.id !== i) {
      throw new Error(`assets.json: crypto "${c.symbol}".onChain.id (${c.onChain.id}) ≠ on-chain array index ${i}`);
    }
    tokens[c.symbol] = await viem.deployContract("MockERC20", [c.displayName, c.symbol, c.onChain.decimals]);
    console.log(`MockERC20 (${c.symbol}):`.padEnd(24), tokens[c.symbol].address);
  }
  // Keep familiar aliases so the rest of this script stays readable.
  const usdt = tokens["USDT"];
  const usdc = tokens["USDC"];

  // ── 2. TLSNVerifier ───────────────────────────────────────────────────────
  const tlsnVerifier = await viem.deployContract("TLSNVerifier");
  console.log("TLSNVerifier:          ", tlsnVerifier.address);

  // ── 3. C2CAdmin ───────────────────────────────────────────────────────────
  const c2cAdmin = await viem.deployContract("C2CAdmin", [tlsnVerifier.address]);
  console.log("C2CAdmin:              ", c2cAdmin.address);

  // ── 4. C2CEscrow ──────────────────────────────────────────────────────────
  const c2cEscrow = await viem.deployContract("C2CEscrow", [
    c2cAdmin.address,
    tlsnVerifier.address,
  ]);
  console.log("C2CEscrow:             ", c2cEscrow.address);

  // ── 5. C2CBondVault ───────────────────────────────────────────────────────
  const c2cBondVault = await viem.deployContract("C2CBondVault", [c2cAdmin.address]);
  console.log("C2CBondVault:          ", c2cBondVault.address);

  // ── 6. C2CRiskManager ─────────────────────────────────────────────────────
  const c2cRiskManager = await viem.deployContract("C2CRiskManager", [c2cAdmin.address]);
  console.log("C2CRiskManager:        ", c2cRiskManager.address);

  // ── 7. WisePlatformVerifier + AlipayPlatformVerifier ──────────────────────
  const wisePlatformVerifier = await viem.deployContract("WisePlatformVerifier", [
    tlsnVerifier.address,
  ]);
  const alipayPlatformVerifier = await viem.deployContract("AlipayPlatformVerifier", [
    tlsnVerifier.address,
  ]);
  console.log("WisePlatformVerifier:  ", wisePlatformVerifier.address);
  console.log("AlipayPlatformVerifier:", alipayPlatformVerifier.address);

  // ── 8. Cross-contract authorization ───────────────────────────────────────
  await tlsnVerifier.write.setAuthorizedCaller([c2cAdmin.address, true]);
  await tlsnVerifier.write.setAuthorizedCaller([c2cEscrow.address, true]);
  await c2cAdmin.write.setAuthorizedCaller([c2cEscrow.address, true]);
  console.log("\n✅ Cross-contract authorization configured");

  await c2cBondVault.write.setEscrow([c2cEscrow.address]);
  await c2cRiskManager.write.setEscrow([c2cEscrow.address]);
  await c2cEscrow.write.setManagers([c2cRiskManager.address, c2cBondVault.address]);
  console.log("✅ V4 manager wiring configured (BondVault + RiskManager)");

  // ── 9. Trusted verifier ───────────────────────────────────────────────────
  await tlsnVerifier.write.addTrustedVerifier([VERIFIER_SIGNER_ADDRESS]);
  console.log("✅ Trusted verifier added:", VERIFIER_SIGNER_ADDRESS);

  // ── 10. Trusted servers ───────────────────────────────────────────────────
  for (const server of TRUSTED_KYB_SERVERS) {
    await tlsnVerifier.write.addTrustedKYBServer([server]);
  }
  for (const server of TRUSTED_PAYMENT_SERVERS) {
    await tlsnVerifier.write.addTrustedPaymentServer([server]);
  }
  console.log("✅ Trusted servers:", [...TRUSTED_KYB_SERVERS, ...TRUSTED_PAYMENT_SERVERS].join(", "));

  // ── 11. Platform verifiers ────────────────────────────────────────────────
  const PLATFORM_WISE = await tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY = await tlsnVerifier.read.PLATFORM_ALIPAY();
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_WISE, wisePlatformVerifier.address]);
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_ALIPAY, alipayPlatformVerifier.address]);
  console.log("✅ Platform verifiers registered (Wise + Alipay)");

  // ── 12. Register supported assets (driven by assets.json) ───────────────
  for (const c of onChainCryptos) {
    await c2cAdmin.write.addCryptoInfo([tokens[c.symbol].address, true]);
  }
  for (const [i, f] of onChainFiats.entries()) {
    if (f.onChain.id !== i) {
      throw new Error(`assets.json: fiat "${f.symbol}".onChain.id (${f.onChain.id}) ≠ on-chain array index ${i}`);
    }
    await c2cAdmin.write.addFiatInfo([f.symbol, true]);
  }
  console.log("✅ Assets registered from assets.json:",
    onChainCryptos.map((c, i) => `${c.symbol}(c=${i})`).join(", "), "|",
    onChainFiats.map((f, i) => `${f.symbol}(f=${i})`).join(", "),
  );

  // ── 13. Fetch all node wallets ────────────────────────────────────────────
  const nodeWallets  = await viem.getWalletClients();
  const merchantWallet = nodeWallets[1];
  const merchantAddr   = merchantWallet.account.address;
  // accounts[0]=admin, [1-3]=merchants, [4-8]=users, [9]=verifier signer
  const allAccounts = nodeWallets.slice(0, 10).map((w) => w.account.address);
  const userWallets = nodeWallets.slice(4, 9);
  console.log("\nMerchant:", merchantAddr);
  console.log(`Minting to ${allAccounts.length} accounts...`);

  // ── 14. Mint USDT + USDC to accounts[0-9] ────────────────────────────────
  for (const addr of allAccounts) {
    await usdt.write.mint([addr, MINT_AMOUNT_18]);
    await usdc.write.mint([addr, MINT_AMOUNT_6]);
  }
  console.log("✅ Minted 500 USDT + 500 USDC to all 10 accounts");

  // ── 15. Approve escrow + BondVault for every account[0..9] ──────────────
  //   - escrow approve: required for FIAT placeOrder (locks token in escrow)
  //   - BondVault approve: required for CRYPTO placeOrder (pulls bond into vault)
  // Pre-approving both for ALL accounts removes the extra MetaMask popup at
  // order time and ensures placeOrder eth_estimateGas doesn't fail because of
  // a missing allowance.
  const approveWallets = nodeWallets.slice(0, 10);
  for (const w of approveWallets) {
    const usdtAs = await viem.getContractAt("MockERC20", usdt.address, { client: { wallet: w } });
    const usdcAs = await viem.getContractAt("MockERC20", usdc.address, { client: { wallet: w } });
    await usdtAs.write.approve([c2cEscrow.address,    MAX_UINT256]);
    await usdcAs.write.approve([c2cEscrow.address,    MAX_UINT256]);
    await usdtAs.write.approve([c2cBondVault.address, MAX_UINT256]);
    await usdcAs.write.approve([c2cBondVault.address, MAX_UINT256]);
  }
  console.log("✅ All 10 accounts approved Escrow + BondVault for USDT + USDC");

  // ── 16. Merchant setup (accounts[1]) ─────────────────────────────────────
  await c2cAdmin.write.registerMerchantByAdmin([merchantAddr]);

  const usdtAsM   = await viem.getContractAt("MockERC20", usdt.address, { client: { wallet: merchantWallet } });
  const usdcAsM   = await viem.getContractAt("MockERC20", usdc.address, { client: { wallet: merchantWallet } });
  const adminAsM  = await viem.getContractAt("C2CAdmin",  c2cAdmin.address,  { client: { wallet: merchantWallet } });
  const escrowAsM = await viem.getContractAt("C2CEscrow", c2cEscrow.address, { client: { wallet: merchantWallet } });

  await usdtAsM.write.approve([c2cEscrow.address, MAX_UINT256]);
  await usdcAsM.write.approve([c2cEscrow.address, MAX_UINT256]);

  // Wise payment info
  const wNameHash = keccak256(toBytes(MERCHANT_WISE_NAME));
  const wIdHash   = keccak256(toBytes(MERCHANT_WISE_HANDLE));
  await (adminAsM.write as any).setMerchantPaymentInfoForPlatform([PLATFORM_WISE, wNameHash, wIdHash]);

  // Alipay payment info (literal strings, including the leading "* " and "***")
  const aNameHash = keccak256(toBytes(MERCHANT_ALIPAY_NAME));
  const aIdHash   = keccak256(toBytes(MERCHANT_ALIPAY_HANDLE));
  await (adminAsM.write as any).setMerchantPaymentInfoForPlatform([PLATFORM_ALIPAY, aNameHash, aIdHash]);
  console.log("✅ Merchant registered + Wise + Alipay payment info set");

  // ── 17. List 4 products (all USDT collateral) ────────────────────────────
  //   CRYPTO #0: USDT(0) + MYR(0) + Wise   → buyer pays MYR via Wise, gets USDT
  //   CRYPTO #1: USDT(0) + CNY(1) + Alipay → buyer pays CNY via Alipay, gets USDT
  //   FIAT  #0: MYR(0)  + USDT(0) + Wise   → user locks USDT, merchant pays MYR via Wise
  //   FIAT  #1: CNY(1)  + USDT(0) + Alipay → user locks USDT, merchant pays CNY via Alipay
  await (escrowAsM.write as any).listCryptoProduct([0n, 0n, COLLATERAL_18, true, PLATFORM_WISE]);    // CRYPTO #0
  await (escrowAsM.write as any).listCryptoProduct([0n, 1n, COLLATERAL_18, true, PLATFORM_ALIPAY]);  // CRYPTO #1
  await (escrowAsM.write as any).listFiatProduct(  [0n, 0n, COLLATERAL_18, true, PLATFORM_WISE]);    // FIAT   #0
  await (escrowAsM.write as any).listFiatProduct(  [1n, 0n, COLLATERAL_18, true, PLATFORM_ALIPAY]);  // FIAT   #1
  console.log("✅ Listed 4 products: Wise×MYR (CRYPTO+FIAT), Alipay×CNY (CRYPTO+FIAT)");

  // Publish rates (RATE_PRECISION_EXP=8): Wise→4.70 MYR/USDT, Alipay→7.24 CNY/USDT
  await (adminAsM.write as any).publishRate([0n, 0, RATE_MYR, 0n]);  // CRYPTO #0 Wise-MYR
  await (adminAsM.write as any).publishRate([1n, 0, RATE_CNY, 0n]);  // CRYPTO #1 Alipay-CNY
  await (adminAsM.write as any).publishRate([0n, 1, RATE_MYR, 0n]);  // FIAT   #0 Wise-MYR
  await (adminAsM.write as any).publishRate([1n, 1, RATE_CNY, 0n]);  // FIAT   #1 Alipay-CNY
  console.log("✅ Rates published: 0.02 MYR/USDT (Wise), 0.01 CNY/USDT (Alipay)");

  // Open all 4 products
  await (adminAsM.write as any).openNow([0n, 0]);
  await (adminAsM.write as any).openNow([1n, 0]);
  await (adminAsM.write as any).openNow([0n, 1]);
  await (adminAsM.write as any).openNow([1n, 1]);
  console.log("✅ All 4 products opened");

  // ── 18. Global / risk config (admin-only, fixes placeOrder gas-cap revert) ──
  await c2cAdmin.write.setMaxOrderAmount([MAX_ORDER_AMOUNT]);
  console.log(`✅ maxOrderAmount = ${MAX_ORDER_AMOUNT.toString()} (1M USDT cap)`);

  await c2cRiskManager.write.setRiskConfig([
    RISK_MIN, RISK_BASE, RISK_MAX, RISK_STEP,
    RISK_RESET, RISK_FREEZE, RISK_REWARD, RISK_DECAY,
  ]);
  console.log(
    `✅ Risk config set: min=${RISK_MIN} base=${RISK_BASE} max=${RISK_MAX} step=${RISK_STEP} `
    + `reset=${RISK_RESET} freeze=${RISK_FREEZE} reward=${RISK_REWARD} decay=${RISK_DECAY}`,
  );

  // ── 19. Write packages/web/.env.local ────────────────────────────────────
  const envPath = path.resolve(__dirname, "../../web/.env.local");

  let existingLines: string[] = [];
  if (fs.existsSync(envPath)) {
    existingLines = fs.readFileSync(envPath, "utf-8").split("\n");
  }

  const contractKeys = new Set([
    "NEXT_PUBLIC_C2C_ADMIN_ADDRESS",
    "NEXT_PUBLIC_C2C_ESCROW_ADDRESS",
    "NEXT_PUBLIC_C2C_BOND_VAULT_ADDRESS",
    "NEXT_PUBLIC_C2C_RISK_MANAGER_ADDRESS",
    "NEXT_PUBLIC_MERCHANT_ADDRESS",
    "NEXT_PUBLIC_CHAIN_ID",
    // Per-token address keys, derived from registry so adding a crypto in
    // assets.json automatically wires the env var (and prunes stale ones).
    ...onChainCryptos.map((c) => `NEXT_PUBLIC_${c.symbol}_ADDRESS`),
  ]);

  const preserved = existingLines.filter((line) => {
    const key = line.split("=")[0].trim();
    return !contractKeys.has(key);
  });

  const contractBlock = [
    `# === Contract addresses (client-side) — updated by deploy-web.ts at ${new Date().toISOString()} ===`,
    `NEXT_PUBLIC_C2C_ADMIN_ADDRESS=${c2cAdmin.address}`,
    `NEXT_PUBLIC_C2C_ESCROW_ADDRESS=${c2cEscrow.address}`,
    `NEXT_PUBLIC_C2C_BOND_VAULT_ADDRESS=${c2cBondVault.address}`,
    `NEXT_PUBLIC_C2C_RISK_MANAGER_ADDRESS=${c2cRiskManager.address}`,
    `NEXT_PUBLIC_MERCHANT_ADDRESS=${merchantAddr}`,
    ...onChainCryptos.map((c) => `NEXT_PUBLIC_${c.symbol}_ADDRESS=${tokens[c.symbol].address}`),
    `NEXT_PUBLIC_CHAIN_ID=31337`,
  ];

  const filtered = preserved.filter(
    (l) => !l.startsWith("# === Contract addresses"),
  );

  const newContent = [...filtered, "", ...contractBlock, ""].join("\n");
  fs.writeFileSync(envPath, newContent, "utf-8");

  console.log("\n" + "=".repeat(60));
  console.log("✅ packages/web/.env.local updated");
  console.log("=".repeat(60));
  console.log(`NEXT_PUBLIC_C2C_ADMIN_ADDRESS=${c2cAdmin.address}`);
  console.log(`NEXT_PUBLIC_C2C_ESCROW_ADDRESS=${c2cEscrow.address}`);
  console.log(`NEXT_PUBLIC_C2C_BOND_VAULT_ADDRESS=${c2cBondVault.address}`);
  console.log(`NEXT_PUBLIC_C2C_RISK_MANAGER_ADDRESS=${c2cRiskManager.address}`);
  console.log(`NEXT_PUBLIC_MERCHANT_ADDRESS=${merchantAddr}`);
  for (const c of onChainCryptos) {
    console.log(`NEXT_PUBLIC_${c.symbol}_ADDRESS=${tokens[c.symbol].address}`);
  }
  console.log(`NEXT_PUBLIC_CHAIN_ID=31337`);
  console.log("=".repeat(60));
  console.log("\nDone. Restart the Next.js dev server to pick up new addresses.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
