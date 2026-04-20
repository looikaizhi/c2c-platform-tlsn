# Demo 完美闭环实现方案

> 基于合约测试（`packages/contracts/test/Integration.ts`）与当前 Demo 代码差距分析，整理出覆盖 4 条交易流、3 角色面板的完整重构方案。

---

## 一、核心问题清单（代码差距精确定位）

### 1.1 `placeOrder` 签名完全不匹配

| 位置 | 当前（旧） | 目标（新合约） |
|---|---|---|
| `packages/demo/src/utils/c2cAbi.ts:102-113` | `placeOrder(order_tuple, signature_bytes, buyerInfo)` | `placeOrder(merchant_addr, productId, assetType, amount, buyerInfo)` |
| `packages/demo/src/utils/wiseC2cActions.ts:109-172` | 先 `signTypedData` 再 `placeOrder(order, sig, …)` | 直接 `placeOrder(merchant, productId, 0, amount, NULL_BUYER_INFO)` |
| `packages/demo/src/utils/alipayC2cActions.ts:389-451` | 同上，内部 `_placeOrder` 也做 EIP-712 签名 | 同上，无需签名 |

新合约 `placeOrder` 在 `C2CEscrow.sol:391`，参数完全不同，内部直接读链上汇率，不再需要商家签名。

### 1.2 `orderBindingHash` 缺失 `rateVersion` 字段

| 位置 | 当前 | 目标 |
|---|---|---|
| `packages/demo/src/utils/proofTransformer.ts:110-132` | 14 字段编码，无 `rateVersion` | 合约 `C2CEscrow.sol:341-373` 有 `uint32 rateVersion`，在 `rate` 和 `deadline` 之间 |
| `packages/demo/src/utils/proofTransformer.ts:76-97` | `OrderBindingContext` 无 `rateVersion` | 增加 `rateVersion: bigint` 字段 |

测试侧正确实现在 `packages/contracts/test/helpers/orderBindingHash.ts:8-45`，Demo 侧少了一个 `uint32 rateVersion` 字段，导致所有 proof 绑定失败。

### 1.3 `getMerchantPaymentInfo` 已变成按平台存储

| 位置 | 当前 | 目标 |
|---|---|---|
| `packages/demo/src/utils/c2cAbi.ts:62-96` | `setMerchantPaymentInfo(nameHash, idHash)` 全局 | `setMerchantPaymentInfoForPlatform(platformId, nameHash, idHash)` |
| `packages/demo/src/utils/wiseC2cActions.ts:38-49` | `getMerchantPaymentInfo(merchant)` | `getMerchantPaymentInfoForPlatform(merchant, platformId)` |

合约 `C2CAdmin.sol:258-283` 明确按 `platformId` 路由，Demo ABI 里的旧函数已不存在。

### 1.4 Deploy 脚本缺 `publishRate` + `openNow`

`placeOrder` 内部在 `C2CEscrow.sol:414-416` 检查 `mr.publishedAt == 0` → `revert RateNotPublished()` 以及 `isMerchantOpen` → `revert MerchantClosed()`。当前没有 hardhat deploy 脚本为 demo 调用这两个函数，所有下单都会 revert。测试侧在 `Integration.ts:178-186` 有正确的 `publishRate` + `openNow` 调用序列。

### 1.5 Wise-Fiat 方向完全缺失

`WiseC2CDemoFlow.tsx` 只有 Fiat→Crypto（买家付 MYR 拿 USDT）。合约和测试在 `Integration.ts:670-698` 完整支持 Wise-Fiat（买家锁 USDT，商家付 MYR，商家收 USDT），Demo 侧完全空白。

### 1.6 FIAT 下单需要先 approve 代币

新合约 `C2CEscrow.sol:452-454` 中 FIAT 分支在 `placeOrder` 时直接 `safeTransferFrom` 锁定买家代币。旧流程里锁定发生在独立的 `payOrderByCrypto` 步骤。Demo 侧 `placeCryptoToFiatOrder` 在 `alipayC2cActions.ts:254-264` 不做 approve，也没有调用已废弃的 `payOrderByCrypto`。

---

## 二、账户与资产初始化方案

### 2.1 账户分配（Hardhat 默认 10 个账户）

