# TLSNotary C2C Demo —— 架构与功能总览

本文档介绍 [packages/demo](.) 整个演示应用的架构、提供的功能，以及如何运行和使用它。

> 如果你想自己写一个 TLSN plugin，请阅读配套文档：[PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md)。

---

## 1. 这个 Demo 是什么？

`packages/demo` 是一个基于 **React + Vite** 的网页，用来演示 **TLSNotary C2C（Consumer-to-Consumer）兑换平台** 的完整工作流：

- 用户在 **Trading Hall** 下单（法币 ↔ 加密货币兑换）
- 商家在自己的支付平台（Alipay / Wise）完成支付
- 商家在浏览器里运行 **TLSN Plugin**，对支付页面的 HTTPS 响应生成 **零知识 TLS 证明（zkTLS proof）**
- 证明被提交到链上合约，触发 **自动放币**

整个流程围绕 4 条 C2C 路径展开：

| 路径 | 法币端 | 加密端 |
|------|--------|--------|
| Wise-Crypto  | Wise (USD/EUR…) | USDT / USDC |
| Wise-Fiat    | Wise            | Wise (跨币种) |
| Alipay-Crypto| Alipay (CNY)    | USDT / USDC |
| Alipay-Fiat  | Alipay          | Alipay (CNY 互转) |

---

## 2. 仓库内目录结构

```
packages/demo/
├── README.md                # 启动方式（旧版，简版）
├── ADDING_PLUGINS.md        # 在前端注册插件卡片
├── DEMO_ARCHITECTURE.md     # ← 本文件
├── PLUGIN_DEVELOPMENT.md    # ← 配套：插件开发完整教程
├── tutorial.md              # 早期 Swiss-Bank 教程（参考）
│
├── index.html               # Vite 入口
├── vite.config.ts           # 主前端构建配置
├── build-plugins.js         # 把 plugins/*.plugin.ts 编译为 public/plugins/*.js
├── tsconfig.plugins.json    # 插件专用 TS 配置
├── docker-compose.yml       # verifier + 静态站 + nginx
├── Dockerfile               # 前端镜像
├── nginx.conf               # 反向代理
│
├── plugins/                 # ⭐ 插件源码（TypeScript）
│   ├── alipay.plugin.ts
│   ├── binance.plugin.ts
│   └── wise.plugin.ts
│
├── public/plugins/          # ⭐ 编译后的插件 JS（被 fetch 加载）
│   ├── alipay.js
│   ├── binance.js
│   └── wise.js
│
├── src/
│   ├── App.tsx              # 整页布局，串联所有 Panel
│   ├── main.tsx             # React 挂载
│   ├── plugins.ts           # ⭐ 插件清单（前端展示用）
│   ├── types.ts             # Plugin / PluginResult / 全局 window.tlsn 声明
│   ├── config.ts            # 读取 VITE_VERIFIER_HOST / VITE_SSL
│   │
│   ├── components/          # UI 组件
│   │   ├── ui.tsx                 # UI 原语 + design tokens（单一信源）
│   │   ├── ui.module.css          # 原语 CSS（btn / badge / skeleton / modal）
│   │   ├── DeployPanel.tsx        # 显示已部署合约地址
│   │   ├── AdminPanel.tsx         # 平台/链状态总览
│   │   ├── MerchantPanel.tsx      # 商家库存/挂单
│   │   ├── UserPanel.tsx          # 用户余额/订单
│   │   ├── TradingHall.tsx        # 下单入口（PlatformAdapter-driven）
│   │   ├── BindingRow.tsx         # 平台账号绑定行（跨 UserPanel / TradingHall）
│   │   ├── PluginButtons.tsx      # 运行插件入口
│   │   ├── HowItWorks.tsx         # 三步说明
│   │   ├── WhyPlugins.tsx
│   │   ├── BuildYourOwn.tsx
│   │   ├── SystemChecks.tsx       # 浏览器/扩展/verifier 体检
│   │   ├── StatusBar.tsx          # 顶部状态条
│   │   ├── ConsoleOutput.tsx      # 控制台输出（订阅 useConsoleStore）
│   │   ├── MyProofs.tsx           # 浏览已生成的 proofs
│   │   ├── ProofDetail.tsx        # 单条 proof 详情
│   │   ├── ProofsList.tsx
│   │   ├── AdminAudit.tsx
│   │   ├── ReputationBadge.tsx
│   │   └── CollapsibleSection.tsx
│   │
│   └── utils/               # 业务工具层（10 个文件，无子目录，路径深度统一为 2）
│       ├── chain.ts               # 链选择 + 合约地址 + 钱包客户端 + 错误解码 + OrderView
│       ├── abis.ts                # 5 个 ABI 常量（纯数据，与 chain 分离）
│       ├── platforms.ts           # PlatformAdapter 注册表 + runPaymentPlugin
│       ├── proof.ts               # Transformer + API + Auth + Artifact + backfillProofTx
│       ├── services.ts            # 业务用例（placeOrder / submitPaymentProofs / claimBond / Binding / Reconcile）
│       ├── hooks.ts               # React Query 单实例 + qk 工厂 + use*Data
│       ├── store.ts               # zustand 三 store（UI tabs / Toast / Console，禁 persist）
│       ├── lib.ts                 # 纯工具（truncateAddr / fmt4 / fiatEstimate / formatUserFacingError）
│       ├── deployDemoState.ts     # 部署后种子数据（与重构无关，保持原状）
│       ├── verifySignature.ts     # 客户端验签
│       └── verifySignature.test.ts
│
├── scripts/start-dev.js     # `npm run dev` 的真实入口：编译插件 → 拉起 vite
└── experiments/             # 性能/网络实验脚本（4G / broadband / 跨区域）
```

