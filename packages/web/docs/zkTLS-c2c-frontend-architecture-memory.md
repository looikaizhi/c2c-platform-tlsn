# zkTLS C2C 前端架构优化记忆体（v1）

- 记录时间：2026-03-31
- 项目范围：`packages/web`（Next.js + React）
- 当前目标：先完成架构设计记忆体，不直接修改业务代码

## 1. 设计依据（来自两个 skill + 现状代码）

### 1.1 Skill 约束（`frontend-design`）
- 必须先确定明确视觉方向，再拆分代码结构。
- 视觉不能走“模板化 AI 风格”，要有强识别度。
- 字体、色彩、动效、信息层次要统一到同一设计语言。

### 1.2 Skill 约束（`ui-ux-pro-max`）
- 先建立 design system，再落地页面/组件架构。
- 高优先级先做：可访问性、交互反馈、性能、响应式。
- 推荐在 React/Next 侧引入更稳定的请求缓存与状态边界。

### 1.3 当前代码基线（已审阅）
- 页面入口：`app/page.tsx`、`app/dashboard/page.tsx`、`app/merchant/page.tsx`
- 核心组件：`TradingPage`、`ExpressPage`、`P2P_Page`、`MerchantPanel`
- 交易流程：`PlaceOrderModal` + `PaymentWindows` + `TlsnVerifyButton`
- 核心 hooks：`useWallet`、`useOrderFlow`、`useContract`、`useProducts`、`useTlsnExtension`
- 数据接口：`app/api/*` + `lib/apiClient.ts`（DB 查询 + 汇率接口）

## 2. 当前前端主要结构问题（用于后续优化优先级）

1. 页面组件职责过重：UI、请求、流程状态、链交互混在同一层。
2. 状态分散：多个组件各自调用 `useWallet`，缺少统一会话层。
3. 交易流程不是显式状态机：步骤切换依赖局部状态，维护成本高。
4. 样式体系分裂：Tailwind + 全局 CSS + 页面 CSS 并行，缺少 Design Token。
5. 视觉语义不统一：深色交易区和浅色 dashboard 风格断层。
6. 数据请求缺少统一缓存/失效策略：`useEffect + fetch` 手工管理较多。
7. 路由信息表达不足：交易模式切换仅在组件内部，URL 不可分享当前视图。

## 3. 目标产品体验定位（面向“zkTLS 半去中心化 C2C”）

## 3.1 体验关键词
- Trust-minimized
- Audit-friendly
- Low-friction trading
- Protocol control room

### 3.2 视觉方向（本项目建议）
- 风格名：**Protocol Control Room Minimalism**
- 基调：深色中性背景 + 高对比状态色（成功/风险/处理中）
- 结果：既保留金融严肃感，也体现 zkTLS 的“可验证”技术气质

### 3.3 字体与图形建议
- 标题/正文：`IBM Plex Sans`
- 数据/哈希/金额：`IBM Plex Mono`
- 图标：统一 `lucide-react`，禁用 emoji 作为结构性图标

## 4. 目标前端架构（建议采用 Feature + Domain 分层）

```text
packages/web/src
├─ app/                         # 路由层（Next App Router）
│  ├─ (trade)/
│  │  ├─ page.tsx               # /trade 或 /
│  │  ├─ express/page.tsx
│  │  ├─ p2p/page.tsx
│  │  └─ bulk/page.tsx
│  ├─ dashboard/page.tsx
│  ├─ merchant/page.tsx
│  ├─ orders/[orderId]/page.tsx
│  └─ api/...
├─ widgets/                     # 页面级组合块
│  ├─ app-shell/
│  ├─ trade-workspace/
│  ├─ orderbook-panel/
│  └─ merchant-workspace/
├─ features/                    # 用户动作闭环
│  ├─ wallet-connect/
│  ├─ trade-mode-switch/
│  ├─ quote-converter/
│  ├─ place-order/
│  ├─ payment-method-select/
│  └─ tlsn-verify/
├─ entities/                    # 领域实体
│  ├─ wallet/
│  ├─ order/
│  ├─ merchant/
│  ├─ product/
│  └─ quote/
├─ processes/                   # 跨 feature 流程
│  ├─ order-lifecycle/
│  └─ merchant-onboarding/
└─ shared/
   ├─ ui/                       # Button/Card/Modal/Table 等
   ├─ lib/                      # request client、格式化工具
   ├─ config/                   # 常量、环境变量 schema
   ├─ styles/                   # token、主题、动效
   └─ types/
```

