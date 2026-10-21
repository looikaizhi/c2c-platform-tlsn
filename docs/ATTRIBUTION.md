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

## Fork point

The fork was taken at upstream commit
[`af48716`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/af48716)
(2026-02-04). Everything up to and including that commit is upstream work.
After the fork, two further upstream fixes by the TLSNotary team were merged in:

- [`f6fac41`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/f6fac41) fix: improve plugin execution stability and resource management (#237)
- [`bfb1aa6`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/bfb1aa6) fix(plugin-sdk): prevent sandbox disposal while async callbacks are in-flight

All other commits after the fork are part of the C2C protocol layer.
Some documentation-only commits were made with Claude Code and show `Claude` as the author.

## Who owns what

The **C2C (consumer-to-consumer) crypto–fiat payment protocol layer** was added
by **looikaizhi (Looi Kai Zhi)**. Per package:

| Package | Origin | Contribution in this repository |
|---|---|---|
| `packages/contracts` | New | C2C escrow, proof-verifier, risk-manager and bond-vault smart contracts |
| `packages/web` | New | The C2C trading dApp |
| `packages/keeper` | New | Off-chain service that settles expired orders on-chain |
| `packages/verifier` | Upstream, extended | C2C-specific additions: proof storage and API, authentication, rate limiting, result signing |
| `packages/extension` | Upstream, extended | C2C-specific additions: side panel, transcript commitments, verifier-signature check |
| `packages/plugin-sdk` | Upstream, extended | C2C-specific type definitions |
| `packages/demo` | Upstream, extended | Alipay, Wise and Binance plugins; C2C demo panels |
| `packages/tlsn-wasm-pkg` | Upstream, rebuilt | Rebuilt WASM prover bindings |
| `packages/common`, `packages/tutorial`, `packages/tlsn-wasm` | Upstream | Unchanged |

In the extended packages, the upstream code remains the TLSNotary team's work;
only the C2C additions are mine.

These contributions are © 2026 looikaizhi, and are released under the **same
Apache-2.0 OR MIT dual license** as the upstream project.

## How to check who did what

The complete authorship breakdown is **preserved in the Git history** and the
GitHub Contributors graph — it is not summarized or squashed:

- The TLSNotary team's commits date back to **2023-07** (the project's first commit).
- The C2C protocol-layer commits are from **2026**.

To check it yourself from a clone of this repository:

```bash
# Authors of every commit made after the fork point
git log --format='%an' af48716..main | sort | uniq -c

# Files changed since the fork point, per package
git diff --stat af48716 main -- packages/
```

Please do not squash or rewrite history, so that this attribution stays intact.
