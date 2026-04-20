/**
 * Deploy the C2C platform contracts to Hardhat local node.
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat node                                                  # terminal 1
 *   npx hardhat run scripts/deploy-local.ts --network hardhatMainnet  # terminal 2
 *
 * After deployment the script prints addresses and a ready-to-use .env block
 * for packages/demo/.env
 */

import { network } from "hardhat";

// Verifier server's signing address (derived from VERIFIER_PRIVATE_KEY in packages/verifier/.env)
const VERIFIER_SIGNER_ADDRESS =
  "0x5BC034e03584e20a81Aa0c36A2974c338Dd8A368";

// Trusted servers the verifier will accept proofs from
const TRUSTED_KYB_SERVERS = ["kyb.example.com"];
const TRUSTED_PAYMENT_SERVERS = ["wise.com", "mbillexprod.alipay.com"];

async function main() {
  const { viem } = await network.connect();

  console.log("Deploying C2C platform contracts to Hardhat local node...\n");

  // 1. Deploy MockERC20 (USDT for testing)
  const usdt = await viem.deployContract("MockERC20", [
    "Tether USD",
    "USDT",
    18,
  ]);
  console.log("MockERC20 (USDT):", usdt.address);

  // 2. Deploy TLSNVerifier
  const tlsnVerifier = await viem.deployContract("TLSNVerifier");
  console.log("TLSNVerifier:    ", tlsnVerifier.address);

  // 3. Deploy C2CAdmin
  const c2cAdmin = await viem.deployContract("C2CAdmin", [
    tlsnVerifier.address,
  ]);
  console.log("C2CAdmin:        ", c2cAdmin.address);

  // 4. Deploy C2CEscrow
  const c2cEscrow = await viem.deployContract("C2CEscrow", [
    c2cAdmin.address,
    tlsnVerifier.address,
  ]);
  console.log("C2CEscrow:       ", c2cEscrow.address);

  // 5. Configure cross-contract authorization
  await tlsnVerifier.write.setAuthorizedCaller([c2cAdmin.address, true]);
  await tlsnVerifier.write.setAuthorizedCaller([c2cEscrow.address, true]);
  await c2cAdmin.write.setAuthorizedCaller([c2cEscrow.address, true]);
  console.log("\n✅ Cross-contract authorization configured");

  // 6. Add trusted verifier (the Rust verifier server's signing address)
  await tlsnVerifier.write.addTrustedVerifier([VERIFIER_SIGNER_ADDRESS]);
  console.log("✅ Trusted verifier added:", VERIFIER_SIGNER_ADDRESS);

  // 7. Add trusted servers
  for (const server of TRUSTED_KYB_SERVERS) {
    await tlsnVerifier.write.addTrustedKYBServer([server]);
  }
  for (const server of TRUSTED_PAYMENT_SERVERS) {
    await tlsnVerifier.write.addTrustedPaymentServer([server]);
  }
  console.log(
    "✅ Trusted servers added:",
    [...TRUSTED_KYB_SERVERS, ...TRUSTED_PAYMENT_SERVERS].join(", "),
  );

  // 8. Deploy & register platform verifiers
  const wisePlatformVerifier = await viem.deployContract("WisePlatformVerifier", [
    tlsnVerifier.address,
  ]);
  const alipayPlatformVerifier = await viem.deployContract("AlipayPlatformVerifier", [
    tlsnVerifier.address,
  ]);
  console.log("WisePlatformVerifier:  ", wisePlatformVerifier.address);
  console.log("AlipayPlatformVerifier:", alipayPlatformVerifier.address);

  const PLATFORM_WISE = await tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY = await tlsnVerifier.read.PLATFORM_ALIPAY();
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_WISE, wisePlatformVerifier.address]);
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_ALIPAY, alipayPlatformVerifier.address]);
  console.log("✅ Platform verifiers registered (Wise + Alipay)");

  // 9. Add supported crypto + fiat
  await c2cAdmin.write.addCryptoInfo([usdt.address, true]);
  await c2cAdmin.write.addFiatInfo(["CNY", true]);
  console.log("✅ Supported assets: USDT + CNY");

  // Print .env block for demo
  console.log("\n" + "=".repeat(60));
  console.log("Copy the following into packages/demo/.env:");
  console.log("=".repeat(60));
  console.log(`VITE_C2C_ADMIN_ADDRESS=${c2cAdmin.address}`);
  console.log(`VITE_C2C_ESCROW_ADDRESS=${c2cEscrow.address}`);
  console.log(`VITE_CHAIN_ID=31337`);
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
