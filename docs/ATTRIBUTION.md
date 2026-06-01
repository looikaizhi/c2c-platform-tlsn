# Attribution & Licensing

> 中文版本 / Chinese version: [ATTRIBUTION.zh-CN.md](./ATTRIBUTION.zh-CN.md)

This repository is a **derivative work** built on top of
[tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension),
created by the **TLSNotary / PSE team** and its contributors.

## Upstream project

- **Project:** TLSNotary Extension (browser extension, plugin SDK, verifier server)
- **Source:** https://github.com/tlsnotary/tlsn-extension
- **License:** dual-licensed under **Apache-2.0 OR MIT**, at your option
  (as stated in the upstream README)
- **Copyright:** © the TLSNotary / PSE contributors

The TLSNotary extension provides the browser-based TLS proof-generation
foundation — the part of this project that made everything else possible.

## Contributions in this repository

On top of the upstream foundation, the **C2C (consumer-to-consumer) crypto–fiat
payment protocol layer** was added by **looikaizhi (Looi Kai Zhi)**, including:

- `packages/contracts` — C2C escrow / bond-vault / risk-manager smart contracts
- `packages/web` — the C2C trading dApp
- `packages/keeper` — on-chain settlement keeper
- C2C-specific extensions to `packages/verifier` and `packages/demo`

These contributions are © 2026 looikaizhi, and are released under the **same
Apache-2.0 OR MIT dual license** as the upstream project.

## How to see who did what

The complete authorship breakdown is **preserved in the Git history** and the
GitHub Contributors graph — it is not summarized or squashed:

- The TLSNotary team's commits date back to **2023-07** (the project's first commit).
- The C2C protocol-layer commits are from **2026**.

Please do not squash or rewrite history, so that this attribution stays intact.
