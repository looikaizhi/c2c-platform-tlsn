# Admin Console Control — 实施方案

## 概述

在 `packages/web` 的 Next.js 前端中新增一个 Admin Console Control 界面，供平台管理员通过 UI 与 `C2CAdmin` 合约交互，同时用 MySQL 数据库保存资产状态。

**涉及合约函数**：`addCryptoInfo`、`addFiatInfo`、`activateAsset`、`deactivateAsset`、`registerMerchantByAdmin`

---

## 技术栈

- **框架**: Next.js 14 App Router + TypeScript
- **数据库**: MySQL via `mysql2/promise`（复用 `src/server/database.ts` 连接池，env 已配置）
- **合约交互**: viem（复用 `contractConfig.ts` + `contractAbi.ts` 模式）
- **样式**: Tailwind CSS + 现有 CSS 变量（dark theme）

---

## 一、数据库设计

### 文件：`packages/web/src/server/migrations/001_admin_assets.sql`

```sql
-- 加密资产表
CREATE TABLE IF NOT EXISTS support_crypto_assets (
    id            INT          AUTO_INCREMENT PRIMARY KEY,
    crypto_id     INT          NOT NULL UNIQUE COMMENT '对应合约 supportCryptoList[i].id',
    token_symbol  VARCHAR(20)  NOT NULL,
    token_address VARCHAR(42)  NOT NULL UNIQUE,
    is_active     TINYINT(1)   NOT NULL DEFAULT 0,
    edit_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    created_time  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 法币资产表
CREATE TABLE IF NOT EXISTS support_fiat_assets (
    id           INT          AUTO_INCREMENT PRIMARY KEY,
    fiat_id      INT          NOT NULL UNIQUE COMMENT '对应合约 supportFiatList[i].id',
    fiat_name    VARCHAR(50)  NOT NULL UNIQUE,
    is_active    TINYINT(1)   NOT NULL DEFAULT 0,
    edit_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
    created_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 数据库操作触发时机

| 合约函数 | DB 操作 |
|---|---|
| `addCryptoInfo(tokenAddress, isActive)` | `INSERT INTO support_crypto_assets`，crypto_id 来自合约 event `SupportCryptoAdded` 的 `cryptoId` |
| `addFiatInfo(fiatName, isActive)` | `INSERT INTO support_fiat_assets`，fiat_id 来自合约 event `SupportFiatAdded` 的 `fiatId` |
| `activateAsset(id, CRYPTO=0)` | `UPDATE support_crypto_assets SET is_active=1 WHERE crypto_id=id` |
| `deactivateAsset(id, CRYPTO=0)` | `UPDATE support_crypto_assets SET is_active=0 WHERE crypto_id=id` |
| `activateAsset(id, FIAT=1)` | `UPDATE support_fiat_assets SET is_active=1 WHERE fiat_id=id` |
| `deactivateAsset(id, FIAT=1)` | `UPDATE support_fiat_assets SET is_active=0 WHERE fiat_id=id` |

**重要原则**：合约 tx 确认成功是写 DB 的前提，不可倒置。

---

## 二、后端 API

### 新增 Types（追加至 `src/server/db_types.ts`）

```typescript
export interface SupportCryptoAsset {
    id: number;
    crypto_id: number;
    token_symbol: string;
    token_address: string;
    is_active: boolean;
    edit_time: string;
    created_time: string;
}

export interface SupportFiatAsset {
    id: number;
    fiat_id: number;
    fiat_name: string;
    is_active: boolean;
    edit_time: string;
    created_time: string;
}

export interface SyncCryptoRequest {
    crypto_id: number;
    token_symbol: string;
    token_address: string;
    is_active: boolean;
}

export interface SyncFiatRequest {
    fiat_id: number;
    fiat_name: string;
    is_active: boolean;
}

export interface UpdateAssetStatusRequest {
    is_active: boolean;
}
```

### API 路由清单

```
src/app/api/admin/
├── crypto/
│   ├── route.ts          GET  → 返回全部加密资产列表（SELECT * ORDER BY crypto_id ASC）
│   │                     POST → 合约成功后同步新资产（INSERT）
│   └── [id]/
│       └── route.ts      PATCH → 更新 is_active（UPDATE WHERE crypto_id = id）
├── fiat/
│   ├── route.ts          GET  → 返回全部法币资产列表（SELECT * ORDER BY fiat_id ASC）
│   │                     POST → 合约成功后同步新资产（INSERT）
│   └── [id]/
│       └── route.ts      PATCH → 更新 is_active（UPDATE WHERE fiat_id = id）
└── merchant/
    └── route.ts          POST → 记录注册事件（合约已完成实际注册逻辑，此处可仅返回 200）