```
wallet[0]  = Admin         (部署者、授权方、registerMerchantByAdmin 调用方)
wallet[1]  = Merchant_1    (Wise + Alipay 双平台，USDT 产品)
wallet[2]  = Merchant_2    (同上)
wallet[3]  = Merchant_3    (同上)
wallet[4]  = User_1
wallet[5]  = User_2
wallet[6]  = User_3
wallet[7]  = User_4
wallet[8]  = User_5
wallet[9]  = verifierSigner (TLSN proof 签名人，不显示在 UI)
```

### 2.2 代币规模

```
3 个 MockERC20: USDT (id=0), USDC (id=1), DAI (id=2)，均 18 decimals
每个商家/用户每种币 mint 2000e18
商家需额外 approve MAX_UINT 给 escrow（作为 collateral 来源）
用户需 approve MAX_UINT 给 escrow（FIAT 下单时锁定）
```

### 2.3 产品布局（每个商家 4 个产品）

| productId | assetType | 平台 | 含义 |
|---|---|---|---|
| 0 | CRYPTO (0) | Wise | 买家付 MYR → 收 USDT |
| 0 | FIAT (1) | Wise | 买家锁 USDT → 商家付 MYR → 商家收 USDT |
| 1 | CRYPTO (0) | Alipay | 买家付 CNY → 收 USDT |
| 1 | FIAT (1) | Alipay | 买家锁 USDT → 商家付 CNY → 商家收 USDT |

> 注意：`productId` 由 `incrementSellCount` 按 `assetType` 分别计数，所以 CRYPTO 和 FIAT 的第一个产品都是 id=0，第二个都是 id=1。这与测试侧 `WISE_CRYPTO_PID=0, WISE_FIAT_PID=0, ALIPAY_CRYPTO_PID=1, ALIPAY_FIAT_PID=1` 完全对应。

### 2.4 汇率（沿用测试侧常量）

```typescript
RATE_WISE_CRYPTO   = 4_500_000_000_000_000_000n  // 4.500 MYR/USDT (CRYPTO 方向)
RATE_WISE_FIAT     = 450n                         // fiatX1000 = amount×rate×10/1e18 (FIAT 方向)
RATE_ALIPAY_CRYPTO = 7_200_000_000_000_000_000n  // 7.200 CNY/USDT (CRYPTO 方向)
RATE_ALIPAY_FIAT   = 720n                         // fiatX1000 = amount×rate×10/1e18 (FIAT 方向)
expiresAt          = now + 365 days
```

---

## 三、部署脚本完整序列（`deployDemoState.ts`）