---

## 3. 系统总架构

```
                   ┌────────────────────────┐
                   │   Chrome 浏览器        │
                   │  ┌──────────────────┐  │
                   │  │ Demo 前端 (Vite) │  │
                   │  │   localhost:3000 │  │
                   │  └────────┬─────────┘  │
                   │           │ window.tlsn.execCode(pluginJs)
                   │  ┌────────▼─────────┐  │
                   │  │  TLSN Extension  │  │ ← packages/extension
                   │  │  (MV3)           │  │
                   │  │  ┌────────────┐  │  │
                   │  │  │ Offscreen  │  │  │
                   │  │  │ + QuickJS  │  │  │
                   │  │  │  Sandbox   │  │  │
                   │  │  └─────┬──────┘  │  │
                   │  └────────│─────────┘  │
                   └───────────│────────────┘
                               │ TLS via WSS Proxy
                ┌──────────────▼──────────────┐
                │  notary.pse.dev/proxy        │
                │   或本地 wstcp               │
                └──────────────┬──────────────┘
                               │
                ┌──────────────▼──────────────┐
                │  目标 HTTPS 服务            │
                │  api.wise.com /             │
                │  mbillexprod.alipay.com / … │
                └──────────────┬──────────────┘
                               │
        ┌──────────────────────▼───────────────────────┐
        │     Verifier Server (Rust, port 7047)        │ ← packages/verifier
        │     /session  /verifier  /proxy              │
        └──────────────────────┬───────────────────────┘
                               │ Webhook（可选）
                ┌──────────────▼──────────────┐
                │  C2C 智能合约（Hardhat 本地链） │
                │  USDT / USDC / 订单簿 / 信誉    │
                └─────────────────────────────┘
```

关键事实：

- **没有任何用户密码/cookie 离开浏览器**。插件运行在 Extension 的 QuickJS 沙箱里，只把数据通过 TLS 协议送到目标服务器，verifier 只看到密文。
- 浏览器无法发起原生 TCP，因此走 **WSS 代理**（`wss://…/proxy?token=<host>`）把 WebSocket 帧透传成 TCP。
- Verifier 校验 TLS 握手 + transcript 后，签发 proof；可选地通过 webhook 把 redacted transcript 转发给后端做业务校验。

---

## 4. 前端功能一览

打开 `http://localhost:3000`，从上到下你会看到这些区块（对应 [src/App.tsx](src/App.tsx)）：

| 区块                | 组件                                            | 作用 |
|---------------------|--------------------------------------------------|------|
| Hero                | App 内联                                         | 标题：4-flow C2C exchange demo |
| **Deploy Panel**    | [DeployPanel.tsx](src/components/DeployPanel.tsx)| 展示 `npm run dev` 自动部署得到的合约地址、链 ID、verifier URL |
| **Admin Panel**     | [AdminPanel.tsx](src/components/AdminPanel.tsx)  | 平台维度的资产/费率/暂停开关一览 |
| **Merchant Panel**  | [MerchantPanel.tsx](src/components/MerchantPanel.tsx)| 商家库存、挂单、信誉 |
| **User Panel**      | [UserPanel.tsx](src/components/UserPanel.tsx)    | 当前用户余额、订单、`MyProofs` |
| **Trading Hall**    | [TradingHall.tsx](src/components/TradingHall.tsx)| 在 4 条路径里下单 |
| **How It Works**    | [HowItWorks.tsx](src/components/HowItWorks.tsx)  | 3 步流程说明 |
| **Status Bar**      | [StatusBar.tsx](src/components/StatusBar.tsx) + [SystemChecks.tsx](src/components/SystemChecks.tsx) | 浏览器 / Extension / Verifier 三项体检 |
| **Try It: Demo Plugins** | [PluginButtons.tsx](src/components/PluginButtons.tsx) | 一键跑 Alipay / Binance / Wise 插件 |
| **Why Plugins**     | [WhyPlugins.tsx](src/components/WhyPlugins.tsx)  | 介绍插件价值 |
| **Build Your Own**  | [BuildYourOwn.tsx](src/components/BuildYourOwn.tsx)| 文档/SDK/示例入口 |
| **Console Output**  | [Console.tsx](src/components/Console.tsx)        | 折叠式日志窗口，收集 plugin / offscreen 的输出 |