```

#### `GET /api/admin/crypto`
```sql
SELECT * FROM support_crypto_assets ORDER BY crypto_id ASC
```
返回 `SupportCryptoAsset[]`

#### `POST /api/admin/crypto`（body: `SyncCryptoRequest`）
```sql
INSERT INTO support_crypto_assets (crypto_id, token_symbol, token_address, is_active)
VALUES (?, ?, ?, ?)
```

#### `PATCH /api/admin/crypto/[id]`（body: `UpdateAssetStatusRequest`，id = crypto_id）
```sql
UPDATE support_crypto_assets SET is_active = ?, edit_time = NOW() WHERE crypto_id = ?
```

法币资产的三个路由逻辑与上述完全对称，操作 `support_fiat_assets` 表，字段替换为 `fiat_id`、`fiat_name`。

---

## 三、合约 ABI 补充

**修改文件**：`src/lib/contractAbi.ts`，在 `C2C_ADMIN_ABI` 数组中追加：

```typescript
{
    type: 'function' as const,
    name: 'addCryptoInfo',
    inputs: [
        { name: '_tokenAddress', type: 'address' as const },
        { name: '_isActive', type: 'bool' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
},
{
    type: 'function' as const,
    name: 'addFiatInfo',
    inputs: [
        { name: '_fiatName', type: 'string' as const },
        { name: '_isActive', type: 'bool' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
},
{
    type: 'function' as const,
    name: 'activateAsset',
    inputs: [
        { name: '_id', type: 'uint256' as const },
        { name: '_assetType', type: 'uint8' as const },  // 0=CRYPTO, 1=FIAT
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
},
{
    type: 'function' as const,
    name: 'deactivateAsset',
    inputs: [
        { name: '_id', type: 'uint256' as const },
        { name: '_assetType', type: 'uint8' as const },  // 0=CRYPTO, 1=FIAT
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
},
```

---

## 四、前端文件结构

```
src/
├── app/
│   └── admin/
│       └── page.tsx                        ← Admin 页面入口（dynamic import AdminConsole）
├── components/
│   └── admin/
│       ├── AdminConsole.tsx                ← 主容器，左右两列 + 底部注册商家
│       ├── CryptoAssetTable.tsx            ← 加密资产表格（含 Edit / Refresh 按钮）
│       ├── FiatAssetTable.tsx              ← 法币资产表格（含 Edit / Refresh 按钮）
│       ├── AddCryptoForm.tsx               ← 添加加密资产表单
│       ├── AddFiatForm.tsx                 ← 添加法币资产表单
│       └── RegisterMerchantForm.tsx        ← 注册商家表单
└── hooks/
    └── useAdminContract.ts                 ← Admin 合约交互 Hook
```

---

## 五、页面布局

### Header 修改（`src/components/Header.tsx`）

在 `navItems` 数组末尾追加：

```typescript
{
    href: "/admin",
    label: "Admin",
    isActive: (pathname) => pathname.startsWith("/admin"),
},
```

### `AdminConsole.tsx` 整体布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  [左栏 ~55%]                          [右栏 ~42%]                   │
│  ┌──────────────────────────────────┐  ┌───────────────────────────┐│
│  │ Crypto Assets         [Edit] [↻] │  │ Add Crypto Asset          ││
│  │ ─────────────────────────────── │  │ Token Address:            ││
│  │ ID │ Symbol │ Address  │ Active  │  │ [________________________]││
│  │  0 │ USDT   │ 0x...    │  ✓     │  │ Initial Active: □         ││
│  │  1 │ ETH    │ 0x...    │        │  │              [Submit →]   ││
│  │ (可上下滚动)                      │  └───────────────────────────┘│
│  └──────────────────────────────────┘  ┌───────────────────────────┐│
│  ┌──────────────────────────────────┐  │ Add Fiat Asset            ││
│  │ Fiat Assets           [Edit] [↻] │  │ Fiat Name:                ││
│  │ ─────────────────────────────── │  │ [________________________]││
│  │ ID │ Fiat Name │ Active          │  │ Initial Active: □         ││
│  │  0 │ MYR       │  ✓             │  │              [Submit →]   ││
│  │  1 │ SGD       │                │  └───────────────────────────┘│
│  │ (可上下滚动)                      │                               │
│  └──────────────────────────────────┘                               │
│  ──────────────────── Register Merchant ──────────────────────────── │
│  Merchant Wallet Address: [_________________________________________] │
│                                                   [Register →]       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 六、前端交互逻辑

### `useAdminContract.ts` Hook

封装以下操作，每个操作的流程：**调合约 → 等待 tx 确认 → 调 API 同步 DB → 返回结果**

```typescript
// 封装的函数签名
addCrypto(tokenAddress: string, isActive: boolean): Promise<void>
  → writeContract(addCryptoInfo) → 解析 event 获取 cryptoId + tokenSymbol
  → POST /api/admin/crypto

addFiat(fiatName: string, isActive: boolean): Promise<void>
  → writeContract(addFiatInfo) → 解析 event 获取 fiatId
  → POST /api/admin/fiat

toggleCryptoAsset(cryptoId: number, isActive: boolean): Promise<void>
  → writeContract(activateAsset or deactivateAsset, id, 0)
  → PATCH /api/admin/crypto/[cryptoId]

toggleFiatAsset(fiatId: number, isActive: boolean): Promise<void>
  → writeContract(activateAsset or deactivateAsset, id, 1)
  → PATCH /api/admin/fiat/[fiatId]

registerMerchant(merchant: string): Promise<void>
  → writeContract(registerMerchantByAdmin)
  → POST /api/admin/merchant（可选记录）
```

合约地址来自 `contractConfig.c2cAdmin`，chain 来自 `contractConfig` 的 `chain` 导出。

### Edit 模式逻辑（`CryptoAssetTable` / `FiatAssetTable`）

1. 点击 **[Edit]** → 表格 `isActive` 列切换为可交互 checkbox，保存原始状态快照 `originalData`
2. Admin 修改若干行的 checkbox
3. 点击 **[Submit]**：
   - 对比 `originalData` 找出变更项
   - 遍历变更项，逐条调用 `toggleCryptoAsset` / `toggleFiatAsset`
   - 每条成功后更新 DB（PATCH 请求已在 hook 内部处理）
   - 全部完成 → 退出 Edit 模式 → 重新 fetch 刷新表格
4. 点击 **[Cancel]** → 恢复 `originalData`，退出 Edit 模式，不调合约

### Refresh 按钮

直接调用 `GET /api/admin/crypto` 或 `GET /api/admin/fiat` 重新获取并渲染。

---

## 七、样式规范

复用现有 CSS 变量（定义于 `src/app/globals.css`）：

| 用途 | CSS 变量 | 颜色值 |
|---|---|---|
| 页面背景 | `--bg-base` | #181a20 |
| 卡片/面板背景 | `--bg-surface-1` | #1e2329 |
| 表格行背景 | `--bg-surface-2` | #222a33 |
| 边框 | `--line-soft` | #2f363d |
| 主色按钮/激活 | `--accent-cta` | #fcd535 |
| 成功/Active 标识 | `--state-success` | #0ecb81 |
| 错误/危险 | `--state-danger` | #f6465d |

- 面板容器：使用 `terminal-panel` class（已在 globals.css 定义）
- Input 输入框：使用 `terminal-input` class
- Active checkbox 勾选样式：`accent-color: var(--accent-cta)`
- Edit 模式激活时 [Submit] 按钮：绿色 (`--state-success`)，[Cancel] 按钮：灰色
- 所有表格固定表头，内容区域设置 `max-height` + `overflow-y: auto` 实现可滚动

---

## 八、完整文件清单

| 操作 | 文件路径 |
|---|---|
| **新建** | `src/server/migrations/001_admin_assets.sql` |
| **修改** | `src/server/db_types.ts`（追加 5 个 interface） |
| **新建** | `src/app/api/admin/crypto/route.ts` |
| **新建** | `src/app/api/admin/crypto/[id]/route.ts` |
| **新建** | `src/app/api/admin/fiat/route.ts` |
| **新建** | `src/app/api/admin/fiat/[id]/route.ts` |
| **新建** | `src/app/api/admin/merchant/route.ts` |
| **修改** | `src/lib/contractAbi.ts`（追加 4 个 function ABI） |
| **新建** | `src/app/admin/page.tsx` |
| **新建** | `src/components/admin/AdminConsole.tsx` |
| **新建** | `src/components/admin/CryptoAssetTable.tsx` |
| **新建** | `src/components/admin/FiatAssetTable.tsx` |
| **新建** | `src/components/admin/AddCryptoForm.tsx` |
| **新建** | `src/components/admin/AddFiatForm.tsx` |
| **新建** | `src/components/admin/RegisterMerchantForm.tsx` |
| **新建** | `src/hooks/useAdminContract.ts` |
| **修改** | `src/components/Header.tsx`（追加 Admin nav item） |

共 **12 个新建文件**，**5 个修改文件**，全部在 `packages/web/src/` 范围内，不影响其他包。

---

## 九、关键注意事项

1. **合约地址**：从 `contractConfig.c2cAdmin`（env: `NEXT_PUBLIC_C2C_ADMIN_ADDRESS`）读取
2. **AssetType 枚举**：合约中 `CRYPTO = 0`，`FIAT = 1`，传 `uint8`
3. **tokenSymbol 来源**：`addCryptoInfo` 合约内部通过 `IERC20Metadata(_tokenAddress).symbol()` 自动获取，前端无需填写；从 tx receipt event `SupportCryptoAdded` 的 `tokenSymbol` 字段读取后同步到 DB
4. **crypto_id / fiat_id**：不是 DB 自增 id，而是合约数组的 index（从 event 中读取），是调用 `activateAsset`/`deactivateAsset` 时的入参
5. **DB 连接池**：直接 `import pool from '@/server/database'`，与现有 API route 一致
6. **Admin 权限**：当前阶段 Header 中的 Admin 按钮对所有人可见；后期通过读取钱包地址与合约 `admin()` 函数比对来控制可见性