```
Step 1:  部署 3x MockERC20 (USDT, USDC, DAI)
Step 2:  部署 TLSNVerifier
Step 3:  部署 C2CAdmin(tlsnVerifier.address)
Step 4:  部署 C2CEscrow(c2cAdmin.address, tlsnVerifier.address)
Step 5:  tlsnVerifier.setAuthorizedCaller(c2cAdmin, true)
         tlsnVerifier.setAuthorizedCaller(c2cEscrow, true)
         c2cAdmin.setAuthorizedCaller(c2cEscrow, true)
Step 6:  c2cAdmin.addCryptoInfo(USDT.address, true)   → cryptoId=0
         c2cAdmin.addCryptoInfo(USDC.address, true)   → cryptoId=1
         c2cAdmin.addCryptoInfo(DAI.address, true)    → cryptoId=2
         c2cAdmin.addFiatInfo("CNY", true)             → fiatId=0
         c2cAdmin.addFiatInfo("MYR", true)             → fiatId=1
Step 7:  tlsnVerifier.addTrustedVerifier(wallet[9].address)
         tlsnVerifier.addTrustedKYBServer("kyb.example.com")
         tlsnVerifier.addTrustedPaymentServer("wise.com")
         tlsnVerifier.addTrustedPaymentServer("mbillexprod.alipay.com")
Step 8:  部署 WisePlatformVerifier(tlsnVerifier), AlipayPlatformVerifier(tlsnVerifier)
         tlsnVerifier.setPlatformVerifier(PLATFORM_WISE, wisePlatformVerifier.address)
         tlsnVerifier.setPlatformVerifier(PLATFORM_ALIPAY, alipayPlatformVerifier.address)
Step 9:  for each merchant (wallet[1..3]):
         ├── USDT/USDC/DAI.mint(merchant, 2000e18)
         ├── USDT/USDC/DAI.approve(c2cEscrow, MAX_UINT)  [as merchant]
         ├── c2cAdmin.registerMerchantByAdmin(merchant)  [as admin]
         ├── c2cAdmin.setMerchantPaymentInfoForPlatform(PLATFORM_WISE, nameHash, idHash)   [as merchant]
         ├── c2cAdmin.setMerchantPaymentInfoForPlatform(PLATFORM_ALIPAY, nameHash, idHash) [as merchant]
         ├── c2cEscrow.listCryptoProduct(USDT_ID=0, MYR_ID=1, 2000e18, true, PLATFORM_WISE)
         ├── c2cEscrow.listFiatProduct(MYR_ID=1, USDT_ID=0, 2000e18, true, PLATFORM_WISE)
         ├── c2cEscrow.listCryptoProduct(USDT_ID=0, CNY_ID=0, 2000e18, true, PLATFORM_ALIPAY)
         ├── c2cEscrow.listFiatProduct(CNY_ID=0, USDT_ID=0, 2000e18, true, PLATFORM_ALIPAY)
         ├── c2cAdmin.publishRate(0, CRYPTO=0, RATE_WISE_CRYPTO, expiry)   [as merchant]
         ├── c2cAdmin.publishRate(0, FIAT=1,   RATE_WISE_FIAT, expiry)     [as merchant]
         ├── c2cAdmin.publishRate(1, CRYPTO=0, RATE_ALIPAY_CRYPTO, expiry) [as merchant]
         ├── c2cAdmin.publishRate(1, FIAT=1,   RATE_ALIPAY_FIAT, expiry)   [as merchant]
         ├── c2cAdmin.openNow(0, CRYPTO=0)  [as merchant]
         ├── c2cAdmin.openNow(0, FIAT=1)    [as merchant]
         ├── c2cAdmin.openNow(1, CRYPTO=0)  [as merchant]
         └── c2cAdmin.openNow(1, FIAT=1)    [as merchant]
Step 10: for each user (wallet[4..8]):
         ├── USDT/USDC/DAI.mint(user, 2000e18)
         └── USDT/USDC/DAI.approve(c2cEscrow, MAX_UINT)  [as user]
```

---

## 四、ABI 更新清单（`c2cAbi.ts`）

需要增/改的函数签名：

```
C2CEscrow:
+ placeOrder(address merchant, uint256 productId, uint8 assetType, uint256 amount, BuyerPaymentInfo buyerInfo)
  （替换旧的 placeOrder(SignedOrder, bytes, BuyerPaymentInfo)）
~ getOrder → 输出 tuple 增加 { rateVersion: uint32 } 字段（目前缺失）
+ hasActiveOrder(address buyer, address merchant, uint8 assetType, uint256 productId) → bool
+ cancelOrder(address merchant, uint256 productId, uint8 assetType, uint256 orderId)

C2CAdmin:
- 删除 setMerchantPaymentInfo                         (旧全局函数，合约已不存在)
- 删除 getMerchantPaymentInfo                         (旧全局函数，合约已不存在)
+ setMerchantPaymentInfoForPlatform(bytes32 platformId, bytes32 nameHash, bytes32 idHash)
+ getMerchantPaymentInfoForPlatform(address merchant, bytes32 platformId) → MerchantPaymentInfo
+ publishRate(uint256 productId, uint8 assetType, uint256 rate, uint64 expiresAt)
+ openNow(uint256 productId, uint8 assetType)
+ closeNow(uint256 productId, uint8 assetType)
+ getMerchantRate(address merchant, uint256 productId, uint8 assetType) → MerchantRate
+ isMerchantOpen(address merchant, uint256 productId, uint8 assetType) → bool
+ registerMerchantByAdmin(address merchant)
+ isMerchantActive(address merchant) → bool
+ addCryptoInfo(address tokenAddress, bool isActive)
+ addFiatInfo(string fiatName, bool isActive)
+ getSupportCryptoList() → SupportCryptoInfo[]
+ getSupportFiatList() → SupportFiatInfo[]
+ maxOrderAmount() → uint256
```

---

## 五、`proofTransformer.ts` 修复方案

