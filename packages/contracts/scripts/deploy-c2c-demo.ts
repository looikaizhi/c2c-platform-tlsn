/**
 * Deploy the C2C Demo contracts and fully initialize state.
 * Writes contract addresses to packages/demo/.env after deployment.
 *
 * Account layout (Hardhat deterministic accounts):
 *   accounts[0]   → Admin (deployer)
 *   accounts[1-3] → Merchant 1 / 2 / 3
 *   accounts[4-8] → User 1 / 2 / 3 / 4 / 5
 *
 * Tokens deployed (all 3 minted to wallets):
 *   USDT (18 decimals) — registered in contract as cryptoId=0
 *   USDC (6  decimals) — wallet-only, NOT registered in contract
 *   DAI  (18 decimals) — wallet-only, NOT registered in contract
 *
 * Contract assets registered:
 *   Crypto: USDT (cryptoId=0)
 *   Fiat:   MYR  (fiatId=0)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-c2c-demo.ts --network localhost
 */

import { network } from "hardhat";
import { parseUnits } from "viem";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rust verifier server signing address (from packages/verifier VERIFIER_PRIVATE_KEY)
const VERIFIER_SIGNER_ADDRESS = "0x5BC034e03584e20a81Aa0c36A2974c338Dd8A368";

// Mint amount: 1000 of each token to every merchant and user
const MINT_18 = parseUnits("1000", 18); // USDT / DAI (18 dec)
const MINT_6  = parseUnits("1000",  6); // USDC (6 dec)

// Merchant 1 collateral for USDT product
const COLLATERAL_USDT = parseUnits("100", 18);

// Rate: 1 USDT = 2.5 MYR
const RATE       = parseUnits("2.5", 18);
const BUY_AMOUNT = parseUnits("1",   18);

function elapsed(label: string, start: number): number {
  const ms = Math.round(performance.now() - start);
  console.log(`  ⏱  ${label}: ${ms}ms`);
  return ms;
}