## 5. 路由与信息架构策略

1. 保留 `/`，并作为 `/trade` 的入口别名。
2. 将交易模式路由化：`/trade/express`、`/trade/p2p`、`/trade/bulk`。
3. 交易详情独立：`/orders/[orderId]`（便于分享、追踪、审计）。
4. Merchant 和 Dashboard 继续独立域，但共享同一 App Shell 与设计语言。

## 6. 状态管理与数据层策略

### 6.1 状态分层
- Server State：行情、订单列表、支付方式、dashboard 数据。
- Session State：钱包连接、chainId、TLSN 扩展状态。
- UI State：弹窗开关、筛选条件、本地输入态。
- Process State：下单-支付-验证-完成（强约束流程状态）。

### 6.2 建议技术策略（后续改造时采用）
1. Server State：引入 `TanStack Query`（或最小改造先用 SWR）。
2. Session State：`WalletProvider + TlsnProvider`，避免多处各自初始化。
3. Process State：订单流程改成 reducer/状态机模型，事件驱动：
   - `ORDER_CREATED`
   - `PAYMENT_METHOD_SELECTED`
   - `FIAT_PAID`
   - `TLSN_PROOF_SUBMITTED`
   - `ORDER_SETTLED` / `ORDER_REFUNDED`

## 7. 组件职责重划分（针对现有文件）

1. `TradingPage` 仅做“路由容器 + 模式切换”，不承载业务请求。
2. `P2P_Page` 拆为：
   - `OrderBookFilters`
   - `OrderBookTable`
   - `OrderFlowModalHost`
3. `PaymentWindows` 从 `P2P_Page` 内部提升为独立 feature 流程组件。
4. `MerchantPanel` 按 tab 拆成子模块，状态与视图解耦。
5. `TlsnVerifyButton` 拆成：
   - `PluginSelector`
   - `VerifyActionButton`
   - `ProofProgressPanel`

## 8. 设计系统记忆（后续 UI 优化必须遵守）

### 8.1 主题 Token（建议）
- `--bg-base: #0B1020`
- `--bg-surface: #111827`
- `--bg-elevated: #1F2937`
- `--text-primary: #E5E7EB`
- `--text-secondary: #9CA3AF`
- `--accent-primary: #2563EB`
- `--accent-cta: #F97316`
- `--state-success: #22C55E`
- `--state-warning: #F59E0B`
- `--state-danger: #EF4444`

### 8.2 交互与动效
- 交互动效 150-300ms，避免花哨装饰动画。
- 所有异步按钮必须带 loading + 禁止重复点击。
- 长耗时流程统一 skeleton/progress，不允许“无反馈等待”。

### 8.3 可访问性最低要求
- 对比度 >= 4.5:1
- 错误提示支持 `role="alert"` 或 `aria-live`
- 键盘可达（尤其弹窗与下拉）
- 重要状态不只靠颜色表达（加文案/图标）

## 9. 性能与工程化改造方向

1. `next/font` 管理字体，避免 FOIT/FOUT 抖动。
2. TLSN 插件相关逻辑动态加载，降低首屏 JS 体积。
3. 大组件按流程拆分后按需加载（`next/dynamic`）。
4. 请求层统一错误处理与重试策略，减少重复模板代码。
5. 建立 `shared/lib/http`，对 `apiClient.ts` 做类型化重构（可配合 zod）。

## 10. 分阶段优化路线图（后续执行顺序）

### Phase 0：基线固化
- 补齐本记忆文档并冻结视觉/分层原则。

### Phase 1：Design System 与 App Shell
- 建立 token、字体、基础组件（Button/Card/Input/Modal/Table）。
- 统一 Header 与主布局，解决跨页面视觉割裂。

### Phase 2：交易域重构（优先）
- 重构 `/trade/*`，拆分 `P2P_Page` 流程状态。
- 把订单流程改为可追踪状态机。

### Phase 3：商家域与 Dashboard
- Merchant tabs 模块化。
- Dashboard 数据卡与表格组件化、状态语义统一。

### Phase 4：质量门禁
- 无障碍检查、LCP/CLS 检查、交互回归检查。
- 建立页面级验收清单（375/768/1024/1440 断点）。

## 11. 本记忆体文档的使用方式（给后续优化回合）