### 4.1 核心交互流程

**A. 启动体检**
`App.tsx` 在 `useEffect` 里调用 `runAllChecks()`：

1. `checkBrowserCompatibility()` — 必须 Chromium 内核
2. `checkExtension()` — 看 `window.tlsn` 是否注入
3. `checkVerifier()` — `GET http://localhost:7047/health`

三项全过 `allChecksPass = true`，插件按钮才可点击。

**B. 跑一个插件**

```
PluginButtons → handleRunPlugin(key)
   ↓
fetch('/plugins/alipay.js')          // 静态文件
   ↓
window.tlsn.execCode(pluginCode)     // 注入到 Extension
   ↓
Extension Offscreen → QuickJS 沙箱
   ↓
插件内调用 openWindow() 打开真实平台页面（如 alipay 后台）
用户登录、触发目标 HTTPS 请求
   ↓
插件 useHeaders() / useRequests() 抓到目标请求
   ↓
prove(requestOptions, proverOptions) — 经 WSS 代理跑 TLS-MPC
   ↓
done(JSON.stringify({ displayResults, proofs }))
   ↓
App.tsx parseResult() 渲染结果 + 保存 debug JSON
```

**C. 提交到链上**

PlatformAdapter 驱动的单一调用路径（Phase 6 后）：
- `utils/services.ts` 的 `placeOrder` / `makeBindingContext` / `submitPaymentProofs` 跨 CRYPTO 与 FIAT 路径统一签名；按 `assetType` 路由到链上 `payOrderByPlatform`（CRYPTO）或 `receiveCryptoWithPlatformPayment`（FIAT）。
- `utils/platforms.ts` 的 `runPaymentPlugin(adapter, ctx)` 注入 8 个 sentinel（`utils/proof.ts: injectPluginContext`）+ 可选 adapter.injectExtra（Wise 用于 TRANSFER 哈希），执行后按 `adapter.proofShape` 折叠出单 / 双 proof。
- `utils/proof.ts` 的 `buildContractProof` / `buildProofDebugSnapshot` 把 ExtensionProveResponse 序列化为合约 `TLSNProof` struct。
- `utils/proof.ts` 的 `backfillProofTx` / `backfillSessionIds` 在 tx confirm 后回填 verifier `proof_store.txHash`，409 计入 alreadyCommitted（非失败）。

新增第 3 个支付平台 = 在 `utils/platforms.ts` 加一个 PlatformAdapter 对象 + 一行 `adapters.set`，其它文件零修改。

---

## 5. 运行 Demo

### 5.1 前置依赖

| 依赖                  | 说明 |
|-----------------------|------|
| Node.js ≥ 18          | 仓库根 `npm install` 会拉所有 workspace 依赖 |
| Rust + cargo          | 编译 verifier |
| Chrome / Chromium     | TLSN 扩展只支持 Chromium |
| Docker（可选）        | `npm run docker:up` 一键启动 verifier+demo |

### 5.2 推荐流程：本地 npm 启动

从仓库根：

```bash
# 1. 安装所有 workspace 依赖
npm install

# 2. 构建并加载浏览器扩展
npm run build              # 产出 packages/extension/build/
#   Chrome → chrome://extensions/ → 开发者模式 → 加载已解压扩展 → 选 build/

# 3. 启动 verifier（新终端）
cd packages/verifier
cargo run --release        # 监听 7047

# 4. 启动 demo（新终端）
npm run demo
#   实际等价于：cd packages/demo && npm run dev
#   start-dev.js 会先 build:plugins，再启动 vite (port 3000)，并自动开浏览器
```

完成后浏览器打开 `http://localhost:3000`，三项体检全绿即可点 plugin 按钮。

### 5.3 一键 Docker 启动