### 5.1 接口变更

```typescript
export interface OrderBindingContext {
  escrowAddress: Hex;
  chainId: number;
  merchant: Hex;
  buyer: Hex;
  productId: bigint;
  orderId: bigint;
  assetType: number;
  amount: bigint;
  rate: bigint;
  rateVersion: bigint;  // ← 新增，从 getOrder 返回值中读取
  deadline: bigint;
  merchantNameHash: Hex;
  merchantIdHash: Hex;
  payeeNameHash: Hex;
  payeeIdHash: Hex;
}
```

### 5.2 `computeOrderBindingHash` 修复

```typescript
// 类型序列从 14 个变为 15 个，增加 'uint32' 在 rate 和 deadline 之间
encodePacked(
  [
    'address', 'uint64',
    'address', 'address',
    'uint256', 'uint256',
    'uint8', 'uint256', 'uint256',
    'uint32',   // ← rateVersion（新增，在 rate 和 deadline 之间）
    'uint256',
    'bytes32', 'bytes32', 'bytes32', 'bytes32'
  ],
  [
    escrow, chainId,
    merchant, buyer,
    productId, orderId,
    assetType, amount, rate,
    Number(rateVersion),  // ← uint32，注意截断处理
    deadline,
    merchantNameHash, merchantIdHash,
    payeeNameHash, payeeIdHash
  ]
)
```

### 5.3 调用方更新规则

所有 `makeXxxBindingContext` 函数必须先调用 `getOrder(merchant, productId, assetType, orderId)` 读取 `rateVersion`，再填入 context。FIAT 流程尤其关键——下单时 rate version 由合约锁定写入订单，proof 必须使用相同版本号。

---

## 六、4 条交易流程完整设计

### 6.1 Wise-Crypto（买家付法币收加密币）

```
角色：User_X（买家）
触发：TradingHall 选 Merchant_Y 的 Wise/Crypto 广告，填写 USDT 数量

步骤：
1. [User]  placeOrder(merchant, productId=0, CRYPTO=0, amount, NULL_BUYER_INFO)
           → 链上状态 PENDING
2. [User]  TLSN 插件窗口弹出（需采集 contacts + transfer 两个 proof）
           → 注入 orderBindingHash（含 rateVersion，从 getOrder 读取）
           → Wise 登录 → 采集联系人页 + 转账页
3. [User]  payOrderByPlatform(merchant, 0, orderId, [contactsProof, transferProof])
           → 链上验证通过 → USDT 转入用户地址 → 状态 COMPLETED
```

### 6.2 Wise-Fiat（买家锁加密币，商家付法币收加密币）

```
角色：User_X（买家/加密币卖家）+ Merchant_Y（法币付款方）
触发：TradingHall 选 Merchant_Y 的 Wise/Fiat 广告，填写 USDT 数量 + 自己的 Wise 账号信息

步骤：
1. [User]    输入 buyerNameHash + buyerIdHash（keccak256 自己的 Wise 账户信息）
2. [User]    placeOrder(merchant, productId=0, FIAT=1, amount, {nameHash, idHash, isSet:true})
             → 合约直接扣用户 USDT → 链上状态 WAITING
3. [Merchant] Merchant 面板轮询到新 WAITING 订单，看到买家 Wise 账号（nameHash/idHash）
4. [Merchant] 链外操作：向买家 Wise 账户汇款
5. [Merchant] TLSN 插件弹出（采集 contacts + transfer 两个 proof）
              → payeeNameHash = buyerIdHash（证明是付给买家的）
              → 注入 orderBindingHash（从 getOrder 读取 rateVersion）
6. [Merchant] receiveCryptoWithPlatformPayment(productId=0, orderId, [contactsProof, transferProof])
              → 链上验证通过 → USDT 转入商家地址 → 状态 COMPLETED
```

### 6.3 Alipay-Crypto（买家付法币收加密币）

```
角色：User_X（买家）
触发：TradingHall 选 Merchant_Y 的 Alipay/Crypto 广告

步骤：
1. [User]  placeOrder(merchant, productId=1, CRYPTO=0, amount, NULL_BUYER_INFO)
           → 链上状态 PENDING
2. [User]  TLSN 插件窗口弹出（单个 Alipay payment proof）
           → 注入 orderBindingHash（含 rateVersion）
3. [User]  payOrderByPlatform(merchant, 1, orderId, [alipayProof])
           → 链上验证通过 → USDT 转入用户
```

