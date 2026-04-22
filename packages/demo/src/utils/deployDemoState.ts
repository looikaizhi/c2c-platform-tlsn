// packages/demo/src/utils/deployDemoState.ts
// Complete demo state deployment sequence.
//
// Deploys all contracts, configures 3 merchants × 4 products, mints tokens,
// and writes the resulting addresses to .env so Vite picks them up on next start.
//
// Usage (Node.js script via npx tsx or ts-node):
//   cd packages/demo && npx tsx src/utils/deployDemoState.ts
//
// The script connects to a running Hardhat node at http://127.0.0.1:8545.

import {
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toBytes,
  parseUnits,
  type Hex,
  type WalletClient,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import fs from 'fs';
import path from 'path';

// ─── Hardhat accounts ─────────────────────────────────────────────────────────

const KEYS: Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // [0] Admin
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // [1] Merchant_1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // [2] Merchant_2
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // [3] Merchant_3
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b', // [4] User_1
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // [5] User_2
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564b', // [6] User_3
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // [7] User_4
  '0xdbda1821b80551c9d65939329250132c444d57db6aa5bd80e4e7cba0b33e4d5d',  // [8] User_5
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // [9] verifierSigner
];

const RPC_URL = 'http://127.0.0.1:8545';

function makeWallet(idx: number): WalletClient {
  return createWalletClient({
    account: privateKeyToAccount(KEYS[idx]),
    chain: hardhat,
    transport: http(RPC_URL),
  });
}

const wallets = KEYS.map((_, i) => makeWallet(i));
const adminWallet     = wallets[0];
const merchantWallets = [wallets[1], wallets[2], wallets[3]];
const userWallets     = [wallets[4], wallets[5], wallets[6], wallets[7], wallets[8]];
const verifierWallet  = wallets[9];

const publicClient: PublicClient = createPublicClient({
  chain: hardhat,
  transport: http(RPC_URL),
});

// ─── Identity strings (matching Integration.ts constants) ────────────────────

// Merchant identities per index
const MERCHANT_WISE_NAMES    = ['KAI XU LOOI',    'MERCHANT TWO',    'MERCHANT THREE'];
const MERCHANT_WISE_HANDLES  = ['@kaixul1',        '@merchant2wise',  '@merchant3wise'];
const MERCHANT_ALI_NAMES     = ['* LIM HOOI YEN',  'ALIPAY MERCH 2',  'ALIPAY MERCH 3'];
const MERCHANT_ALI_HANDLES   = ['kel***@hotmail.com', 'ali2@example.com', 'ali3@example.com'];

// ─── Rate constants ───────────────────────────────────────────────────────────

const RATE_WISE_CRYPTO   = 450_000_000n;  // 4.5  MYR / USDT (RATE_PRECISION_EXP = 8)
const RATE_WISE_FIAT     = 450_000_000n;  // 4.5  MYR / USDT
const RATE_ALIPAY_CRYPTO = 720_000_000n;  // 7.2  CNY / USDT
const RATE_ALIPAY_FIAT   = 720_000_000n;  // 7.2  CNY / USDT
const MAX_UINT           = (2n ** 256n) - 1n;

// ─── Contract ABIs (minimal, for deploy script use) ──────────────────────────

