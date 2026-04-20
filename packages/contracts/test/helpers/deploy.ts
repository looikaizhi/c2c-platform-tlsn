import type { Address } from "viem";
import { parseUnits } from "viem";

/**
 * Deploy the full C2C platform stack and configure cross-contract authorization.
 *
 * Returns all contract instances and wallet clients needed for testing.
 */
export async function deployAll(viem: any) {
  // Get wallet clients (hardhat provides 10 accounts by default)
  const walletClients = await viem.getWalletClients();
  const [deployer, verifierSigner, merchant, buyer, randomUser, newAdmin] =
    walletClients;

  // 1. Deploy MockERC20
  const usdt = await viem.deployContract("MockERC20", [
    "Tether USD",
    "USDT",
    18,
  ]);

  // 2. Deploy TLSNVerifier
  const tlsnVerifier = await viem.deployContract("TLSNVerifier");

  // 3. Deploy C2CAdmin(verifierAddress)
  const c2cAdmin = await viem.deployContract("C2CAdmin", [
    tlsnVerifier.address,
  ]);

  // 4. Deploy C2CEscrow(adminAddress, verifierAddress)
  const c2cEscrow = await viem.deployContract("C2CEscrow", [
    c2cAdmin.address,
    tlsnVerifier.address,
  ]);

  // 5. Configure authorization: TLSNVerifier authorizes C2CAdmin and C2CEscrow
  await tlsnVerifier.write.setAuthorizedCaller([c2cAdmin.address, true]);
  await tlsnVerifier.write.setAuthorizedCaller([c2cEscrow.address, true]);

  // 6. C2CAdmin authorizes C2CEscrow
  await c2cAdmin.write.setAuthorizedCaller([c2cEscrow.address, true]);

  // 7. Add supported crypto (USDT) and fiat (CNY, MYR)
  await c2cAdmin.write.addCryptoInfo([usdt.address, true]);
  await c2cAdmin.write.addFiatInfo(["CNY", true]); // id=0
  await c2cAdmin.write.addFiatInfo(["MYR", true]); // id=1

  // 8. Add trusted verifier
  await tlsnVerifier.write.addTrustedVerifier([verifierSigner.account.address]);

  // 9. Add trusted KYB server
  await tlsnVerifier.write.addTrustedKYBServer(["kyb.example.com"]);

  // 10. Add trusted payment servers
  await tlsnVerifier.write.addTrustedPaymentServer(["wise.com"]);
  await tlsnVerifier.write.addTrustedPaymentServer(["mbillexprod.alipay.com"]);

  // 11. Deploy platform verifiers and register them
  const wisePlatformVerifier = await viem.deployContract("WisePlatformVerifier", [
    tlsnVerifier.address,
  ]);
  const alipayPlatformVerifier = await viem.deployContract("AlipayPlatformVerifier", [
    tlsnVerifier.address,
  ]);

  const PLATFORM_WISE = await tlsnVerifier.read.PLATFORM_WISE();
  const PLATFORM_ALIPAY = await tlsnVerifier.read.PLATFORM_ALIPAY();
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_WISE, wisePlatformVerifier.address]);
  await tlsnVerifier.write.setPlatformVerifier([PLATFORM_ALIPAY, alipayPlatformVerifier.address]);

  // 12. Mint USDT to merchant and buyer
  const mintAmount = parseUnits("100000", 18);
  await usdt.write.mint([merchant.account.address, mintAmount]);
  await usdt.write.mint([buyer.account.address, mintAmount]);

  // Get contract instances connected to specific wallets
  const usdtAsMerchant = await viem.getContractAt("MockERC20", usdt.address, {
    client: { wallet: merchant },
  });
  const usdtAsBuyer = await viem.getContractAt("MockERC20", usdt.address, {
    client: { wallet: buyer },
  });

  const escrowAsMerchant = await viem.getContractAt(
    "C2CEscrow",
    c2cEscrow.address,
    { client: { wallet: merchant } },
  );
  const escrowAsBuyer = await viem.getContractAt(
    "C2CEscrow",
    c2cEscrow.address,
    { client: { wallet: buyer } },
  );

  const adminAsMerchant = await viem.getContractAt(
    "C2CAdmin",
    c2cAdmin.address,
    { client: { wallet: merchant } },
  );

  return {
    // Contracts (deployer-connected by default)
    usdt,
    tlsnVerifier,
    c2cAdmin,
    c2cEscrow,
    wisePlatformVerifier,
    alipayPlatformVerifier,

    // Contracts connected to specific wallets
    usdtAsMerchant,
    usdtAsBuyer,
    escrowAsMerchant,
    escrowAsBuyer,
    adminAsMerchant,

    // Wallet clients
    deployer,
    verifierSigner,
    merchant,
    buyer,
    randomUser,
    newAdmin,
  };
}

export type DeployResult = Awaited<ReturnType<typeof deployAll>>;
