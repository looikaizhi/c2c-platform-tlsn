# 署名与许可 / Attribution & Licensing

> English version / 英文版本: [ATTRIBUTION.md](./ATTRIBUTION.md)

本仓库是一个**衍生作品（derivative work）**，构建于
[tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension) 之上，
原项目由 **TLSNotary / PSE 团队**及其贡献者开发。

## 上游项目

- **项目：** TLSNotary Extension（浏览器扩展、plugin SDK、verifier 服务器）
- **源码：** https://github.com/tlsnotary/tlsn-extension
- **许可证：** **Apache-2.0 或 MIT** 双许可，任选其一
  （依据上游 README 的声明）
- **版权：** © TLSNotary / PSE 贡献者

TLSNotary 扩展提供了浏览器端 TLS 证明生成的核心能力——正是这部分基础，
让本项目的其余工作得以实现。

## 本仓库的贡献

在上游基础之上，**C2C（个人对个人）加密–法币支付协议层**由
**looikaizhi（Looi Kai Zhi）** 新增，包括：

- `packages/contracts` — C2C 托管 / 保证金 / 风控智能合约
- `packages/web` — C2C 交易 dApp
- `packages/keeper` — 链上结算 keeper
- 对 `packages/verifier` 与 `packages/demo` 的 C2C 专项扩展

以上贡献版权为 © 2026 looikaizhi，并以与上游**相同的 Apache-2.0 或 MIT
双许可**发布。

## 如何查看各自的贡献

完整的作者分工**已保留在 Git 提交历史**与 GitHub Contributors 图中，
未做任何汇总或压缩（squash）：

- TLSNotary 团队的提交可追溯至 **2023-07**（项目的首个提交）。
- C2C 协议层的提交则始于 **2026 年**。

请勿 squash 或重写历史，以保证此署名记录始终完整有效。
