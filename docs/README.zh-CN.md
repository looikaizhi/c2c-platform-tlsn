<div align="center">

# c2c-platform-tlsn

基于 TLSNotary 的 C2C 法币 ↔ 加密货币兑换原型

[English](../README.md) | **中文**

</div>

> [!NOTE]
> 本仓库分叉自 **[tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension)**，分叉点为上游提交 [`af48716`](https://github.com/looikaizhi/c2c-platform-tlsn/commit/af48716)（2026-02-04）。本页只介绍分叉后新增的内容。浏览器扩展、插件 SDK 与验证服务器本身的用法，请看 **[上游 README](https://github.com/tlsnotary/tlsn-extension#readme)**。

## 简介

这是我硕士论文的代码实现：一个半去中心化的 C2C 兑换协议。买家通过支付宝或 Wise 付款，浏览器扩展为这笔付款生成 MPC-TLS 证明，验证服务器核验后签名，托管合约核对签名后再放出加密货币。在这个设计里，验证服务器仍是需要信任的一方。

协议设计、安全分析和实测数据另见 **[looikaizhi/zktls-c2c-exchange](https://github.com/looikaizhi/zktls-c2c-exchange)**。

## 相对上游的改动

<table>
  <tr>
    <th width="22%">包</th>
    <th width="12%">改动</th>
    <th>内容</th>
  </tr>
  <tr>
    <td><a href="../packages/contracts"><code>contracts</code></a></td>
    <td>新增</td>
    <td>托管、证明核验、风控与保证金的 Solidity 合约（Hardhat）</td>
  </tr>
  <tr>
    <td><a href="../packages/web"><code>web</code></a></td>
    <td>新增</td>
    <td>交易 dApp（Next.js、wagmi、viem）</td>
  </tr>
  <tr>
    <td><a href="../packages/keeper"><code>keeper</code></a></td>
    <td>新增</td>
    <td>根据合约事件清理过期订单的服务</td>
  </tr>
  <tr>
    <td><a href="../packages/verifier"><code>verifier</code></a></td>
    <td>扩展</td>
    <td>证明存储与查询接口、SIWE / API Key 鉴权、限流、用以太坊密钥签名结果</td>
  </tr>
  <tr>
    <td><a href="../packages/extension"><code>extension</code></a></td>
    <td>扩展</td>
    <td>侧边栏、转录承诺、核对验证服务器签名</td>
  </tr>
  <tr>
    <td><a href="../packages/plugin-sdk"><code>plugin-sdk</code></a></td>
    <td>扩展</td>
    <td>承诺、签名与证明导出相关类型</td>
  </tr>
  <tr>
    <td><a href="../packages/demo"><code>demo</code></a></td>
    <td>扩展</td>
    <td>支付宝、Wise、Binance 插件；交易、商家、管理演示面板</td>
  </tr>
  <tr>
    <td><a href="../packages/tlsn-wasm-pkg"><code>tlsn-wasm-pkg</code></a></td>
    <td>重新编译</td>
    <td>WASM 证明器绑定</td>
  </tr>
</table>

`common`、`tutorial`、`tlsn-wasm` 与上游相同。论文概念与代码文件的对应关系见[源码地图](https://github.com/looikaizhi/zktls-c2c-exchange/blob/main/docs/zh/reference/code-map.md)。

## 启动方式

需要 Node.js ≥ 18、Rust（stable）、装有 MetaMask 的 Chrome，以及用于实际转账的**支付宝或 Wise 账号**。从仓库根目录开始，按下面的顺序，每一步开一个终端。

```bash
# 0. 安装依赖（只需一次）
git clone https://github.com/looikaizhi/c2c-platform-tlsn.git
cd c2c-platform-tlsn
npm install
```

```bash
# 1. 本地链（http://127.0.0.1:8545，chain ID 31337）
cd packages/contracts
npm run node
```

```bash
# 2. 验证服务器（端口 7047，读取 packages/verifier/.env）
cd packages/verifier
cargo run
```

```bash
# 3. dApp（端口 3001）
cd packages/web
cp .env.example .env.local       # 只需一次；设 NEXT_PUBLIC_DISABLE_WC=true，或填入 NEXT_PUBLIC_WC_PROJECT_ID
npm run db:migrate               # 只需一次；创建 data/c2c.db
npm run dev                      # 先部署合约，再启动 Next.js
```

```bash
# 4. Keeper（等第 3 步部署完成后再启动）
cd packages/keeper
cp .env.example .env             # 只需一次
npm run dev
```

```bash
# 5. 浏览器扩展
npm run dev                      # 在仓库根目录执行；构建到 packages/extension/build/
```

然后在 Chrome 打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序，选择 `packages/extension/build/`。在 MetaMask 里添加网络 `http://127.0.0.1:8545`（chain ID 31337），并导入 Hardhat 测试账户：#0 是管理员，#1 是预置的商家，#4–#8 是已充值测试 USDT / USDC 的买家账户。

打开 `http://localhost:3001`。买家绑定自己的支付宝或 Wise 账户、下单，在真实平台上向商家付款，用扩展为这笔付款生成证明，再提交证明，合约随即放出加密货币。

> [!NOTE]
> 第 3 步之前，先在 [`packages/contracts/scripts/deploy-web.ts`](../packages/contracts/scripts/deploy-web.ts) 的 `MERCHANT_*` 常量里填好预置商家的支付宝 / Wise 收款账户。买家必须转账到这个账户，否则证明与商家在链上的绑定对不上。
>
> 第 3 步每次启动都会重新部署合约，并停掉正在运行的 Keeper，所以之后要重新启动 Keeper。`packages/verifier/.env` 里的验证服务器私钥是 Hardhat 第 9 号账户，部署脚本会把它登记为受信任的验证服务器，仅供本地使用。

兑换的每一步说明见[演示走查](https://github.com/looikaizhi/zktls-c2c-exchange/blob/main/docs/zh/hands-on/02-demo-walkthrough.md)，常见报错见[排错速查](https://github.com/looikaizhi/zktls-c2c-exchange/blob/main/docs/zh/hands-on/03-troubleshooting.md)。

## 致谢

本项目基于 TLSNotary / PSE 团队的 [tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension) 构建，感谢原作者们（@0xtsukino、@hendrikeeckhaut、@mhchia 及其他 TLSNotary 贡献者）。哪些部分是他们的、哪些是我的，见 [ATTRIBUTION.zh-CN.md](./ATTRIBUTION.zh-CN.md)。

## 许可

可任选 [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0) 或 [MIT license](http://opensource.org/licenses/MIT) 授权使用。
