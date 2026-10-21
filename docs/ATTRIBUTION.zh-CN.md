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

## 分叉点

本仓库分叉自上游提交
[`af48716`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/af48716)
（2026-02-04）。该提交及之前的所有内容均为上游的工作。
分叉之后，又合入了 TLSNotary 团队的两个上游修复：

- [`f6fac41`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/f6fac41) fix: improve plugin execution stability and resource management (#237)
- [`bfb1aa6`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/bfb1aa6) fix(plugin-sdk): prevent sandbox disposal while async callbacks are in-flight

分叉后的其余提交都属于 C2C 协议层。
其中部分仅修改文档的提交借助 Claude Code 完成，作者显示为 `Claude`。

## 各部分归属

**C2C（个人对个人）加密–法币支付协议层**由 **looikaizhi（Looi Kai Zhi）** 新增。按包划分如下：

| 包 | 来源 | 本仓库的贡献 |
|---|---|---|
| `packages/contracts` | 新增 | C2C 托管、证明核验、风控与保证金智能合约 |
| `packages/web` | 新增 | C2C 交易 dApp |
| `packages/keeper` | 新增 | 链下服务，负责在链上结算过期订单 |
| `packages/verifier` | 上游，有扩展 | C2C 专项新增：证明存储与接口、鉴权、限流、结果签名 |
| `packages/extension` | 上游，有扩展 | C2C 专项新增：侧边栏、转录承诺、核对验证服务器签名 |
| `packages/plugin-sdk` | 上游，有扩展 | C2C 专项类型定义 |
| `packages/demo` | 上游，有扩展 | 支付宝、Wise、Binance 插件；C2C 演示面板 |
| `packages/tlsn-wasm-pkg` | 上游，重新编译 | 重新编译的 WASM 证明器绑定 |
| `packages/common`、`packages/tutorial`、`packages/tlsn-wasm` | 上游 | 未改动 |

在有扩展的包里，上游原有的代码仍归 TLSNotary 团队，我只对 C2C 新增部分享有版权。

以上贡献版权为 © 2026 looikaizhi，并以与上游**相同的 Apache-2.0 或 MIT
双许可**发布。

## 如何核对各自的贡献

完整的作者分工**已保留在 Git 提交历史**与 GitHub Contributors 图中，
未做任何汇总或压缩（squash）：

- TLSNotary 团队的提交可追溯至 **2023-07**（项目的首个提交）。
- C2C 协议层的提交则始于 **2026 年**。

克隆本仓库后，可以自己核对：

```bash
# 分叉点之后每个提交的作者
git log --format='%an' af48716..main | sort | uniq -c

# 分叉点之后各个包改动了哪些文件
git diff --stat af48716 main -- packages/
```

请勿 squash 或重写历史，以保证此署名记录始终完整有效。