const ERC20_ABI = [
  { type: 'function', name: 'mint',    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'symbol',  inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

const ADMIN_ABI = [
  { type: 'function', name: 'setAuthorizedCaller',            inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addCryptoInfo',                  inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addFiatInfo',                    inputs: [{ type: 'string' },  { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'registerMerchantByAdmin',        inputs: [{ type: 'address' }],                  outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setMerchantPaymentInfoForPlatform', inputs: [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'publishRate',                    inputs: [{ type: 'uint256' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint64' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'openNow',                        inputs: [{ type: 'uint256' }, { type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const TLSN_ABI = [
  { type: 'function', name: 'setAuthorizedCaller',   inputs: [{ type: 'address' }, { type: 'bool' }],   outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addTrustedVerifier',    inputs: [{ type: 'address' }],                     outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addTrustedKYBServer',   inputs: [{ type: 'string' }],                      outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addTrustedPaymentServer', inputs: [{ type: 'string' }],                    outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setPlatformVerifier',   inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'PLATFORM_WISE',         inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'PLATFORM_ALIPAY',       inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
] as const;

const ESCROW_ABI = [
  { type: 'function', name: 'listCryptoProduct', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'listFiatProduct',   inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

// ─── Deploy helper ────────────────────────────────────────────────────────────

type ArtifactJson = { abi: any[]; bytecode: { object: string } | string };

function getBytecode(artifact: ArtifactJson): `0x${string}` {
  const bc = typeof artifact.bytecode === 'string'
    ? artifact.bytecode
    : artifact.bytecode.object;
  return (bc.startsWith('0x') ? bc : `0x${bc}`) as `0x${string}`;
}

async function deployContract(
  wallet: WalletClient,
  artifact: ArtifactJson,
  args: any[] = [],
): Promise<`0x${string}`> {
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: getBytecode(artifact),
    args,
  } as any);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('Deploy failed — no contractAddress in receipt');
  return receipt.contractAddress;
}

function loadArtifact(name: string): ArtifactJson {
  // Resolve relative to packages/contracts/artifacts
  const base = path.resolve(
    new URL('.', import.meta.url).pathname,
    '../../../contracts/artifacts/contracts',
  );
  const candidates = [
    path.join(base, `${name}.sol`, `${name}.json`),
    path.join(base, `lib/${name}.sol`, `${name}.json`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error(`Artifact not found for ${name}. Run: cd packages/contracts && npx hardhat compile`);
}

// Helper: viem v2 type workaround — writeContract with a pre-chained wallet doesn't
// require explicit `chain` at call site, but the types insist. Cast once here.
function wc(wallet: WalletClient) {
  return wallet.writeContract as (params: any) => Promise<`0x${string}`>;
}

// ─── Main deploy sequence ─────────────────────────────────────────────────────

export interface DeployResult {
  usdtAddress: `0x${string}`;
  usdcAddress: `0x${string}`;
  daiAddress:  `0x${string}`;
  adminAddress:  `0x${string}`;
  escrowAddress: `0x${string}`;
  tlsnVerifierAddress: `0x${string}`;
  verifierSignerAddress: `0x${string}`;
  merchantAddresses: `0x${string}`[];
  userAddresses: `0x${string}`[];
}

export async function deployDemoState(
  onStep?: (msg: string) => void,
): Promise<DeployResult> {
  const log = onStep ?? console.log;

  // ── Step 1: Deploy 3× MockERC20 ──────────────────────────────────────────
  log('Step 1: Deploy MockERC20 tokens (USDT, USDC, DAI)…');
  const erc20Artifact = loadArtifact('MockERC20');
  const usdtAddress = await deployContract(adminWallet, erc20Artifact, ['Tether USD', 'USDT', 18]);
  const usdcAddress = await deployContract(adminWallet, erc20Artifact, ['USD Coin',   'USDC', 18]);
  const daiAddress  = await deployContract(adminWallet, erc20Artifact, ['Dai Stablecoin', 'DAI', 18]);
  log(`  USDT=${usdtAddress}  USDC=${usdcAddress}  DAI=${daiAddress}`);

  // ── Step 2: Deploy TLSNVerifier ───────────────────────────────────────────
  log('Step 2: Deploy TLSNVerifier…');
  const tlsnAddress = await deployContract(adminWallet, loadArtifact('TLSNVerifier'));
  log(`  TLSNVerifier=${tlsnAddress}`);

  // ── Step 3: Deploy C2CAdmin ───────────────────────────────────────────────
  log('Step 3: Deploy C2CAdmin…');
  const adminAddress = await deployContract(adminWallet, loadArtifact('C2CAdmin'), [tlsnAddress]);
  log(`  C2CAdmin=${adminAddress}`);

  // ── Step 4: Deploy C2CEscrow ──────────────────────────────────────────────
  log('Step 4: Deploy C2CEscrow…');
  const escrowAddress = await deployContract(adminWallet, loadArtifact('C2CEscrow'), [adminAddress, tlsnAddress]);
  log(`  C2CEscrow=${escrowAddress}`);

  // ── Step 5: Authorization ─────────────────────────────────────────────────
  log('Step 5: Configure authorizations…');
  const wait = (h: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash: h });

  await wait(await wc(adminWallet)({ address: tlsnAddress,  abi: TLSN_ABI,  functionName: 'setAuthorizedCaller', args: [adminAddress,  true] }));
  await wait(await wc(adminWallet)({ address: tlsnAddress,  abi: TLSN_ABI,  functionName: 'setAuthorizedCaller', args: [escrowAddress, true] }));
  await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'setAuthorizedCaller', args: [escrowAddress, true] }));

  // ── Step 6: Supported assets ──────────────────────────────────────────────
  log('Step 6: Register supported crypto (USDT=0, USDC=1, DAI=2) and fiat (CNY=0, MYR=1)…');
  await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'addCryptoInfo', args: [usdtAddress, true] }));
  await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'addCryptoInfo', args: [usdcAddress, true] }));
  await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'addCryptoInfo', args: [daiAddress,  true] }));
  await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'addFiatInfo',   args: ['CNY', true] })); // fiatId=0
  await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'addFiatInfo',   args: ['MYR', true] })); // fiatId=1

  // ── Step 7: Trusted servers & verifier signer ─────────────────────────────
  log('Step 7: Register trusted servers and verifier signer…');
  await wait(await wc(adminWallet)({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'addTrustedVerifier',     args: [verifierWallet.account!.address] }));
  await wait(await wc(adminWallet)({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'addTrustedKYBServer',    args: ['kyb.example.com'] }));
  await wait(await wc(adminWallet)({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'addTrustedPaymentServer', args: ['wise.com'] }));
  await wait(await wc(adminWallet)({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'addTrustedPaymentServer', args: ['mbillexprod.alipay.com'] }));

  // ── Step 8: Platform verifiers ────────────────────────────────────────────
  log('Step 8: Deploy & register WisePlatformVerifier + AlipayPlatformVerifier…');
  const wiseVerifierAddress   = await deployContract(adminWallet, loadArtifact('WisePlatformVerifier'),   [tlsnAddress]);
  const alipayVerifierAddress = await deployContract(adminWallet, loadArtifact('AlipayPlatformVerifier'), [tlsnAddress]);

  const PLATFORM_WISE   = await publicClient.readContract({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'PLATFORM_WISE'   }) as Hex;
  const PLATFORM_ALIPAY = await publicClient.readContract({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'PLATFORM_ALIPAY' }) as Hex;

  await wait(await wc(adminWallet)({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'setPlatformVerifier', args: [PLATFORM_WISE,   wiseVerifierAddress]   }));
  await wait(await wc(adminWallet)({ address: tlsnAddress, abi: TLSN_ABI, functionName: 'setPlatformVerifier', args: [PLATFORM_ALIPAY, alipayVerifierAddress] }));

  const MINT_AMOUNT = parseUnits('2000', 18);
  const tokenAddresses = [usdtAddress, usdcAddress, daiAddress];

  // ── Step 9: Merchants ─────────────────────────────────────────────────────
  log('Step 9: Register 3 merchants, list 4 products each, publish rates…');
  const merchantAddresses = merchantWallets.map((w) => w.account!.address);

  // expiry = now + 365 days
  const nowTs = (await publicClient.getBlock()).timestamp;
  const expiry = nowTs + 365n * 24n * 3600n;

  for (let i = 0; i < 3; i++) {
    const mWallet  = merchantWallets[i];
    const mAddress = merchantAddresses[i];
    log(`  Merchant ${i + 1} (${mAddress})`);

    // Mint tokens to merchant
    for (const token of tokenAddresses) {
      await wait(await wc(adminWallet)({ address: token, abi: ERC20_ABI, functionName: 'mint', args: [mAddress, MINT_AMOUNT] }));
    }

    // Merchant approves MAX_UINT for escrow
    for (const token of tokenAddresses) {
      await wait(await wc(mWallet)({ address: token, abi: ERC20_ABI, functionName: 'approve', args: [escrowAddress, MAX_UINT] }));
    }

    // Register merchant by admin
    await wait(await wc(adminWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'registerMerchantByAdmin', args: [mAddress] }));

    // Set payment info for Wise
    const wNameHash = keccak256(toBytes(MERCHANT_WISE_NAMES[i]))   as Hex;
    const wIdHash   = keccak256(toBytes(MERCHANT_WISE_HANDLES[i])) as Hex;
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'setMerchantPaymentInfoForPlatform', args: [PLATFORM_WISE, wNameHash, wIdHash] }));

    // Set payment info for Alipay
    const aNameHash = keccak256(toBytes(MERCHANT_ALI_NAMES[i]))    as Hex;
    const aIdHash   = keccak256(toBytes(MERCHANT_ALI_HANDLES[i]))  as Hex;
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'setMerchantPaymentInfoForPlatform', args: [PLATFORM_ALIPAY, aNameHash, aIdHash] }));

    // List products
    // productId=0 CRYPTO (Wise), productId=0 FIAT (Wise), productId=1 CRYPTO (Alipay), productId=1 FIAT (Alipay)
    await wait(await wc(mWallet)({ address: escrowAddress, abi: ESCROW_ABI, functionName: 'listCryptoProduct', args: [0n, 1n, MINT_AMOUNT, true, PLATFORM_WISE]   })); // USDT=0, MYR=1
    await wait(await wc(mWallet)({ address: escrowAddress, abi: ESCROW_ABI, functionName: 'listFiatProduct',   args: [1n, 0n, MINT_AMOUNT, true, PLATFORM_WISE]   })); // MYR=1, USDT=0
    await wait(await wc(mWallet)({ address: escrowAddress, abi: ESCROW_ABI, functionName: 'listCryptoProduct', args: [0n, 0n, MINT_AMOUNT, true, PLATFORM_ALIPAY] })); // USDT=0, CNY=0
    await wait(await wc(mWallet)({ address: escrowAddress, abi: ESCROW_ABI, functionName: 'listFiatProduct',   args: [0n, 0n, MINT_AMOUNT, true, PLATFORM_ALIPAY] })); // CNY=0, USDT=0

    // Publish rates (expiry = now + 365d)
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'publishRate', args: [0n, 0 /* CRYPTO */, RATE_WISE_CRYPTO,   expiry] })); // Wise CRYPTO
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'publishRate', args: [0n, 1 /* FIAT */,   RATE_WISE_FIAT,     expiry] })); // Wise FIAT
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'publishRate', args: [1n, 0 /* CRYPTO */, RATE_ALIPAY_CRYPTO, expiry] })); // Alipay CRYPTO
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'publishRate', args: [1n, 1 /* FIAT */,   RATE_ALIPAY_FIAT,   expiry] })); // Alipay FIAT

    // Open all 4 products
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'openNow', args: [0n, 0] }));
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'openNow', args: [0n, 1] }));
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'openNow', args: [1n, 0] }));
    await wait(await wc(mWallet)({ address: adminAddress, abi: ADMIN_ABI, functionName: 'openNow', args: [1n, 1] }));
  }

  // ── Step 10: Users ────────────────────────────────────────────────────────
  log('Step 10: Mint tokens and approve for 5 users…');
  const userAddresses = userWallets.map((w) => w.account!.address);

  for (let i = 0; i < 5; i++) {
    const uWallet  = userWallets[i];
    const uAddress = userAddresses[i];
    for (const token of tokenAddresses) {
      await wait(await wc(adminWallet)({ address: token, abi: ERC20_ABI, functionName: 'mint', args: [uAddress, MINT_AMOUNT] }));
      await wait(await wc(uWallet)({ address: token, abi: ERC20_ABI, functionName: 'approve', args: [escrowAddress, MAX_UINT] }));
    }
  }

  log('Deploy complete!');

  const result: DeployResult = {
    usdtAddress,
    usdcAddress,
    daiAddress,
    adminAddress,
    escrowAddress,
    tlsnVerifierAddress: tlsnAddress,
    verifierSignerAddress: verifierWallet.account!.address,
    merchantAddresses,
    userAddresses,
  };

  return result;
}

