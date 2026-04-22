// packages/demo/src/utils/hardhatAccounts.ts
// Hardhat default account private keys — local testing only, publicly known.
// wallet[0]  = Admin         (deployer, contract admin)
// wallet[1]  = Merchant_1    (Wise + Alipay, USDT products)
// wallet[2]  = Merchant_2
// wallet[3]  = Merchant_3
// wallet[4]  = User_1
// wallet[5]  = User_2
// wallet[6]  = User_3
// wallet[7]  = User_4
// wallet[8]  = User_5
// wallet[9]  = verifierSigner (TLSN proof signer, not shown in UI)

import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

const RPC_URL = 'http://127.0.0.1:8545';

// Hardhat's deterministic account keys, in slot order
const HARDHAT_PRIVATE_KEYS: Hex[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // [0] Admin
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // [1] Merchant_1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // [2] Merchant_2
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // [3] Merchant_3
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // [4] User_1
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // [5] User_2
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e', // [6] User_3
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // [7] User_4
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97', // [8] User_5
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // [9] verifierSigner
];

export const hardhatChain = hardhat;

function makeClient(index: number): WalletClient {
  return createWalletClient({
    account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[index]),
    chain: hardhatChain,
    transport: http(RPC_URL),
  });
}

export function makePublicClient(): PublicClient {
  return createPublicClient({
    chain: hardhatChain,
    transport: http(RPC_URL),
  });
}

// Named exports for each role
export const adminClient          = makeClient(0);
export const merchant1Client      = makeClient(1);
export const merchant2Client      = makeClient(2);
export const merchant3Client      = makeClient(3);
export const user1Client          = makeClient(4);
export const user2Client          = makeClient(5);
export const user3Client          = makeClient(6);
export const user4Client          = makeClient(7);
export const user5Client          = makeClient(8);
export const verifierSignerClient = makeClient(9);

// Backward-compatible aliases used by existing code
export const merchantClient = merchant1Client;
export const buyerClient    = user1Client;

export const publicClient = makePublicClient();

// Convenience arrays for iteration
export const merchantClients = [merchant1Client, merchant2Client, merchant3Client];
export const userClients     = [user1Client, user2Client, user3Client, user4Client, user5Client];

// Derived addresses
export const MERCHANT_ADDRESSES = merchantClients.map((c) => c.account!.address);
export const USER_ADDRESSES     = userClients.map((c) => c.account!.address);
export const ADMIN_ADDRESS      = adminClient.account!.address;
export const VERIFIER_SIGNER_ADDRESS = verifierSignerClient.account!.address;

const userClientByAddress = new Map<string, WalletClient>(
  userClients.map((client) => [client.account!.address.toLowerCase(), client]),
);

export function getUserClientByAddress(address: string): WalletClient | undefined {
  return userClientByAddress.get(address.toLowerCase());
}
