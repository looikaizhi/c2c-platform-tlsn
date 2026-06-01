<img src="../packages/extension/src/assets/img/icon-128.png" width="64"/>

# TLSN Extension 单体仓库（Monorepo）

[English](../README.md) | **中文**

一个面向 TLSNotary 的 Chrome 扩展，附带 plugin SDK 与 verifier 服务器。

> [!IMPORTANT]
> 当扩展连接 notary 服务器运行时，请确保服务器版本与本扩展版本一致。

## 关于本项目

本仓库在开源的 [TLSNotary Extension](https://github.com/tlsnotary/tlsn-extension) 基础上，扩展出一套 **C2C（个人对个人）加密–法币支付平台**。TLSNotary 扩展与 plugin SDK（由 TLSNotary / PSE 团队开发）提供了浏览器端 TLS 证明生成的核心能力。在此基础之上，本项目新增了 **C2C 协议层**：

- `packages/contracts` — C2C 托管 / 保证金 / 风控智能合约
- `packages/web` — C2C 交易 dApp
- `packages/keeper` — 链上结算 keeper
- 对 `packages/verifier` 与 `packages/demo` 的 C2C 专项扩展

底层 TLSNotary 协议层归其原作者所有；C2C 协议层为本人贡献。完整的分工已保留在 Git 提交历史与 GitHub Contributors 图中。详见 [docs/ATTRIBUTION.zh-CN.md](./ATTRIBUTION.zh-CN.md)。

## 致谢

本项目基于 TLSNotary / PSE 团队的 [tlsnotary/tlsn-extension](https://github.com/tlsnotary/tlsn-extension) 构建。特别感谢原作者们（@0xtsukino、@hendrikeeckhaut、@mhchia 等 TLSNotary 贡献者）——正是他们的工作，让我能够专注于 C2C 协议本身的设计。

## 目录

- [关于本项目](#关于本项目)
- [致谢](#致谢)
- [单体仓库结构](#单体仓库结构)
- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [开发](#开发)
- [生产构建](#生产构建)
- [端到端测试](#端到端测试)
- [运行 Demo](#运行-demo)
- [Websockify 集成](#websockify-集成)
- [发布](#发布)
- [许可证](#许可证)

## 单体仓库结构

本仓库以 npm workspaces 单体仓库形式组织，包含六个主要 package：

```
tlsn-extension/
├── packages/
│   ├── extension/           # Chrome 扩展（Manifest V3）
│   │   ├── src/
│   │   │   ├── entries/
│   │   │   │   ├── Background/     # 处理扩展逻辑的 Service Worker
│   │   │   │   ├── Content/        # 注入页面的内容脚本
│   │   │   │   ├── DevConsole/     # 带代码编辑器的开发者控制台
│   │   │   │   ├── Popup/          # 扩展弹窗 UI（可选）
│   │   │   │   └── Offscreen/      # 用于 DOM 操作的离屏文档
│   │   │   ├── manifest.json
│   │   │   └── utils/
│   │   ├── webpack.config.js
│   │   └── package.json
│   │
│   ├── plugin-sdk/          # 开发 TLSN 插件的 SDK
│   │   ├── src/
│   │   ├── examples/
│   │   └── package.json
│   │
│   ├── common/              # 共享工具（日志系统）
│   │   ├── src/
│   │   │   └── logger/           # 可配置级别的集中式日志
│   │   └── package.json
│   │
│   ├── verifier/            # 基于 Rust 的 verifier 服务器
│   │   ├── src/
│   │   │   └── main.rs           # 服务器初始化、路由与验证
│   │   ├── config.yaml           # Webhook 配置
│   │   └── Cargo.toml
│   │
│   ├── demo/                # 带 Docker 配置的 Demo 服务器
│   │   ├── *.js                  # 示例插件文件
│   │   └── docker-compose.yml    # Docker 服务配置
│   │
│   ├── tutorial/            # 教程示例
│   │   └── *.js                  # 教程插件文件
│   │
│   └── tlsn-wasm-pkg/       # 预构建的 TLSN WebAssembly 包
│       └── (WASM 二进制文件)
│
├── package.json             # 根 workspace 配置
└── README.md
```

### Package 详情

#### 1. **extension** —— Chrome 扩展（Manifest V3）
一个启用 TLSNotary 功能的浏览器扩展，主要特性如下：
- **多窗口管理**：跟踪多个浏览器窗口并拦截请求
- **开发者控制台**：用于编写和测试 TLSN 插件的交互式代码编辑器
- **请求拦截**：捕获受管窗口的 HTTP/HTTPS 请求
- **插件执行**：使用 QuickJS 运行沙箱化的 JavaScript 插件
- **TLSN 浮层**：可视化展示被拦截的请求

**关键入口点：**
- `Background`：处理扩展逻辑、窗口管理与消息路由的 Service Worker
- `Content`：注入页面、用于通信与浮层显示的脚本
- `DevConsole`：通过右键菜单访问的代码编辑器页面
- `Popup`：可选的扩展弹窗 UI
- `Offscreen`：弥补 Service Worker 限制的后台 DOM 操作

#### 2. **plugin-sdk** —— 插件开发 SDK
用于开发和运行带 QuickJS 沙箱的 TLSN WebAssembly 插件：
- 在隔离的 WebAssembly 环境中安全执行 JavaScript
- 受控的 Host 能力（capability）系统
- 类 React 的 hooks：`useHeaders()`、`useRequests()`、`useEffect()`、`useState()`、`setState()`
- 适用于 Node.js 与浏览器的同构（isomorphic）包
- 完整 TypeScript 类型声明支持

#### 3. **common** —— 共享工具
跨 package 使用的集中式日志系统：
- 可配置日志级别：`DEBUG`、`INFO`、`WARN`、`ERROR`
- 带时间戳与级别前缀的输出
- 单例模式，保证各模块日志一致

#### 4. **verifier** —— Verifier 服务器
基于 Rust 的 HTTP/WebSocket 服务器，用于 TLSNotary 验证：
- 健康检查端点（`GET /health`）
- 会话创建端点（`WS /session`）
- WebSocket 验证端点（`WS /verifier?sessionId=<id>`）
- WebSocket 代理端点（`WS /proxy?token=<host>`）—— 兼容 notary.pse.dev
- 用于向外部服务发送 POST 通知的 Webhook API
- 通过 YAML 配置 webhook 端点（`config.yaml`）
- 启用 CORS 以支持跨域请求
- 默认运行于 `localhost:7047`

#### 5. **demo** —— Demo 服务器
基于 Docker 的演示环境，包含：
- 预配置的示例插件（Twitter、SwissBank）
- 基于环境变量配置的 React + Vite 前端
- 包含 verifier 与 nginx 的 Docker Compose 配置
- 可通过 `.env` 文件或 Docker 构建参数配置 verifier URL

#### 6. **tlsn-wasm-pkg** —— TLSN WebAssembly 包
用于在浏览器中实现 TLSNotary 功能的预构建 WebAssembly 二进制。

## 架构概览

### 扩展架构

扩展采用消息传递（message-passing）架构，包含五个主要入口点：

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                         │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                      │
│  │  Background  │◄────►│   Content    │◄──── Page Scripts    │
│  │    (SW)      │      │   Script     │                      │
│  └──────┬───────┘      └──────────────┘                      │
│         │                                                     │
│         ├─► Window Management (WindowManager)                │
│         ├─► Request Interception (webRequest API)            │
│         ├─► Session Management (SessionManager)              │
│         └─► Message Routing                                  │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                      │
│  │ DevConsole   │      │   Offscreen  │                      │
│  │  (Editor)    │      │  (Background)│                      │
│  └──────────────┘      └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │   Verifier   │
                   │    Server    │
                   │ (localhost:  │
                   │    7047)     │
                   └──────────────┘
```

### 消息流

**打开一个受管窗口：**
```
Page → window.tlsn.open(url)
  ↓ window.postMessage(TLSN_OPEN_WINDOW)
Content Script → 事件监听器
  ↓ browser.runtime.sendMessage(OPEN_WINDOW)
Background → WindowManager.registerWindow()
  ↓ browser.windows.create()
  ↓ 返回带 UUID 的窗口信息
```

**请求拦截：**
```
Browser → 受管窗口中的 HTTP 请求
  ↓ webRequest.onBeforeRequest
Background → WindowManager.addRequest()
  ↓ browser.tabs.sendMessage(UPDATE_TLSN_REQUESTS)
Content Script → 更新 TLSN 浮层 UI
```

## 快速开始

### 前置条件

- **Node.js** >= 18
- **Rust**（用于 verifier 服务器）—— 从 [rustup.rs](https://rustup.rs/) 安装
- **Chrome/Chromium** 浏览器

### 安装

1. 克隆仓库：
```bash
git clone https://github.com/tlsnotary/tlsn-extension.git
cd tlsn-extension
```

2. 安装所有依赖：
```bash
npm install
```

这会为单体仓库内所有 package 安装依赖，并自动建立各 package 之间的 workspace 链接。

## 开发

### 以开发模式运行扩展

1. 启动开发服务器：
```bash
npm run dev
```

这会自动构建所有依赖（common、plugin-sdk），然后在 3000 端口启动带热模块替换（HMR）的 webpack-dev-server。文件会写入 `packages/extension/build/`。

2. 在 Chrome 中加载扩展：
   - 打开 `chrome://extensions/`
   - 启用右上角的「开发者模式」开关
   - 点击「加载已解压的扩展程序」
   - 选择 `packages/extension/build/` 文件夹

3. 文件变更时扩展会自动重载（manifest 变更需手动刷新）。

### 运行 Verifier 服务器

E2E 测试需要 verifier 服务器。在单独的终端运行：

```bash
cd packages/verifier
cargo run
```

服务器将启动于 `http://localhost:7047`。

**Verifier API 端点：**
- `GET /health` —— 健康检查
- `WS /session` —— 创建新的验证会话
- `WS /verifier?sessionId=<id>` —— WebSocket 验证端点
- `WS /proxy?token=<host>` —— 用于 TLS 连接的 WebSocket 代理（兼容 notary.pse.dev）

**Webhook 配置：**
配置 `packages/verifier/config.yaml`，可在验证成功后接收 POST 通知：
```yaml
webhooks:
  "api.x.com":
    url: "https://your-backend.example.com/webhook/twitter"
    headers:
      Authorization: "Bearer your-secret-token"
  "*":  # 匹配未命中服务器名的通配符
    url: "https://your-backend.example.com/webhook/default"
```

### 各 Package 的单独开发

**Extension：**
```bash
cd packages/extension
npm run dev              # 开发模式
npm run test             # 运行测试
npm run test:watch       # 监听模式
npm run test:coverage    # 覆盖率报告
npm run lint             # 代码检查
npm run lint:fix         # 自动修复代码风格问题
```

**Plugin SDK：**
```bash
cd packages/plugin-sdk
npm run build            # 构建 SDK
npm run test             # 运行测试
npm run lint             # 运行全部 linter
npm run lint:fix         # 自动修复问题
```

> **注意：** 构建扩展时会自动构建 plugin-SDK，通常无需手动构建。

**Verifier：**
```bash
cd packages/verifier
cargo run                # 开发模式
cargo build --release    # 生产构建
cargo test               # 运行测试
```

## 生产构建

### 构建生产版扩展

在仓库根目录：

```bash
NODE_ENV=production npm run build
```

这会自动：
1. 构建依赖（`@tlsn/common` 与 `@tlsn/plugin-sdk`）
2. 以生产优化方式构建扩展
3. 生成：
   - 优化后的构建产物，位于 `packages/extension/build/`
   - 打包好的扩展，位于 `packages/extension/zip/extension-{version}.zip`

该 zip 文件可直接用于提交到 Chrome 应用商店。

**其他构建命令：**
- `npm run build:extension` —— 仅构建扩展（假定依赖已构建）
- `npm run build:deps` —— 仅构建依赖

### 构建所有 Package

```bash
npm run build:all
```

这会构建单体仓库内所有 package（extension、plugin-sdk）。

### 构建生产版 Verifier

```bash
cd packages/verifier
cargo build --release
```

二进制文件将位于 `target/release/`。

## 端到端测试

要测试完整的 TLSN 工作流：

### 1. 启动 Verifier 服务器

在一个终端：
```bash
cd packages/verifier
cargo run
```

确认其正在运行：
```bash
curl http://localhost:7047/health
# 应返回：ok
```

### 2. 以开发模式启动扩展

在另一个终端：
```bash
npm run dev
```

在 Chrome 中加载扩展（参见[快速开始](#快速开始)）。

### 3. 打开开发者控制台

1. 在任意网页上右键
2. 从右键菜单选择「Developer Console」
3. 将打开一个带代码编辑器的新标签页

### 4. 运行测试插件

开发者控制台自带一个默认的 X.com 资料证明插件。测试步骤：

1. 确保 verifier 运行在 `localhost:7047`
2. 查看编辑器中的默认代码（或按需修改）
3. 点击「▶️ Run Code」按钮
4. 该插件将：
   - 打开一个指向 X.com 的新窗口
   - 拦截请求
   - 创建到 verifier 的 prover 连接
   - 显示展示进度的 UI 浮层
   - 执行证明工作流

**控制台输出：**
- 执行状态与耗时
- 插件日志与结果
- 遇到的任何错误

### 5. 验证请求拦截

当受管窗口被打开时：
1. 出现一个显示「TLSN Plugin In Progress」的浮层
2. 被拦截的请求会实时列出
3. 随着更多请求被捕获，请求计数会更新

### 测试不同插件

你可以在开发者控制台编辑器中编写自定义插件：

```javascript
// 示例：一个生成证明的简单插件
const config = {
  name: 'My Plugin',
  description: 'A custom TLSN plugin'
};

async function onClick() {
  console.log('Starting proof...');

  // 等待特定的 header 被拦截
  const [header] = useHeaders(headers => {
    return headers.filter(h => h.url.includes('example.com'));
  });

  console.log('Captured header:', header);

  // 使用统一的 prove() API 生成证明
  const proof = await prove(
    // 请求选项
    {
      url: 'https://example.com/api/endpoint',
      method: 'GET',
      headers: {
        'Authorization': header.requestHeaders.find(h => h.name === 'Authorization')?.value,
        'Accept-Encoding': 'identity',
        'Connection': 'close',
      },
    },
    // Prover 选项
    {
      verifierUrl: 'http://localhost:7047',
      proxyUrl: 'wss://notary.pse.dev/proxy?token=example.com',
      maxRecvData: 16384,
      maxSentData: 4096,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'BODY', action: 'REVEAL',
          params: { type: 'json', path: 'username' } }
      ]
    }
  );

  console.log('Proof generated:', proof);
  done(JSON.stringify(proof));
}

function main() {
  const [header] = useHeaders(headers => {
    return headers.filter(h => h.url.includes('example.com'));
  });

  // 首次渲染时打开一个受管窗口
  useEffect(() => {
    openWindow('https://example.com');
  }, []);

  // 渲染插件 UI 组件
  return div({}, [
    div({}, [header ? 'Ready to prove' : 'Waiting for headers...']),
    header ? button({ onclick: 'onClick' }, ['Generate Proof']) : null
  ]);
}

export default {
  main,
  onClick,
  config,
};
```

### 测试技巧

- **监控后台 Service Worker**：通过 `chrome://extensions/` → 扩展详情 → 「检查视图：service worker」打开后台 Service Worker 的 Chrome DevTools
- **查看控制台日志**：留意 WindowManager 日志、请求拦截日志与消息路由日志
- **测试多窗口**：尝试同时打开多个受管窗口（最多 10 个）
- **Verifier 连接**：运行证明前，确保 verifier 可在 `localhost:7047` 访问

## 运行 Demo

demo package 提供了一个用于测试 TLSNotary 插件的完整环境。

### 使用 Docker 快速开始

```bash
# 启动所有服务（verifier + demo 服务器）
npm run docker:up

# 停止服务
npm run docker:down
```

这会启动：
- 运行于 7047 端口的 verifier 服务器
- 通过 nginx 在 80 端口提供的 demo 静态文件

### 手动搭建 Demo

```bash
# 在本地提供 demo 文件
npm run demo

# 在浏览器中打开 http://localhost:8080
```

### 环境变量

demo 使用 `.env` 文件进行配置：
- `.env` —— 本地开发默认值（`localhost:7047`）
- `.env.production` —— 生产设置（`verifier.tlsnotary.org`，启用 SSL）

对于 Docker 部署，可通过环境变量覆盖：
```bash
# 本地开发（默认）
npm run docker:up

# 使用自定义 verifier 的生产部署
VITE_VERIFIER_HOST=verifier.example.com VITE_SSL=true docker compose up --build
```

### 教程

```bash
# 提供教程示例
npm run tutorial

# 在浏览器中打开 http://localhost:8080
```

## Websockify 集成

用于对 TLS 连接进行 WebSocket 代理（可选）：

### 构建 Websockify Docker 镜像
```bash
git clone https://github.com/novnc/websockify && cd websockify
./docker/build.sh
```

### 运行 Websockify
```bash
# 用于 X.com
docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443

# 用于 Twitter
docker run -it --rm -p 55688:80 novnc/websockify 80 api.twitter.com:443
```

这会将 HTTPS 连接通过 WebSocket 代理，以支持浏览器端的 TLS 操作。

## 发布

### Chrome 应用商店

1. 创建生产构建：
```bash
NODE_ENV=production npm run build
```

2. 充分测试扩展

3. 将 `packages/extension/zip/extension-{version}.zip` 上传至 [Chrome 应用商店开发者后台](https://chrome.google.com/webstore/devconsole)

4. 遵循 [Chrome 应用商店发布指南](https://developer.chrome.com/webstore/publish)

### 预构建扩展

安装 TLSN 浏览器扩展最简单的方式，是从 [Chrome 应用商店](https://chromewebstore.google.com/detail/tlsn-extension/gcfkkledipjbgdbimfpijgbkhajiaaph)安装。

## 资源

- [TLSNotary 文档](https://docs.tlsnotary.org/)
- [Webpack 文档](https://webpack.js.org/concepts/)
- [Chrome 扩展文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)

## 许可证

本仓库采用以下任一许可证授权：

- [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
- [MIT license](http://opensource.org/licenses/MIT)

任选其一。