/**
 * Write deploy results to packages/demo/.env so Vite picks them up.
 */
export function writeEnvFile(result: DeployResult): void {
  const lines = [
    `# Auto-generated by deployDemoState.ts at ${new Date().toISOString()}`,
    `VITE_VERIFIER_HOST=localhost:7047`,
    `VITE_SSL=false`,
    `VITE_CHAIN_ID=31337`,
    `VITE_USDT_ADDRESS=${result.usdtAddress}`,
    `VITE_USDC_ADDRESS=${result.usdcAddress}`,
    `VITE_DAI_ADDRESS=${result.daiAddress}`,
    `VITE_C2C_ADMIN_ADDRESS=${result.adminAddress}`,
    `VITE_C2C_ESCROW_ADDRESS=${result.escrowAddress}`,
    // Merchants
    `VITE_MERCHANT1_ADDRESS=${result.merchantAddresses[0]}`,
    `VITE_MERCHANT2_ADDRESS=${result.merchantAddresses[1]}`,
    `VITE_MERCHANT3_ADDRESS=${result.merchantAddresses[2]}`,
    // Legacy single-merchant alias
    `VITE_MERCHANT_ADDRESS=${result.merchantAddresses[0]}`,
    // Users
    `VITE_USER1_ADDRESS=${result.userAddresses[0]}`,
    `VITE_USER2_ADDRESS=${result.userAddresses[1]}`,
    `VITE_USER3_ADDRESS=${result.userAddresses[2]}`,
    `VITE_USER4_ADDRESS=${result.userAddresses[3]}`,
    `VITE_USER5_ADDRESS=${result.userAddresses[4]}`,
    // Legacy buyer alias
    `VITE_BUYER_ADDRESS=${result.userAddresses[0]}`,
    `VITE_TLSN_VERIFIER_ADDRESS=${result.tlsnVerifierAddress}`,
    `VITE_VERIFIER_SIGNER_ADDRESS=${result.verifierSignerAddress}`,

  ];

  const envPath = path.resolve(new URL('.', import.meta.url).pathname, '../../.env');
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  console.log(`Written to ${envPath}`);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

// When executed directly (not imported), run the deploy
if (import.meta.url === `file://${process.argv[1]}`) {
  deployDemoState(console.log)
    .then((result) => {
      writeEnvFile(result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Deploy failed:', err);
      process.exit(1);
    });
}