### 6.4 Alipay-Fiat（买家锁加密币，商家付法币收加密币）

```
角色：User_X + Merchant_Y
触发：TradingHall 选 Merchant_Y 的 Alipay/Fiat 广告

步骤：
1. [User]    输入 buyerNameHash + buyerIdHash（keccak256 自己的支付宝账户信息）
2. [User]    placeOrder(merchant, productId=1, FIAT=1, amount, buyerInfo)
             → 合约扣用户 USDT → 链上状态 WAITING
3. [Merchant] 面板看到 WAITING 订单，向买家支付宝转账（链外）
4. [Merchant] TLSN 插件（单个 Alipay proof，payee = 买家账户）
5. [Merchant] receiveCryptoWithPlatformPayment(1, orderId, [alipayProof])
              → USDT 转入商家
```

---

## 七、信息架构与组件拆分

```
App.tsx
├── DeployPanel.tsx          ← 一键部署/重置链上状态，显示合约地址
├── AdminPanel.tsx
│   ├── 显示：Admin ETH 余额，maxOrderAmount，支持币种列表（USDT/USDC/DAI）
│   └── 操作：setMaxOrderAmount，activateAsset，deactivateAsset
├── MerchantPanel.tsx（tabs: M1 / M2 / M3）
│   ├── 信息：地址，ETH + 3 稳定币余额
│   ├── 支付身份：Wise nameHash/idHash，Alipay nameHash/idHash
│   ├── 产品状态：4 个产品的 isActive / rate / isOpen
│   ├── 操作：openNow / closeNow，publishRate
│   └── 待处理 FIAT 订单列表 + TLSN 提交按钮（触发 Wise/Alipay Fiat 流程）
├── UserPanel.tsx（tabs: U1 ~ U5）
│   ├── 信息：地址，ETH + 3 稳定币余额
│   └── 活跃订单：orderId / status / amount / deadline
└── TradingHall.tsx
    ├── 广告列表（每商家 4 张卡：Wise-Crypto / Wise-Fiat / Alipay-Crypto / Alipay-Fiat）
    ├── 过滤器：平台（Wise/Alipay）、方向（Crypto/Fiat）
    └── 点击"下单"→ OrderDialog.tsx
        ├── Step 1: 确认信息（商家、方向、金额、预计法币/加密币、deadline）
        ├── Step 2（仅 FIAT）: 输入买家支付身份（name + handle，前端做 keccak256）
        ├── Step 3: 发链上 placeOrder 交易（等待确认）
        ├── Step 4（仅 CRYPTO）: 弹出 TLSN 证明窗口，显示进度
        └── Step 5（仅 CRYPTO）: 提交 proof，显示结果
```

---

## 八、各 Panel 读取的链上数据

### Admin Panel
```
c2cAdmin.maxOrderAmount()
c2cAdmin.getSupportCryptoList()
c2cAdmin.getSupportFiatList()
for each merchant: c2cAdmin.isMerchantActive(merchant)
publicClient.getBalance(admin)
```

### Merchant Panel（每个商家）
```
publicClient.getBalance(merchant)
ERC20.balanceOf(merchant) × 3 tokens
c2cAdmin.getMerchantPaymentInfoForPlatform(merchant, PLATFORM_WISE)
c2cAdmin.getMerchantPaymentInfoForPlatform(merchant, PLATFORM_ALIPAY)
for each product × assetType (4 combinations):
  c2cAdmin.getMerchantRate(merchant, productId, assetType)
  c2cAdmin.isMerchantOpen(merchant, productId, assetType)
待处理 FIAT 订单：监听 OrderPlaced events (merchant=this, assetType=FIAT)
  + getOrder(merchant, productId, FIAT, orderId) for status==WAITING
```

### User Panel（每个用户）
```
publicClient.getBalance(user)
ERC20.balanceOf(user) × 3 tokens
c2cEscrow.hasActiveOrder(user, merchant, assetType, productId) × 12 combinations
  → 若 true, getOrder(merchant, productId, assetType, orderId)
```

---