async function main() {
  const tScript = performance.now(); // true script start (inside Hardhat runtime)

  // ── Hardhat init (connect + fetch wallet clients) ─────────────────────────
  const tInit = performance.now();
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();
  elapsed("Hardhat init (connect + fetch 20 wallet clients via RPC)", tInit);

  // ── Account layout ───────────────────────────────────────────────────────
  const [
    adminWallet,
    merchant1Wallet, merchant2Wallet, merchant3Wallet,
    user1Wallet, user2Wallet, user3Wallet, user4Wallet, user5Wallet,
  ] = wallets;

  const adminAddr     = adminWallet.account.address;
  const merchant1Addr = merchant1Wallet.account.address;
  const merchant2Addr = merchant2Wallet.account.address;
  const merchant3Addr = merchant3Wallet.account.address;
  const user1Addr     = user1Wallet.account.address;
  const user2Addr     = user2Wallet.account.address;
  const user3Addr     = user3Wallet.account.address;
  const user4Addr     = user4Wallet.account.address;
  const user5Addr     = user5Wallet.account.address;

  console.log("=== C2C Demo Deployment ===");
  console.log("Admin:      ", adminAddr);
  console.log("Merchant 1: ", merchant1Addr);
  console.log("Merchant 2: ", merchant2Addr);
  console.log("Merchant 3: ", merchant3Addr);
  console.log("User 1:     ", user1Addr);
  console.log("User 2:     ", user2Addr);
  console.log("User 3:     ", user3Addr);
  console.log("User 4:     ", user4Addr);
  console.log("User 5:     ", user5Addr);
  console.log("Verifier Signer:", VERIFIER_SIGNER_ADDRESS);
  console.log("");

  const t0 = performance.now(); // deployment start (after init overhead)

  // ── 1. Deploy tokens ─────────────────────────────────────────────────────
  const usdt = await viem.deployContract("MockERC20", ["Tether USD",       "USDT", 18]);
  const usdc = await viem.deployContract("MockERC20", ["USD Coin",         "USDC",  6]);
  const dai  = await viem.deployContract("MockERC20", ["Dai Stablecoin",   "DAI",  18]);
  console.log("MockERC20 USDT:", usdt.address);
  console.log("MockERC20 USDC:", usdc.address);
  console.log("MockERC20 DAI: ", dai.address);
  const t1 = performance.now(); elapsed("Step 1 — Token deploy only (3 contracts)", t0);

  // ── 2. Deploy core contracts ──────────────────────────────────────────────
  const tlsnVerifier = await viem.deployContract("TLSNVerifier");
  console.log("TLSNVerifier:  ", tlsnVerifier.address);

  const c2cAdmin = await viem.deployContract("C2CAdmin", [tlsnVerifier.address]);
  console.log("C2CAdmin:      ", c2cAdmin.address);

  const c2cEscrow = await viem.deployContract("C2CEscrow", [
    c2cAdmin.address,
    tlsnVerifier.address,
  ]);
  console.log("C2CEscrow:     ", c2cEscrow.address);
  console.log("");
  const t2 = performance.now(); elapsed("Step 2 — Core contracts deploy (TLSNVerifier + C2CAdmin + C2CEscrow)", t1);

  // ── 3. Cross-contract authorization ──────────────────────────────────────
  await tlsnVerifier.write.setAuthorizedCaller([c2cAdmin.address,  true]);
  await tlsnVerifier.write.setAuthorizedCaller([c2cEscrow.address, true]);
  await c2cAdmin.write.setAuthorizedCaller([c2cEscrow.address, true]);
  console.log("✅ Cross-contract authorization done");

  // ── 4. Register trusted verifier & payment servers ────────────────────────
  await tlsnVerifier.write.addTrustedVerifier([VERIFIER_SIGNER_ADDRESS]);
  await tlsnVerifier.write.addTrustedPaymentServer(["wise.com"]);
  await tlsnVerifier.write.addTrustedPaymentServer(["mbillexprod.alipay.com"]);
  console.log("✅ Trusted verifier & payment servers registered");

  // ── 5. Deploy & register platform verifiers ───────────────────────────────
  const wisePlatformVerifier = await viem.deployContract("WisePlatformVerifier", [
    tlsnVerifier.address,
  ]);
  const alipayPlatformVerifier = await viem.deployContract("AlipayPlatformVerifier", [
    tlsnVerifier.address,
  ]);
  console.log("WisePlatformVerifier:  ", wisePlatformVerifier.address);
  console.log("AlipayPlatformVerifier:", alipayPlatformVerifier.address);

  const PLATFORM_WISE   = await tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY = await tlsnVerifier.read.PLATFORM_ALIPAY();
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_WISE,   wisePlatformVerifier.address]);
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_ALIPAY, alipayPlatformVerifier.address]);
  console.log("✅ Platform verifiers registered (Wise + Alipay)");
  const t3 = performance.now(); elapsed("Steps 3-5 — Auth (3 tx) + trusted servers (3 tx) + platform verifiers deploy+register (4 tx)", t2);

  // ── 6. Register supported assets (USDT + MYR only) ───────────────────────
  await c2cAdmin.write.addCryptoInfo([usdt.address, true]); // cryptoId = 0 (USDT)
  await c2cAdmin.write.addFiatInfo(["MYR", true]);           // fiatId   = 0 (MYR)
  console.log("✅ Assets: USDT (cryptoId=0)  Fiat: MYR (fiatId=0)");
  console.log("   (USDC and DAI deployed as wallet tokens only, not registered in contract)");
  const t4 = performance.now(); elapsed("Step 6 — Asset registration (2 tx)", t3);

  // ── 7. Mint 1000 of each token — sequential (automine requires strict ordering) ─
  // Hardhat automine mines each tx immediately in its own block, so the mempool
  // cannot queue transactions. All 24 mints share the admin sender, meaning nonces
  // must be submitted in strict order (no concurrent submissions with future nonces).
  const allAddresses = [
    merchant1Addr, merchant2Addr, merchant3Addr,
    user1Addr, user2Addr, user3Addr, user4Addr, user5Addr,
  ];
  for (const addr of allAddresses) {
    await usdt.write.mint([addr, MINT_18]);
    await usdc.write.mint([addr, MINT_6]);
    await dai.write.mint( [addr, MINT_18]);
  }
  console.log("✅ Minted 1000 USDT + 1000 USDC + 1000 DAI to all 3 merchants and 5 users");
  const t5 = performance.now(); elapsed("Step 7 — Mint (8 addr × 3 tokens = 24 tx, sequential)", t4);

  // ── 8. Register Merchant 1 only — lists USDT→MYR (Wise) ──────────────────
  await c2cAdmin.write.registerMerchantByAdmin([merchant1Addr]);
  const usdtAsMerchant1 = await viem.getContractAt("MockERC20", usdt.address, {
    client: { wallet: merchant1Wallet },
  });
  const escrowAsMerchant1 = await viem.getContractAt("C2CEscrow", c2cEscrow.address, {
    client: { wallet: merchant1Wallet },
  });
  await usdtAsMerchant1.write.approve([c2cEscrow.address, COLLATERAL_USDT]);
  await (escrowAsMerchant1.write as any).listCryptoProduct([
    0n,               // cryptoId = USDT
    0n,               // fiatId   = MYR
    COLLATERAL_USDT,  // 100 USDT collateral
    true,             // active
    PLATFORM_WISE,
  ]);
  console.log("✅ Merchant 1 registered and listed: USDT→MYR (Wise), collateral=100 USDT");
  console.log("   (Merchant 2 and 3 hold tokens but are not registered)");
  console.log("");
  elapsed("Step 8 — Merchant 1 setup (3 tx)", t5);

  // ── 9. Write .env ─────────────────────────────────────────────────────────
  const envPath = path.resolve(__dirname, "../../demo/.env");
  const envContent =
    [
      `# Auto-generated by deploy-c2c-demo.ts at ${new Date().toISOString()}`,
      `VITE_VERIFIER_HOST=localhost:7047`,
      `VITE_SSL=false`,
      `VITE_CHAIN_ID=31337`,
      // Core contracts
      `VITE_C2C_ADMIN_ADDRESS=${c2cAdmin.address}`,
      `VITE_C2C_ESCROW_ADDRESS=${c2cEscrow.address}`,
      `VITE_VERIFIER_SIGNER_ADDRESS=${VERIFIER_SIGNER_ADDRESS}`,
      // Tokens
      `VITE_USDT_ADDRESS=${usdt.address}`,
      `VITE_USDC_ADDRESS=${usdc.address}`,
      `VITE_DAI_ADDRESS=${dai.address}`,
      // Merchants
      `VITE_MERCHANT1_ADDRESS=${merchant1Addr}`,
      `VITE_MERCHANT2_ADDRESS=${merchant2Addr}`,
      `VITE_MERCHANT3_ADDRESS=${merchant3Addr}`,
      // Users
      `VITE_USER1_ADDRESS=${user1Addr}`,
      `VITE_USER2_ADDRESS=${user2Addr}`,
      `VITE_USER3_ADDRESS=${user3Addr}`,
      `VITE_USER4_ADDRESS=${user4Addr}`,
      `VITE_USER5_ADDRESS=${user5Addr}`,
      // Demo params
      `VITE_RATE=${RATE.toString()}`,
      `VITE_BUY_AMOUNT=${BUY_AMOUNT.toString()}`,
    ].join("\n") + "\n";

  fs.writeFileSync(envPath, envContent, "utf-8");

  console.log("");
  console.log("=".repeat(60));
  console.log("✅ .env written to packages/demo/.env");
  console.log("=".repeat(60));
  console.log(envContent);

  console.log("─".repeat(60));
  elapsed("TOTAL deployment only (t0 → .env written)", t0);
  elapsed("TOTAL script execution (incl. Hardhat init)", tScript);
  console.log("─".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
