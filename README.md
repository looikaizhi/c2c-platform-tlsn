<div align="center">

# c2c-platform-tlsn

A C2C fiat ↔ crypto exchange prototype built on TLSNotary

**English** | [中文](docs/README.zh-CN.md)

</div>

> [!NOTE]
> This is a fork of **[tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension)**, taken at upstream commit [`af48716`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/af48716) (2026-02-04). This README only covers what the fork adds. For the browser extension, plugin SDK and verifier themselves, see the **[upstream README](https://github.com/tlsnotary/tlsn-extension#readme)**.

## About

This is the code for my master's thesis: a semi-decentralized C2C exchange protocol. A buyer pays through Alipay or Wise, the browser extension produces an MPC-TLS proof of that payment, a verifier server checks and signs it, and an escrow contract checks the signature before releasing the crypto. The verifier server is still a trusted party in this design.

Protocol design, security analysis and measurements are documented separately in **[looikaizhi/zktls-c2c-exchange](https://github.com/looikaizhi/zktls-c2c-exchange)**.

## Changes from upstream

<table>
  <tr>
    <th width="22%">Package</th>
    <th width="12%">Change</th>
    <th>What it contains</th>
  </tr>
  <tr>
    <td><a href="packages/contracts"><code>contracts</code></a></td>
    <td>new</td>
    <td>Solidity contracts for escrow, proof verification, risk control and bonds (Hardhat)</td>
  </tr>
  <tr>
    <td><a href="packages/web"><code>web</code></a></td>
    <td>new</td>
    <td>Trading dApp (Next.js, wagmi, viem)</td>
  </tr>
  <tr>
    <td><a href="packages/keeper"><code>keeper</code></a></td>
    <td>new</td>
    <td>Service that sweeps expired orders based on contract events</td>
  </tr>
  <tr>
    <td><a href="packages/verifier"><code>verifier</code></a></td>
    <td>extended</td>
    <td>Proof storage and query API, SIWE / API-key auth, rate limiting, result signing with an Ethereum key</td>
  </tr>
  <tr>
    <td><a href="packages/extension"><code>extension</code></a></td>
    <td>extended</td>
    <td>Side panel, transcript commitments, verifier-signature check</td>
  </tr>
  <tr>
    <td><a href="packages/plugin-sdk"><code>plugin-sdk</code></a></td>
    <td>extended</td>
    <td>Types for commitments, signatures and proof export</td>
  </tr>
  <tr>
    <td><a href="packages/demo"><code>demo</code></a></td>
    <td>extended</td>
    <td>Alipay, Wise and Binance plugins; demo panels for trading, merchant and admin</td>
  </tr>
  <tr>
    <td><a href="packages/tlsn-wasm-pkg"><code>tlsn-wasm-pkg</code></a></td>
    <td>rebuilt</td>
    <td>WASM prover bindings</td>
  </tr>
</table>

`common`, `tutorial` and `tlsn-wasm` are unchanged from upstream. A file-level mapping from thesis concepts to code is in the [source map](https://github.com/looikaizhi/zktls-c2c-exchange/blob/main/docs/en/reference/code-map.md).

## Running it

Requires Node.js ≥ 18, Rust (stable), Chrome with MetaMask, and an **Alipay or Wise account** for the actual transfer. Run each step in its own terminal, starting from the repository root, in this order.

```bash
# 0. Install dependencies (once)
git clone https://github.com/looikaizhi/c2c-platform-tlsn.git
cd c2c-platform-tlsn
npm install
```

```bash
# 1. Local chain (http://127.0.0.1:8545, chain ID 31337)
cd packages/contracts
npm run node
```

```bash
# 2. Verifier server (port 7047; reads packages/verifier/.env)
cd packages/verifier
cargo run
```

```bash
# 3. dApp (port 3001)
cd packages/web
cp .env.example .env.local       # once; set NEXT_PUBLIC_DISABLE_WC=true, or fill in NEXT_PUBLIC_WC_PROJECT_ID
npm run db:migrate               # once; creates data/c2c.db
npm run dev                      # deploys the contracts, then starts Next.js
```

```bash
# 4. Keeper (start after step 3 has finished deploying)
cd packages/keeper
cp .env.example .env             # once
npm run dev
```

```bash
# 5. Browser extension
npm run dev                      # from the repository root; builds into packages/extension/build/
```

Then load `packages/extension/build/` in Chrome via `chrome://extensions` → Developer mode → Load unpacked, and in MetaMask add the network `http://127.0.0.1:8545` (chain ID 31337) and import Hardhat test accounts: #0 is the admin, #1 the seeded merchant, and #4–#8 are buyer accounts funded with test USDT / USDC.

Open `http://localhost:3001`. The buyer binds their Alipay or Wise account, places an order, pays the merchant on the real platform, proves the payment with the extension, and submits the proof to release the crypto.

> [!NOTE]
> Before step 3, set the seeded merchant's Alipay / Wise receiving account in the `MERCHANT_*` constants of [`packages/contracts/scripts/deploy-web.ts`](packages/contracts/scripts/deploy-web.ts). The buyer's transfer must go to that account, or the proof will not match the merchant's on-chain binding.
>
> Step 3 redeploys the contracts and stops a running keeper each time it starts, so restart the keeper afterwards. The verifier key in `packages/verifier/.env` is Hardhat account #9, which the deploy script registers as the trusted verifier; it is for local use only.

The [demo walkthrough](https://github.com/looikaizhi/zktls-c2c-exchange/blob/main/docs/en/hands-on/02-demo-walkthrough.md) explains each step of an exchange, and [troubleshooting](https://github.com/looikaizhi/zktls-c2c-exchange/blob/main/docs/en/hands-on/03-troubleshooting.md) covers common errors.

## Acknowledgements

Built on [tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension) by the TLSNotary / PSE team. Thanks to the original authors (@0xtsukino, @hendrikeeckhaut, @mhchia and the other TLSNotary contributors). See [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md) for which parts are theirs and which are mine.

## License

Licensed under either of [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0) or [MIT license](http://opensource.org/licenses/MIT), at your option.