```bash
# 从仓库根
npm run docker:up          # 起 verifier (7047) + nginx (80)
npm run docker:down        # 停止

# 自定义环境
VITE_VERIFIER_HOST=verifier.example.com VITE_SSL=true \
  docker compose -f packages/demo/docker-compose.yml up --build
```

| 容器           | 端口  | 作用 |
|----------------|-------|------|
| `verifier`     | 7047  | TLSN 验证服务 |
| `demo-static`  | —     | 构建后的静态前端 |
| `nginx`        | 80    | 反向代理，统一对外口 |

### 5.4 环境变量

| 变量                 | 默认值              | 说明 |
|----------------------|---------------------|------|
| `VITE_VERIFIER_HOST` | `localhost:7047`    | verifier 主机:端口 |
| `VITE_SSL`           | `false`             | 是否走 https/wss |
| `VITE_CHAIN_ID`      | （自动写入）        | 部署脚本写到 .env，被 DeployPanel 读取 |
| `GIT_HASH`           | `local`             | 注入到页脚版本号 |

`packages/demo/.env` 默认走本地，`.env.production` 走 `verifier.tlsnotary.org`。

---

## 6. 已内置的 3 个 Plugin

定义于 [src/plugins.ts](src/plugins.ts)，源码在 [plugins/](plugins/)：

| Key      | 源文件                                          | 目标接口 | 用途 |
|----------|--------------------------------------------------|----------|------|
| `alipay` | [plugins/alipay.plugin.ts](plugins/alipay.plugin.ts) | `POST mbillexprod.alipay.com/enterprise/fundReportDetailQuery.json` | 证明一笔支付宝商家收款（orderId / gmtSuccess / payeeName / payeeLoginEmail / payAmount / status） |
| `binance`| [plugins/binance.plugin.ts](plugins/binance.plugin.ts) | Binance KYC 接口 | 证明账户 KYC 状态（不暴露身份） |
| `wise`   | [plugins/wise.plugin.ts](plugins/wise.plugin.ts) | `GET wise.com/gateway/v2/profiles/*/contacts` + `GET …/v3/profiles/*/transfers/*` | 同时证明收款人在通讯录里 + 该笔 transfer 的状态/金额/币种/时间 |

### 6.1 选择性披露（Selective Disclosure）

所有插件都用 **handlers 数组** 决定 transcript 里哪些字节被 `REVEAL`，其它部分以 `PEDERSEN` 承诺方式保留。比如 Alipay 只暴露 `gmtSuccess`、`payAmount` 等关键字段，不会暴露 cookie 或 token。

### 6.2 上链桥接（sessionData + accountCheckFields）

插件 `prove()` 调用里带的 `sessionData.__tlsn_*` 字段，是从前端事先注入的 **sentinel hash**（订单绑定哈希、商户名/ID 哈希、付款人钱包地址等）。Verifier 把它们写进 webhook payload，C2C 合约据此校验「这条 proof 属于哪一笔订单」。`accountCheckFields` 让 verifier 在签发前就用 handler 的 `json_value` 反查这些 hash，避免链上事后撕。

---

## 7. 网络性能实验（`experiments/`）

`experiments/` 下是为论文/性能评估准备的 bash + Python 脚本，使用 Linux network namespace 模拟不同链路（理想 / 宽带 / 4G / 跨地域），并配合 `ws_router.py` 注入延迟：

- `setup_verifier_ns.sh` / `teardown_verifier_ns.sh`
- `run_ideal_local.sh` / `run_broadband_local.sh` / `run_4g_local.sh` / `run_crossregion_local.sh`
- `status_local.sh`、`clear_local.sh`
- 结果落库到 `evidence.db`

跟 demo 跑通无关，单纯是给研究用的。

---

## 8. 常见坑

1. **插件按钮一直灰**：先查体检里 `Extension installed` / `Verifier running` 是否过。Extension 必须用 `npm run build` 出来的 `packages/extension/build/` 去加载。
2. **403 / 401**：你忘了先在新开的真实平台窗口里登录（Wise、Alipay 后台）。插件靠抓取你登录后浏览器自然发出的请求来拿 cookie。
3. **prove 超时**：默认走 `wss://notary.pse.dev/proxy?token=<host>`。如果公网代理不稳，本地起 `wstcp --bind-addr 127.0.0.1:55688 <host>:443`，并修改插件里的 `PROXY_URL_BASE`。
4. **改完 .ts 没生效**：插件不是热更新的。`build-plugins.js` 只在 `npm run dev` 启动时跑一次。手动重跑：`cd packages/demo && node build-plugins.js`，或者重启 `npm run dev`。
5. **WSL2 + /mnt/d**：HMR 在 Windows 挂载下不可靠，编辑后请重启 vite。