1. 每次开始改造前，先对照本文件的「第4节架构目标 + 第8节设计系统记忆」。
2. 每次提交后，在本文件追加“变更记录（日期/模块/原因）”。
3. 若新需求与本文件冲突，以“交易安全、可验证流程可解释性、可访问性”优先。

---

## 附录 A：本次从 `ui-ux-pro-max` 提炼的关键决策

1. 先系统后页面：先统一 token/组件/状态模型，再逐页优化。
2. 最高优先级：可访问性、加载反馈、响应式与性能边界。
3. Next.js 应保持 App Router + Route Handlers 路线，不回退到旧范式。

## 变更记录
- 2026-03-31 (Phase 1/2 初始落地): 完成全局 token + 字体体系、Header 导航重构、交易路由重构为 /trade/*、WalletConnect 边界态修复、TlsnVerifyButton 图标体系统一、Dashboard 视觉统一。
- 2026-03-31 (Phase 2 结构化重构): 将 P2P_Page 拆分为 P2PFilters / P2POrderTable / P2PPaymentModal，主页面仅保留状态编排与数据获取；支付流程步骤语义化（select-method/payment-detail/verify/lock-crypto/waiting-merchant）。
- 2026-04-01 (Phase 3 组件化): MerchantPanel 拆分为 merchant 子模块（状态卡/TabBar/注册/上架/管理/订单）；Dashboard 拆分为 DashboardStats + DashboardOrdersTable，页面仅保留数据请求与排序状态。
- 2026-04-01 (Phase 4 质量门禁): 完成 a11y 收口（dialog 语义、aria-live/alert、按钮 type 与标签、reduced-motion），P2P 与 Merchant 路由侧按需加载优化，建立 ESLint Flat Config（忽略 .next/public plugins）并将 lint 迁移到 ESLint CLI；`npm run lint` 与 `tsc --noEmit` 均通过。
- 2026-04-01 (Phase 5 流程状态机化): P2P 交易主流程改为显式 reducer 事件（`ORDER_SELECTED / ORDER_CREATED / FLOW_RESET`），`useOrderFlow` 返回统一 action result（`ok/txHash/error`）以消除异步状态竞态；支付弹窗步骤切换改为事件驱动 reducer，并将付款金额从硬编码改为真实下单金额透传显示。
- 2026-04-01 (Phase 6 Server State + 订单详情路由): 引入 `@tanstack/react-query` 与全局 `AppQueryProvider`，新增订单列表/汇率/支付方式/Dashboard/订单详情 query hooks 并迁移 `P2P_Page`、`P2PPaymentModal`、`DashboardPage` 的手写 `useEffect + fetch`；新增 `/api/order/detail` 与 `/orders/[orderId]` 页面，Dashboard 与支付流程可直达订单详情。
- 2026-04-01 (Phase 7 Protocol Terminal 视觉重构): 完成全站核心页终端化重构（Header/Trade/P2P/Dashboard/Merchant/Order Detail），升级 Design System 2.0（深色四层背景、双层边框、状态语义色、160/220/280ms 动效 token）并新增统一 UI 基元（`SurfaceCard`/`MetricChip`/`SectionHeader`/`StatusPill`/`ActionButton`）；Express 新增可信指标模块与左信息右交易卡布局，P2P 订单列表升级为高密度可扫读卡片行，弹窗流程与主页面视觉语义统一。
- 2026-04-01 (Phase 7.1 Binance 风格回调 + Flex 居中): 根据最新偏好将视觉语言从 Protocol Terminal 回调到 Binance 语义（深色终端底色 + 黄色主 CTA + 高密度信息层级），全站核心页骨架统一改为 `flex`（Header / Trade / Dashboard / Merchant / Order Detail）并统一 `max-width + 居中` 规则；Express 首屏信息收敛为左说明右交易卡，P2P/看板/商家页按钮与状态标签语义统一；不新增页面、不改路由与后端接口、不改链上业务流程。
- 2026-04-01 (Phase 7.2 Binance P2P Express 高相似回调): 在不改业务逻辑的前提下，进一步将视觉结构贴近 Binance P2P 截图：Header 改为文字主导航+下划线激活态，`TradingPage` 改为固定二级子栏（左 `Express/P2P/Block` + 右 `Orders/Chat/User Center/More`），Express 区域收敛为左侧三层文案 + 右侧交易卡（Buy/Sell 切换、You Pay/Receive、Region、Estimated Price、黄主 CTA）。