## 九、关键工具函数变更对照表

| 旧函数 | 新函数 | 所在文件 | 说明 |
|---|---|---|---|
| `setupWiseFiatToCrypto(nameHash, idHash)` | 移入 `deployDemoState.ts`，deploy 时一次性完成 | wiseC2cActions → deploy | 拆开职责 |
| `placeWiseFiatToCryptoOrder(productId)` | `placeOrder(merchant, 0, CRYPTO, amount, null)` | wiseC2cActions | 无 EIP-712 |
| `makeWiseFiatToCryptoBindingContext(...)` | 同名，增加从 `getOrder` 读取 `rateVersion` | wiseC2cActions | 修复 hash |
| `_placeOrder(assetType, productId, rate, buyerInfo)` | `placeOrder(merchant, productId, assetType, amount, buyerInfo)` | alipayC2cActions | 无签名 |
| `escrowBuyerCrypto(productId, orderId)` | **删除**（功能合并入 placeOrder FIAT 分支） | alipayC2cActions | 废弃 |
| `getMerchantPaymentInfo(merchant)` | `getMerchantPaymentInfoForPlatform(merchant, platformId)` | 所有 actions | 需传 platformId |
| `computeOrderBindingHash(ctx)` | 同名，ctx 增加 `rateVersion`，编码增加 `uint32` | proofTransformer | **关键修复** |

---

## 十、文件改动范围总结

| 文件 | 改动类型 | 主要内容 |
|---|---|---|
| `packages/demo/src/utils/c2cAbi.ts` | **重写** | 新 placeOrder 签名，增 per-platform 函数，增 rate/businesshours 函数，getOrder 加 rateVersion |
| `packages/demo/src/utils/proofTransformer.ts` | **修复** | OrderBindingContext 加 rateVersion；computeOrderBindingHash 加 uint32 编码 |
| `packages/demo/src/utils/wiseC2cActions.ts` | **重写** | 去掉 EIP-712；新增 Wise-Fiat 流程；读 rateVersion |
| `packages/demo/src/utils/alipayC2cActions.ts` | **重写** | 去掉 EIP-712 + 去掉 escrowBuyerCrypto；读 rateVersion；FIAT 流程 pre-approve |
| `packages/demo/src/utils/deployDemoState.ts` | **新建** | 完整部署序列（3 merchants × 4 products + publishRate + openNow + mint + approve） |
| `packages/demo/src/utils/hardhatAccounts.ts` | **扩展** | 增加 merchant2/3、user1~5 wallet clients |
| `packages/demo/src/utils/c2cContractConfig.ts` | **更新** | 增加 3 个 token 地址，增加多商家地址 |
| `packages/demo/src/components/AdminPanel.tsx` | **新建** | Admin 面板 |
| `packages/demo/src/components/MerchantPanel.tsx` | **新建** | 3 商家 tabs + FIAT 订单 + TLSN 提交 |
| `packages/demo/src/components/UserPanel.tsx` | **新建** | 5 用户 tabs + 余额 + 活跃订单 |
| `packages/demo/src/components/TradingHall.tsx` | **新建** | 广告大厅 + OrderDialog（4 流程） |
| `packages/demo/src/components/WiseC2CDemoFlow.tsx` | **废弃** | 功能移入 TradingHall |
| `packages/demo/src/components/AlipayC2CDemoFlow.tsx` | **废弃** | 功能移入 TradingHall |
| `packages/demo/src/App.tsx` | **重构** | 替换为 4 Panel 布局 |

---

## 十一、执行优先级

| 优先级 | 任务 | 解锁条件 |
|---|---|---|
| P0 | `c2cAbi.ts` 新 placeOrder + `deployDemoState.ts`（含 publishRate + openNow） | 解锁下单 |
| P1 | `proofTransformer.ts` 增加 rateVersion + 所有 makeXxxBindingContext 读取 rateVersion | 解锁 proof 提交 |
| P2 | `wiseC2cActions.ts` + `alipayC2cActions.ts` 全面重写 | 四流程通路 |
| P3 | TradingHall + AdminPanel + MerchantPanel + UserPanel | UI 可视化 |
| P4 | 余额自动刷新、订单状态实时轮询、FIAT 流程 Merchant Panel 提交入口 | 体验优化 |
