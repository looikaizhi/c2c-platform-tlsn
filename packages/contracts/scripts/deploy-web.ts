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
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rust verifier server signing address (from packages/verifier/.env VERIFIER_PRIVATE_KEY)
const VERIFIER_SIGNER_ADDRESS = "0x5BC034e03584e20a81Aa0c36A2974c338Dd8A368";

const TRUSTED_KYB_SERVERS = ["kyb.example.com"];
const TRUSTED_PAYMENT_SERVERS = ["wise.com", "mbillexprod.alipay.com"];

async function main() {
  const { viem } = await network.connect();

  console.log("=== C2C Web Deployment ===\n");

  // ── 1. MockERC20 (USDT) ───────────────────────────────────────────────────
  const usdt = await viem.deployContract("MockERC20", ["Tether USD", "USDT", 18]);
  console.log("MockERC20 (USDT):      ", usdt.address);

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

  // ── 5. WisePlatformVerifier + AlipayPlatformVerifier ──────────────────────
  const wisePlatformVerifier = await viem.deployContract("WisePlatformVerifier", [
    tlsnVerifier.address,
  ]);
  const alipayPlatformVerifier = await viem.deployContract("AlipayPlatformVerifier", [
    tlsnVerifier.address,
  ]);
  console.log("WisePlatformVerifier:  ", wisePlatformVerifier.address);
  console.log("AlipayPlatformVerifier:", alipayPlatformVerifier.address);

  // ── 6. Cross-contract authorization ───────────────────────────────────────
  await tlsnVerifier.write.setAuthorizedCaller([c2cAdmin.address, true]);
  await tlsnVerifier.write.setAuthorizedCaller([c2cEscrow.address, true]);
  await c2cAdmin.write.setAuthorizedCaller([c2cEscrow.address, true]);
  console.log("\n✅ Cross-contract authorization configured");

  // ── 7. Trusted verifier ───────────────────────────────────────────────────
  await tlsnVerifier.write.addTrustedVerifier([VERIFIER_SIGNER_ADDRESS]);
  console.log("✅ Trusted verifier added:", VERIFIER_SIGNER_ADDRESS);

  // ── 8. Trusted servers ────────────────────────────────────────────────────
  for (const server of TRUSTED_KYB_SERVERS) {
    await tlsnVerifier.write.addTrustedKYBServer([server]);
  }
  for (const server of TRUSTED_PAYMENT_SERVERS) {
    await tlsnVerifier.write.addTrustedPaymentServer([server]);
  }
  console.log("✅ Trusted servers:", [...TRUSTED_KYB_SERVERS, ...TRUSTED_PAYMENT_SERVERS].join(", "));

  // ── 9. Platform verifiers ─────────────────────────────────────────────────
  const PLATFORM_WISE = await tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY = await tlsnVerifier.read.PLATFORM_ALIPAY();
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_WISE, wisePlatformVerifier.address]);
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_ALIPAY, alipayPlatformVerifier.address]);
  console.log("✅ Platform verifiers registered (Wise + Alipay)");

  // ── 10. Write packages/web/.env.local ─────────────────────────────────────
  const envPath = path.resolve(__dirname, "../../web/.env.local");

  // Read existing .env.local and preserve non-contract lines
  let existingLines: string[] = [];
  if (fs.existsSync(envPath)) {
    existingLines = fs.readFileSync(envPath, "utf-8").split("\n");
  }

  // Keys we will overwrite
  const contractKeys = new Set([
    "NEXT_PUBLIC_C2C_ADMIN_ADDRESS",
    "NEXT_PUBLIC_C2C_ESCROW_ADDRESS",
    "NEXT_PUBLIC_CHAIN_ID",
  ]);

  // Keep all lines that don't belong to keys we are updating
  const preserved = existingLines.filter((line) => {
    const key = line.split("=")[0].trim();
    return !contractKeys.has(key);
  });

  // Inject updated contract lines after "# === Contract addresses" comment,
  // or append at the end if the section is not found
  const contractBlock = [
    `# === Contract addresses (client-side) — updated by deploy-web.ts at ${new Date().toISOString()} ===`,
    `NEXT_PUBLIC_C2C_ADMIN_ADDRESS=${c2cAdmin.address}`,
    `NEXT_PUBLIC_C2C_ESCROW_ADDRESS=${c2cEscrow.address}`,
    `NEXT_PUBLIC_CHAIN_ID=31337`,
  ];

  // Remove any stale contract-section comment line from preserved
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
  console.log(`NEXT_PUBLIC_CHAIN_ID=31337`);
  console.log("=".repeat(60));
  console.log("\nDone. Restart the Next.js dev server to pick up new addresses.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
