# C2C 合约 MVP 改造方案

> 版本：MVP  
> 日期：2026-04-16  
> 基于代码：`packages/contracts/contracts/`  
> 业务决策已在下方 §0 记录，方案完全对齐这些决策。

---

## §0 业务决策基线（已拍板）

| 编号 | 问题 | 决策 |
|---|---|---|
| D-1 | 汇率过期对已下单订单的影响 | 已下单订单不受影响，rate 在下单时快照 |
| D-2 | FIAT 产品 WAITING 状态能否取消 | 不能取消，前端做警示 |
| D-3 | $1000 上限口径 | 单笔订单，不累计 |
| D-4 | 汇率发布延迟 | 无延迟，发布即生效 |
| D-5 | USD 与稳定币比价 | 默认 1:1，合约无需预言机 |
| D-6 | 营业时间时区 | 前端转换为 UTC 后传入合约 |
| D-7 | 关门后进行中订单 | 不影响已有订单，继续正常流转 |
| D-8 | 旧接口兼容 | 直接删除，不保留 legacy 函数 |

---

## §1 当前机制基线（代码定位）

### 签名机制

`C2CEscrow.sol:93–95` 定义 EIP-712 typehash：
```
SIGNED_ORDER_TYPEHASH = keccak256("SignedOrder(address merchant,address buyer,
    uint256 productID,uint8 assetType,uint256 amount,uint256 rate,uint256 salt,uint256 deadline)")
```

`C2CEscrow.sol:395–463` `placeOrder(SignedOrder so, bytes signature, BuyerPaymentInfo buyerInfo)`：
- 验证 `so.deadline > block.timestamp`（C2CEscrow.sol:397）
- 验证 `usedSalt[so.merchant][so.buyer][so.salt]`（C2CEscrow.sol:398）
- 验证 EIP-712 签名恢复地址 == so.merchant（C2CEscrow.sol:415）

前端助手：`test/helpers/signOrder.ts:23–63`

### 汇率来源

汇率 `rate` 嵌在 `SignedOrder` 结构体（`C2CTypes.sol:96`），由商家签名时锁死。  
两种精度：
- CRYPTO 产品：`fiatAmountX1000 = mulDiv(amount, rate, 1e33)`（C2CEscrow.sol:527）
- FIAT 产品：`fiatAmountX1000 = mulDiv(amount, rate*10, 1e18)`（C2CEscrow.sol:620）

### 当前下单流程

**CRYPTO 产品**（商家锁加密，买家付法币）：
1. `placeOrder(so, sig, NULL)` → PENDING，锁 pendingAmount（C2CEscrow.sol:432–443）
2. `payOrderByPlatform(merchant, pid, oid, proofs)` → 买家提交 TLSN → COMPLETED（C2CEscrow.sol:515–567）

**FIAT 产品**（买家锁加密，商家付法币）：
1. `placeOrder(so, sig, buyerInfo)` → PENDING（C2CEscrow.sol:447–455）
2. `payOrderByCrypto(merchant, pid, oid)` → 买家打币，PENDING → WAITING（C2CEscrow.sol:577–591）
3. `receiveCryptoWithPlatformPayment(pid, oid, proofs)` → 商家提交 TLSN → COMPLETED（C2CEscrow.sol:605–662）

### 产品开关

`C2CEscrow.sol:272–284`：仅布尔开关（`activeProduct` / `inactiveProduct`），无营业时间逻辑。

### orderBindingHash

`C2CEscrow.sol:347–377`：包含 escrow、chainId、merchant、buyer、productId、orderId、assetType、amount、rate、deadline、merchantNameHash/IdHash、payeeNameHash/IdHash。  
**不含 rateVersion**（MVP 新增）。

---

## §2 改造目标架构

### 端到端流程（改造后）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRYPTO 产品
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
① 商家发布汇率（一次性，可随时更新）
   C2CAdmin.publishRate(productId, CRYPTO, rate, expiresAt)

② 买家一步下单（无需商家签名）
   C2CEscrow.placeOrder(merchant, productId, CRYPTO, amount, buyerInfo)
   → 校验产品 isActive
   → 校验 isMerchantOpen()
   → 校验 amount ≤ 1000 USDT（D-5：1:1，直接比较 amount <= 1000e18）
   → 读取链上 MerchantRate，校验未过期
   → 快照 (rate, rateVersion) → Order.rate, Order.rateVersion
   → 状态: PENDING

③ 买家提交 TLSN 支付证明（逻辑不变）
   C2CEscrow.payOrderByPlatform(merchant, productId, orderId, proofs)
   → COMPLETED，加密资产释放给买家

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIAT 产品
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
① 商家发布汇率
   C2CAdmin.publishRate(productId, FIAT, rate, expiresAt)

② 买家一步下单 + 同时锁币（原两步合并，PENDING 消除）
   C2CEscrow.placeOrder(merchant, productId, FIAT, amount, buyerInfo)
   → 同上校验（isActive、isMerchantOpen、上限、汇率）
   → safeTransferFrom(buyer → escrow, amount)  ← 内联原 payOrderByCrypto 逻辑
   → buyerEscrowedAmount += amount
   → 状态直接: WAITING（跳过 PENDING）

③ 商家提交 TLSN 支付证明（逻辑不变）
   C2CEscrow.receiveCryptoWithPlatformPayment(productId, orderId, proofs)
   → COMPLETED，加密资产释放给商家

④ 超时赔偿（逻辑不变）
   C2CEscrow.claimRefundAfterTimeout(merchant, productId, orderId)
   → 买家获得 2x 赔偿
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## §3 合约改造清单

### 3.1 C2CTypes.sol

**新增 struct**

```solidity
struct MerchantRate {
    uint256 rate;         // 汇率值，精度同现有 Order.rate
    uint32  version;      // 单调递增版本号，从 0 开始
    uint64  publishedAt;  // 发布时间戳 (block.timestamp)
    uint64  expiresAt;    // 过期时间戳；0 = 永不过期
}

struct BusinessHours {
    uint32  openSecond;     // 开门时间（UTC 秒，相对当天零点，0–86399）
    uint32  closeSecond;    // 关门时间（UTC 秒）
    uint8   activeDays;     // bitmask：bit0=周一 … bit6=周日
    uint8   manualOverride; // 0=自动(遵循时间表) 1=强制开 2=强制关
}
```

**删除 struct**

```solidity
struct SignedOrder { ... }   // EIP-712 废弃，完全删除
```

**新增 error**

```solidity
error RateNotPublished();       // 汇率从未发布
error RateExpired();            // 汇率已过期
error ExceedsUsdCap();          // 超过单笔 USD 上限
error MerchantClosed();         // 商家当前不在营业时间
error RateVersionMismatch();    // proof 中汇率版本与链上快照不符（备用）
```

**可删除 error**（EIP-712 废弃后不再触发，MVP 直接删除）

```solidity
error SignedOrderExpired();
error SaltUsed();
error InvalidSignature();
```

---

### 3.2 C2CAdmin.sol

**新增 storage**

```solidity
// 商家已发布汇率
// merchant => productId => assetType(uint8) => MerchantRate
mapping(address => mapping(uint256 => mapping(uint8 => MerchantRate)))
    public merchantRates;

// 商家营业时间
// merchant => productId => assetType(uint8) => BusinessHours
mapping(address => mapping(uint256 => mapping(uint8 => BusinessHours)))
    public businessHours;

// 单笔最大 USD 金额（以代币最小单位表示）
// D-5：1:1，USDT 18 位，1000 USDT = 1000 * 1e18
uint256 public maxOrderAmount = 1_000 * 1e18;
```

**新增 event**

```solidity
event RatePublished(
    address indexed merchant,
    uint256 indexed productId,
    uint8 indexed assetType,
    uint256 rate,
    uint32 version,
    uint64 expiresAt
);
event BusinessHoursSet(
    address indexed merchant,
    uint256 indexed productId,
    uint8 indexed assetType,
    uint32 openSecond,
    uint32 closeSecond,
    uint8 activeDays,
    uint8 manualOverride
);
event ManualOverrideSet(
    address indexed merchant,
    uint256 indexed productId,
    uint8 indexed assetType,
    uint8 manualOverride
);
event MaxOrderAmountUpdated(uint256 newAmount);
```

**新增 function（商家操作）**

```solidity
/// @notice 商家发布/更新汇率。发布即生效。
/// @param _productId  产品 ID
/// @param _assetType  0=CRYPTO  1=FIAT
/// @param _rate       汇率值（精度同现有 Order.rate）
/// @param _expiresAt  过期时间戳；0=永不过期
function publishRate(
    uint256 _productId,
    uint8 _assetType,
    uint256 _rate,
    uint64 _expiresAt
) external;
// 校验：isMerchantActive(msg.sender)
// 若 expiresAt != 0，校验 expiresAt > block.timestamp
// version++，写入 merchantRates

/// @notice 商家设置营业时间表（UTC 秒）
function setBusinessHours(
    uint256 _productId,
    uint8 _assetType,
    uint32 _openSecond,
    uint32 _closeSecond,
    uint8 _activeDays
) external;
// 写入 businessHours，manualOverride 保持不变

/// @notice 强制开门（忽略时间表）
function openNow(uint256 _productId, uint8 _assetType) external;
// businessHours[...].manualOverride = 1

/// @notice 强制关门（忽略时间表）
function closeNow(uint256 _productId, uint8 _assetType) external;
// businessHours[...].manualOverride = 2

/// @notice 清除手动覆盖，回归时间表模式
function clearManualOverride(uint256 _productId, uint8 _assetType) external;
// businessHours[...].manualOverride = 0
```

**新增 function（查询）**

```solidity
/// @notice 查询商家当前是否营业（供 C2CEscrow 调用）
function isMerchantOpen(
    address _merchant,
    uint256 _productId,
    uint8 _assetType
) external view returns (bool);
/*
优先级（高→低）：
  1. manualOverride == 2 → false（强制关）
  2. manualOverride == 1 → true（强制开）
  3. activeDays bitmask 不含今天 → false
  4. 判断 daySecond 是否在 [openSecond, closeSecond) 内
     - 跨零点：closeSecond < openSecond 时
       → daySecond >= openSecond || daySecond < closeSecond
     - 不跨零点：daySecond >= openSecond && daySecond < closeSecond

daySecond = block.timestamp % 86400
weekday   = (block.timestamp / 86400 + 3) % 7  // 0=周一
*/

/// @notice 读取商家当前有效汇率（供链外调用，C2CEscrow 直接读 storage）
function getMerchantRate(
    address _merchant,
    uint256 _productId,
    uint8 _assetType
) external view returns (MerchantRate memory);
```

**新增 function（admin 操作）**

```solidity
/// @notice Admin 设置单笔最大金额上限
function setMaxOrderAmount(uint256 _amount) external onlyAdmin;
```

---

### 3.3 C2CEscrow.sol

**删除 import / 继承**

```solidity
// 删除
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
contract C2CEscrow is EIP712 {   // → 改为 contract C2CEscrow {
```

**删除 storage**

```solidity
// 删除（EIP-712 废弃）
bytes32 private constant SIGNED_ORDER_TYPEHASH = ...;
mapping(address => mapping(address => mapping(uint256 => bool))) public usedSalt;
```

**修改 struct Order**（C2CEscrow.sol:42–48）

```solidity
struct Order {
    address buyer;
    uint256 amount;
    uint256 rate;
    uint32  rateVersion;   // ← 新增：下单时的汇率版本快照
    uint256 deadline;
    OrderStatus status;
}
```

**删除 function**

```solidity
payOrderByCrypto(...)   // 逻辑内联进新 placeOrder，函数完全删除
```

**修改 function `placeOrder`**

旧签名（C2CEscrow.sol:395）：
```solidity
function placeOrder(SignedOrder calldata so, bytes calldata signature,
                    BuyerPaymentInfo calldata buyerInfo) external
```

新签名：
```solidity
function placeOrder(
    address _merchant,
    uint256 _productId,
    AssetType _assetType,
    uint256 _amount,
    BuyerPaymentInfo calldata _buyerInfo
) external
```

内部逻辑变更（按顺序）：

```
1. 基础校验（与旧版对齐）：
   - isMerchantActive(_merchant) → revert NotMerchant（如需）
   - product = _getProduct(_merchant, _productId, _assetType)
   - product.isActive → revert ProductInactive
   - adminContract.isMerchantOpen(_merchant, _productId, uint8(_assetType))
     → revert MerchantClosed
   - _cleanupExpired(p, _merchant)
   - p.activeOrderCount < MAX_PENDING_ORDERS → revert TooManyPending
   - !hasActiveOrder[msg.sender][_merchant][uint8(_assetType)][_productId]
     → revert AlreadyHasActiveOrder
   - _amount > 0 → revert ZeroAmount
   - _availableAmount(p) >= _amount → revert InsufficientAvailable

2. USD 上限校验（D-5：1:1，直接比较代币数量）：
   uint256 maxAmt = adminContract.maxOrderAmount();
   if (_amount > maxAmt) revert ExceedsUsdCap();

3. 读取链上汇率：
   MerchantRate memory mr = adminContract.merchantRates[_merchant][_productId][uint8(_assetType)]
   if (mr.version == 0 && mr.publishedAt == 0) revert RateNotPublished();
   if (mr.expiresAt != 0 && block.timestamp > mr.expiresAt) revert RateExpired();

4. 写入订单（共同部分）：
   hasActiveOrder[msg.sender][_merchant][uint8(_assetType)][_productId] = true
   uint256 oid = p.nextOrderId++
   uint256 deadline = block.timestamp + ORDER_TIMEOUT

5. CRYPTO 产品分支：
   p.orders[oid] = Order{buyer: msg.sender, amount: _amount,
                         rate: mr.rate, rateVersion: mr.version,
                         deadline: deadline, status: PENDING}
   p.pendingAmount += _amount
   p.activeOrderCount++
   emit OrderPlaced(..., mr.rate, deadline)
   emit OrderStatusChanged(..., PENDING, deadline)

6. FIAT 产品分支（合并原 payOrderByCrypto）：
   - buyerInfo 非空校验（nameHash/idHash != 0）
   - buyerOrderPaymentInfo[_merchant][_productId][oid] = _buyerInfo
   - address token = _getTokenAddress(p.cryptoID)
   - IERC20(token).safeTransferFrom(msg.sender, address(this), _amount)
   - p.buyerEscrowedAmount += _amount
   - p.orders[oid] = Order{buyer: msg.sender, amount: _amount,
                           rate: mr.rate, rateVersion: mr.version,
                           deadline: deadline, status: WAITING}
   - p.pendingAmount += _amount
   - p.activeOrderCount++
   - emit BuyerEscrowDeposited(...)
   - emit OrderPlaced(..., mr.rate, deadline)
   - emit OrderStatusChanged(..., WAITING, deadline)
```

**修改 `_computeOrderBindingHash`**（C2CEscrow.sol:347–377）

新增 `rateVersion` 字段进入 hash 预像：

```solidity
function _computeOrderBindingHash(
    address _merchant,
    address _buyer,
    uint256 _productId,
    uint256 _orderId,
    AssetType _assetType,
    uint256 _amount,
    uint256 _rate,
    uint32  _rateVersion,      // ← 新增
    uint256 _deadline,
    bytes32 _merchantNameHash,
    bytes32 _merchantIdHash,
    bytes32 _payeeNameHash,
    bytes32 _payeeIdHash
) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(
        address(this),
        uint64(block.chainid),
        _merchant,
        _buyer,
        _productId,
        _orderId,
        uint8(_assetType),
        _amount,
        _rate,
        _rateVersion,           // ← 新增
        _deadline,
        _merchantNameHash,
        _merchantIdHash,
        _payeeNameHash,
        _payeeIdHash
    ));
}
```

**修改 `payOrderByPlatform`**（C2CEscrow.sol:515）

调用 `_computeOrderBindingHash` 时传入 `o.rateVersion`（新增参数）。

**修改 `receiveCryptoWithPlatformPayment`**（C2CEscrow.sol:605）

调用 `_computeOrderBindingHash` 时传入 `o.rateVersion`（新增参数）。

**修改 `cancelOrder`**（C2CEscrow.sol:474）

FIAT 产品 WAITING 状态**不允许买家取消**（D-2）：
- 当前 `_requireBuyerPending` 已确保只允许 PENDING 状态取消
- FIAT 产品下单后直接进入 WAITING，故 FIAT 订单天然无法通过 `cancelOrder` 取消
- **无需额外修改**，行为已符合 D-2

**修改 `_cleanupExpired`**（C2CEscrow.sol:746）

WAITING 状态订单在 buyerEscrowedAmount 计算中已包含买家打入的资金，`_claimCompensation` 逻辑不变（C2CEscrow.sol:778–793）。

---

### 3.4 test/helpers/signOrder.ts

**完全删除**。MVP 后不再需要 EIP-712 签名助手。

### 3.5 test/helpers/orderBindingHash.ts

**修改**：`computeOrderBindingHash` 参数新增 `rateVersion: bigint`，在 `encodePacked` 的 `rate` 字段之后插入 `uint32 rateVersion`。

```typescript
// 新增字段
rateVersion: bigint;

// 修改 encodePacked types/values：
types:  [..., "uint256", "uint32", "uint256", ...]
//                rate  rateVersion  deadline
values: [..., p.rate, p.rateVersion, p.deadline, ...]
```

### 3.6 test/helpers/constants.ts

**新增常量**

```typescript
// 汇率版本（发布第一次后 version = 1）
export const RATE_VERSION_INITIAL = 1n;

// USD 上限（1:1，USDT 18 位小数）
export const MAX_ORDER_AMOUNT = 1_000n * 10n ** 18n; // 1000 USDT

// 营业时间（UTC 秒，09:00–18:00，周一至周五）
export const OPEN_SECOND  = 9 * 3600;   // 32400
export const CLOSE_SECOND = 18 * 3600;  // 64800
export const ACTIVE_DAYS  = 0b0011111;  // bit0–4 = 周一至周五 = 31
```

**删除常量**

```typescript
// 删除（EIP-712 相关）
export const SIGN_TTL = ...;  // 各测试文件内部定义，统一删除
```

### 3.7 test/helpers/deploy.ts

**修改**：
- 删除 `signOrder` 相关 import
- 在 `deployAll` 中，商家注册后添加默认汇率发布（方便测试用的 `before` 块无需每次手动发布）：

```typescript
// 新增：发布初始汇率（CRYPTO + FIAT，供测试直接用）
// 注意：此步骤需在 C2CAdmin 授权 + 商家注册后执行
// 具体汇率值沿用原 constants.ts 中 RATE_ALIPAY_CRYPTO 等
```

---

## §4 状态机变更对比

### CRYPTO 产品

| | 改造前 | 改造后 |
|---|---|---|
| 进入 PENDING | placeOrder(SignedOrder, signature, NULL) | placeOrder(merchant, pid, CRYPTO, amount, NULL) |
| 进入 COMPLETED | payOrderByPlatform(proofs) | 同左 |
| 进入 CANCELLED | cancelOrder（PENDING状态买家主动取消）| 同左 |
| 进入 EXPIRED | 超时自动清理 | 同左 |
| PENDING 前置条件 | 商家 EIP-712 签名有效 + salt 未使用 | 商家已发布有效汇率 + 处于营业时间 + 金额 ≤ 上限 |

### FIAT 产品

| | 改造前 | 改造后 |
|---|---|---|
| 进入 PENDING | placeOrder(SignedOrder, signature, buyerInfo) | **不存在**（跳过） |
| 进入 WAITING | payOrderByCrypto（第二步，买家再次 TX）| placeOrder（一步，直接 WAITING）|
| 进入 COMPLETED | receiveCryptoWithPlatformPayment(proofs) | 同左 |
| 进入 CANCELLED | cancelOrder（PENDING阶段）| **不支持**（直接进入 WAITING，前端警示） |
| 进入 EXPIRED | claimRefundAfterTimeout（WAITING超时）| 同左 |
| 赔偿 | 买家得 2x（C2CEscrow.sol:781）| 同左 |

---

## §5 TLSN Verifier 服务端改动

`_computeOrderBindingHash` 新增 `rateVersion` 字段，服务端在签名 `orderBindingHash` 时需同步更新计算逻辑：

**旧 hash 预像**（伪代码）：
```
keccak256(escrow ++ chainId ++ merchant ++ buyer ++
          productId ++ orderId ++ assetType ++
          amount ++ rate ++ deadline ++
          merchantNameHash ++ merchantIdHash ++
          payeeNameHash ++ payeeIdHash)
```

**新 hash 预像**（新增 `rateVersion` 在 `rate` 之后）：
```
keccak256(escrow ++ chainId ++ merchant ++ buyer ++
          productId ++ orderId ++ assetType ++
          amount ++ rate ++ rateVersion ++   ← 新增 uint32
          deadline ++
          merchantNameHash ++ merchantIdHash ++
          payeeNameHash ++ payeeIdHash)
```

服务端需从链上读取订单的 `rateVersion` 后填入签名内容。

---

## §6 测试用例整理

### 6.1 整体原则

- **删除**：所有依赖 `signOrder` + EIP-712 签名的测试用例
- **删除**：`payOrderByCrypto` 相关测试
- **修改**：所有通过 `placeCryptoOrder` / `placeFiatOrder` 辅助函数下单的测试——重写辅助函数，改为调用新 `placeOrder`
- **新增**：汇率发布、营业时间、一步下单（FIAT）、USD 上限专项测试
- **保留**：`payOrderByPlatform`、`receiveCryptoWithPlatformPayment`、证明验证、超时赔偿等核心链路测试（只改 setup 辅助函数）

---

### 6.2 新测试辅助函数设计

#### 替换 `placeCryptoOrder`（Alipay / Wise 共用）

```typescript
// 新版：无需 salt，无需签名
async function placeCryptoOrder(
  d: DeployResult,
  pc: any,
  productId: bigint = 0n,
): Promise<{ orderId: bigint; deadline: bigint; rateVersion: bigint }> {
  await d.escrowAsBuyer.write.placeOrder([
    d.merchant.account.address,
    productId,
    0,           // AssetType.CRYPTO
    TRADE_AMOUNT,
    NULL_BUYER_INFO,
  ]);
  const [, , , deadline] = await d.c2cEscrow.read.getOrder([
    d.merchant.account.address, productId, 0, 0n,
  ]);
  // rateVersion 从链上 Order 读取（需新增 getOrder 返回）
  return { orderId: 0n, deadline, rateVersion: 1n }; // 初始版本 = 1
}
```

#### 替换 `placeFiatOrder`

```typescript
// 新版：一步完成，直接 WAITING
async function placeFiatOrder(
  d: DeployResult,
  pc: any,
  productId: bigint = 0n,
): Promise<{ orderId: bigint; deadline: bigint; rateVersion: bigint }> {
  await d.escrowAsBuyer.write.placeOrder([
    d.merchant.account.address,
    productId,
    1,           // AssetType.FIAT
    TRADE_AMOUNT,
    BUYER_PAYMENT_INFO,
  ]);
  const [, , , deadline] = await d.c2cEscrow.read.getOrder([
    d.merchant.account.address, productId, 1, 0n,
  ]);
  return { orderId: 0n, deadline, rateVersion: 1n };
}
```

#### `setupBase` 修改

在 `setupBase` 中，商家注册 + 设置支付信息之后，**增加汇率发布**：

```typescript
// 发布初始汇率（CRYPTO 产品）
await d.adminAsMerchant.write.publishRate([
  0n,                   // productId（需先上架产品，或在 describe before 里执行）
  0,                    // AssetType.CRYPTO
  RATE_ALIPAY_CRYPTO,   // or RATE_WISE_CRYPTO
  0n,                   // expiresAt = 0（永不过期）
]);
// 发布初始汇率（FIAT 产品）
await d.adminAsMerchant.write.publishRate([
  0n,
  1,                    // AssetType.FIAT
  RATE_ALIPAY_FIAT,     // or RATE_WISE_FIAT
  0n,
]);
```

> **注意**：`publishRate` 需在产品上架后调用（productId 需存在）。  
> 建议在各 `describe` 的 `before` 块中，先 `listCryptoProduct`/`listFiatProduct`，再 `publishRate`。

#### `computeOrderBindingHash` 辅助函数更新

所有调用处新增 `rateVersion` 参数：

```typescript
const obh = computeOrderBindingHash({
  // ... 原有字段 ...
  rateVersion: 1n,   // ← 新增，从 Order 快照读取
});
```

---

### 6.3 测试用例清单

#### 模块 A：注册、汇率发布、营业时间（新增，取代旧 A 组通用部分）

| ID | 描述 | 断言/revert | 对应改动 |
|---|---|---|---|
| A-01 | admin 注册商户 → 成功 | isMerchantActive == true | 保留 |
| A-02 | 重复注册商户 → AlreadyRegistered | revert | 保留 |
| A-03 | 非 admin 注册商户 → OnlyAdmin | revert | 保留 |
| A-04 | 商户设置支付信息 → 链上存 hash | nameHash/idHash 匹配 | 保留 |
| A-05 | 非商户设置支付信息 → NotMerchant | revert | 保留 |
| A-06 | 上架 CRYPTO 产品 → ProductListed | emit 检查 | 保留 |
| A-07 | 上架 FIAT 产品 → getProductPlatformId 正确 | platformId 匹配 | 保留 |
| A-08 | 非商户上架产品 → NotMerchant | revert | 保留 |
| **A-09** | **商家发布 CRYPTO 汇率 → version=1, publishedAt 设置** | merchantRates 字段 | **新增** |
| **A-10** | **商家更新汇率 → version 递增至 2** | version==2 | **新增** |
| **A-11** | **非商家调用 publishRate → NotMerchant** | revert | **新增** |
| **A-12** | **发布过期时间 < 当前时间 → revert** | revert（或 RateExpired 等效）| **新增** |
| **A-13** | **expiresAt=0 表示永不过期，下单可成功** | placeOrder 不 revert | **新增** |
| **A-14** | **汇率过期后 placeOrder → RateExpired** | revert RateExpired | **新增** |
| **A-15** | **从未发布汇率直接 placeOrder → RateNotPublished** | revert RateNotPublished | **新增** |
| **A-16** | **设置营业时间 → businessHours 写入正确** | openSecond/closeSecond/activeDays 匹配 | **新增** |
| **A-17** | **openNow → manualOverride=1, isMerchantOpen=true** | isMerchantOpen == true | **新增** |
| **A-18** | **closeNow → manualOverride=2, isMerchantOpen=false** | isMerchantOpen == false | **新增** |
| **A-19** | **clearManualOverride 后回归时间表** | manualOverride == 0 | **新增** |
| **A-20** | **营业时间内 placeOrder → 成功** | OrderPlaced emit | **新增** |
| **A-21** | **非营业时间 placeOrder（关门日） → MerchantClosed** | revert MerchantClosed | **新增** |
| **A-22** | **closeNow 后 placeOrder → MerchantClosed** | revert MerchantClosed | **新增** |
| **A-23** | **closeNow 后已有 WAITING 订单继续正常流转（D-7）** | receiveCryptoPlatformPayment 成功 | **新增** |
| **A-24** | **跨零点营业时间（22:00–02:00）边界测试** | isMerchantOpen 在各时间点返回正确 | **新增** |
| **A-25** | **admin setMaxOrderAmount → 新上限立即生效** | placeOrder 以新上限校验 | **新增** |
| **A-26** | **amount == 1000 USDT → 成功（边界）** | OrderPlaced emit | **新增** |
| **A-27** | **amount > 1000 USDT → ExceedsUsdCap** | revert ExceedsUsdCap | **新增** |
| ~~A-09~~ | ~~商家下架后不可下单（旧版用 signOrder）~~ | **改写**：下架后用新 placeOrder → ProductInactive | **改写** |

---

#### 模块 FA：CRYPTO 产品 Alipay（Flow A）

> 辅助函数 `placeCryptoOrder` 改写为新签名，测试逻辑主体保留。

| ID | 描述 | 断言/revert | 状态 |
|---|---|---|---|
| **FA-01** | **新 placeOrder 下单（无签名）→ OrderPlaced emit** | emit + status=PENDING | **改写（原用 signOrder）** |
| FA-02 | payOrderByPlatform 完整证明 → 成功，买家余额增加 | buyerBalance delta == TRADE_AMOUNT | 保留（改 setup）|
| FA-03 | COMPLETED 后 hasActiveOrder = false | hasActiveOrder == false | 保留（改 setup）|
| FA-04 | 完成后抵押物余额减少 | escrow balance < COLLATERAL | 保留（改 setup）|
| FA-05 | sessionId 重放 → SessionAlreadyUsed | revert | 保留（改 setup）|
| FA-06 | Alipay orderId 重放 → DuplicateAlipayOrderId | revert | 保留（改 setup）|
| FA-07 | 支付金额不符 → PaymentAmountMismatch | revert | 保留（改 setup）|
| FA-08 | bizType 不是 TRANSFER → InvalidAlipayBizType | revert | 保留（改 setup）|
| FA-09 | status 不是 SUCCESS → AlipayPaymentNotCompleted | revert | 保留（改 setup）|
| FA-10 | 付款时间早于订单创建 → AlipayTransferTooOld | revert | 保留（改 setup）|
| FA-11 | 付款时间超过截止 → AlipayTransferDateExpired | revert | 保留（改 setup）|
| FA-12 | 订单超时后提交证明 → OutOfDeadline | revert | 保留（改 setup）|
| **FA-13** | **proof 中 orderBindingHash 含错误 rateVersion → OrderBindingHashMismatch** | revert | **新增** |
| **FA-14** | **同一买家对同一产品下两单 → AlreadyHasActiveOrder** | revert | **改写（原用 salt/signOrder）** |
| ~~FA-old~~ | ~~salt 重放 → SaltUsed~~ | **删除**（机制废弃）| **删除** |
| ~~FA-old~~ | ~~签名过期 → SignedOrderExpired~~ | **删除**（机制废弃）| **删除** |
| ~~FA-old~~ | ~~非法签名 → InvalidSignature~~ | **删除**（机制废弃）| **删除** |

---

#### 模块 FB：FIAT 产品 Alipay（Flow B）

> 原 Flow B 分为两阶段（placeOrder + payOrderByCrypto），现合并为一步下单。

| ID | 描述 | 断言/revert | 状态 |
|---|---|---|---|
| **FB-01** | **一步 placeOrder（FIAT）→ 买家余额立即扣减 amount，订单状态=WAITING** | buyerBalance delta == TRADE_AMOUNT + status=WAITING | **改写** |
| **FB-02** | **placeOrder（FIAT）→ buyerEscrowedAmount 增加** | p.buyerEscrowedAmount == TRADE_AMOUNT | **新增** |
| **FB-03** | **placeOrder（FIAT）→ emit BuyerEscrowDeposited** | emit 验证 | **改写（原为独立 payOrderByCrypto 步骤）** |
| **FB-04** | **placeOrder（FIAT）buyerInfo 未提供（nameHash=0）→ BuyerPaymentInfoRequired** | revert | **改写** |
| FB-05 | receiveCryptoWithPlatformPayment 完整证明 → 成功，商家收款 | merchantBalance delta == TRADE_AMOUNT | 保留（改 setup）|
| FB-06 | COMPLETED 后 buyerEscrowedAmount 归零 | p.buyerEscrowedAmount == 0 | 保留（改 setup）|
| FB-07 | 商家截止时间内未付款 → claimRefundAfterTimeout → 买家获 2x 赔偿 | buyerBalance delta == 2*TRADE_AMOUNT | 保留（改 setup）|
| FB-08 | 未超时调用 claimRefundAfterTimeout → NotYetExpired | revert | 保留（改 setup）|
| FB-09 | 支付金额不符 → ReceivedAmountMismatch | revert | 保留（改 setup）|
| FB-10 | bizType 不是 TRANSFER → InvalidAlipayBizType | revert | 保留（改 setup）|
| FB-11 | status 不是 SUCCESS → AlipayPaymentNotCompleted | revert | 保留（改 setup）|
| FB-12 | 付款时间超过截止 → AlipayTransferDateExpired | revert | 保留（改 setup）|
| **FB-13** | **FIAT 产品 WAITING 状态调用 cancelOrder → NotPending**（买家无法取消，D-2）| revert NotPending | **新增** |
| **FB-14** | **proof 中 orderBindingHash 含错误 rateVersion → OrderBindingHashMismatch** | revert | **新增** |
| **FB-15** | **商家更新汇率后，已有 WAITING 订单仍使用旧快照 rate 完成（D-1）** | receiveCryptoPlatformPayment 成功 | **新增** |
| ~~FB-old~~ | ~~payOrderByCrypto 独立步骤相关测试~~ | **删除**（函数移除）| **删除** |

---

#### 模块 FC/FD：Wise 产品（Flow C CRYPTO / Flow D FIAT）

> 与 Alipay 模块同构，仅平台名和证明结构不同（两证明）。

| ID | 描述 | 状态 |
|---|---|---|
| **FC-01** | **新 placeOrder 下单（无签名）→ PENDING** | **改写** |
| FC-02 | payOrderByPlatform 两证明 → 成功 | 保留（改 setup）|
| FC-03 ~ FC-n | 与 FA-03~FA-12 对应的 Wise 版本 | 保留（改 setup）|
| **FC-m** | **proof rateVersion 不符 → OrderBindingHashMismatch** | **新增** |
| **FD-01** | **一步 placeOrder（FIAT）→ WAITING + 余额扣减** | **改写** |
| FD-02 ~ FD-n | 与 FB-05~FB-12 对应的 Wise 版本 | 保留（改 setup）|
| **FD-m** | **FIAT WAITING 状态不可取消（D-2）** | **新增** |
| **FD-m+1** | **汇率更新后已有订单仍完成（D-1）** | **新增** |
| W-01~W-07 | 注册、上架、安全性测试 | 参照 W 组：保留通用部分，EIP-712 相关**删除** |

---

#### 模块 SEC：安全专项（跨平台）

| ID | 描述 | 断言/revert | 状态 |
|---|---|---|---|
| SEC-01 | sessionId 重放（跨订单）→ SessionAlreadyUsed | revert | 保留 |
| SEC-02 | UntrustedVerifier（非信任 verifier 签名）→ UntrustedVerifier | revert | 保留 |
| SEC-03 | CommitmentsHash 篡改 → CommitmentsHashMismatch | revert | 保留 |
| SEC-04 | CommitmentOpening 不匹配 → CommitmentOpeningMismatch | revert | 保留 |
| SEC-05 | PlatformNotRegistered（platformVerifier=0）→ PlatformNotRegistered | revert | 保留 |
| SEC-06 | OrderBindingHash 篡改 → OrderBindingHashMismatch | revert | 保留 |
| **SEC-07** | **商家修改 nameHash 后，旧 proof 的 OBH 不匹配 → OrderBindingHashMismatch** | revert | 保留（已有 W-07）|
| ~~SEC-old~~ | ~~非买家调用 placeOrder（buyer mismatch）~~ | **删除**（新 placeOrder 无 buyer 字段，msg.sender 即 buyer）| **删除** |
| ~~SEC-old~~ | ~~使用他人签名下单 → InvalidSignature~~ | **删除**（机制废弃）| **删除** |

---

#### 模块 RATE：汇率专项（新增）

| ID | 描述 | 断言/revert |
|---|---|---|
| RATE-01 | publishRate → version=1, publishedAt=now, rate 正确写入 | merchantRates 字段断言 |
| RATE-02 | 再次 publishRate → version=2（递增）| version == 2 |
| RATE-03 | 非商家 publishRate → NotMerchant revert | revert |
| RATE-04 | expiresAt=0 → 永不过期，placeOrder 成功 | OrderPlaced emit |
| RATE-05 | 设置 expiresAt=now+100，time.advanceTime(101) 后 placeOrder → RateExpired | revert RateExpired |
| RATE-06 | 未发布汇率直接 placeOrder → RateNotPublished | revert RateNotPublished |
| RATE-07 | 下单后商家更新汇率，已存在 Order.rateVersion 不变 | 链上 order.rateVersion 仍为旧版本 |
| RATE-08 | 两次并发下单，各自 rateVersion 快照与实际 placeOrder 顺序一致 | 各 order.rateVersion 断言 |
| RATE-09 | FIAT 产品汇率更新后，旧 WAITING 订单用旧 rate+rateVersion 的 proof 仍可完成（D-1）| receiveCryptoPlatformPayment 成功 |
| RATE-10 | FIAT 产品用新 rate 构造的 proof 提交至旧 rateVersion 订单 → OrderBindingHashMismatch | revert |

---

#### 模块 BH：营业时间专项（新增）

| ID | 描述 | 断言/revert |
|---|---|---|
| BH-01 | 未设置 BusinessHours（默认 activeDays=0）→ isMerchantOpen=false | false |
| BH-02 | 设置营业时间（周一–周五 09–18）→ businessHours 写入正确 | struct 字段匹配 |
| BH-03 | 营业时间内（time 模拟）→ isMerchantOpen=true | true |
| BH-04 | 非营业日（周六，bitmask 未包含）→ isMerchantOpen=false | false |
| BH-05 | 营业时间外（时间段之外）→ isMerchantOpen=false | false |
| BH-06 | openNow 后 isMerchantOpen=true（无论时间）| true |
| BH-07 | closeNow 后 isMerchantOpen=false（无论时间）| false |
| BH-08 | clearManualOverride 后回归时间表判断 | 依时间表逻辑 |
| BH-09 | 非营业时间 placeOrder → MerchantClosed revert | revert MerchantClosed |
| BH-10 | openNow 后非营业时间 placeOrder → 成功 | OrderPlaced emit |
| BH-11 | closeNow 后 placeOrder → MerchantClosed revert | revert MerchantClosed |
| BH-12 | closeNow 后已有 WAITING 订单正常完成（D-7）| receiveCryptoPlatformPayment 成功 |
| BH-13 | 跨零点（22:00–02:00）01:00 时 → true，03:00 时 → false | isMerchantOpen 各断言 |
| BH-14 | 非商家调用 setBusinessHours/openNow/closeNow → NotMerchant | revert |

---

#### 模块 CAP：金额上限专项（新增）

| ID | 描述 | 断言/revert |
|---|---|---|
| CAP-01 | amount = 999 USDT (1e18 per unit) → placeOrder 成功 | OrderPlaced emit |
| CAP-02 | amount = 1000 USDT（边界）→ 成功 | OrderPlaced emit |
| CAP-03 | amount = 1001 USDT → ExceedsUsdCap revert | revert |
| CAP-04 | admin setMaxOrderAmount(500 USDT) → 500 USDT 边界生效 | 500 USDT 成功，501 revert |
| CAP-05 | FIAT 产品同样受上限约束 | 同 CAP-01~03 |

---

## §7 修改执行顺序

以下顺序可确保每步可独立编译和测试：

```
Step 1  修改 C2CTypes.sol
        - 新增 MerchantRate、BusinessHours struct
        - 新增 error（RateNotPublished、RateExpired、ExceedsUsdCap、MerchantClosed）
        - 删除 SignedOrder struct
        - 删除 SignedOrderExpired、SaltUsed、InvalidSignature error
        ✓ 可编译（其他合约尚未修改，会有编译错误，正常）

Step 2  修改 C2CAdmin.sol
        - 新增 storage（merchantRates、businessHours、maxOrderAmount）
        - 新增 event（RatePublished、BusinessHoursSet 等）
        - 新增 function（publishRate、setBusinessHours、openNow、closeNow、
                         clearManualOverride、isMerchantOpen、getMerchantRate、
                         setMaxOrderAmount）
        ✓ 可独立编译

Step 3  修改 C2CEscrow.sol
        - 删除 import ECDSA、EIP712，去掉 is EIP712 继承
        - 删除 SIGNED_ORDER_TYPEHASH 常量
        - 删除 usedSalt storage
        - 修改 Order struct（新增 rateVersion）
        - 重写 placeOrder（新签名 + 内联 FIAT 锁币）
        - 删除 payOrderByCrypto 函数
        - 修改 _computeOrderBindingHash（新增 rateVersion 参数）
        - 修改 payOrderByPlatform 调用 _computeOrderBindingHash（传入 o.rateVersion）
        - 修改 receiveCryptoWithPlatformPayment（同上）
        ✓ 可编译（依赖 Step 1、2 完成）

Step 4  修改 test/helpers/orderBindingHash.ts
        - 新增 rateVersion 参数

Step 5  删除 test/helpers/signOrder.ts

Step 6  修改 test/helpers/constants.ts
        - 新增 RATE_VERSION_INITIAL、MAX_ORDER_AMOUNT、OPEN_SECOND 等
        - 删除各文件内 SIGN_TTL 常量（各测试文件自行删除）

Step 7  修改 test/helpers/deploy.ts
        - 删除 signOrder 相关代码
        - 可选：在 deployAll 末尾预设默认汇率（按平台分开）

Step 8  重写 test/AlipayPlatform.ts
        - 按照 §6 清单：删除 EIP-712 相关 test，改写 placeCryptoOrder/placeFiatOrder，
          新增 A-09~A-27、FA-13~FA-14、FB-01~FB-15 等

Step 9  重写 test/WisePlatform.ts
        - 同 Step 8，对应 Wise 平台

Step 10 新增 test/Rate.ts
        - RATE 模块所有用例

Step 11 新增 test/BusinessHours.ts
        - BH 模块所有用例

Step 12 新增 test/Cap.ts
        - CAP 模块所有用例

Step 13 全量跑测试
        npm test
```

---

## §8 文件变更汇总

| 文件 | 操作 | 说明 |
|---|---|---|
| `contracts/C2CTypes.sol` | 修改 | 新增 struct/error，删除 SignedOrder 及旧 error |
| `contracts/C2CAdmin.sol` | 修改 | 新增汇率/营业时间 storage + function |
| `contracts/C2CEscrow.sol` | 修改 | 删除 EIP-712，重写 placeOrder，删除 payOrderByCrypto，更新 hash |
| `contracts/TLSNVerifier.sol` | **不修改** | 核心验证逻辑不变 |
| `contracts/interfaces/IPlatformVerifier.sol` | **不修改** | 接口不变 |
| `contracts/platforms/AlipayPlatformVerifier.sol` | **不修改** | 平台业务逻辑不变 |
| `contracts/platforms/WisePlatformVerifier.sol` | **不修改** | 平台业务逻辑不变 |
| `test/helpers/signOrder.ts` | **删除** | EIP-712 机制废弃 |
| `test/helpers/orderBindingHash.ts` | 修改 | 新增 rateVersion 参数 |
| `test/helpers/constants.ts` | 修改 | 新增常量，删除 SIGN_TTL |
| `test/helpers/deploy.ts` | 修改 | 删除 signOrder 相关，可选默认汇率 |
| `test/AlipayPlatform.ts` | 修改 | 按 §6 重写/删除/新增用例 |
| `test/WisePlatform.ts` | 修改 | 按 §6 重写/删除/新增用例 |
| `test/C2CAdmin.ts` | 修改 | 新增 publishRate / BusinessHours 用例 |
| `test/Rate.ts` | **新增** | RATE 模块专项用例 |
| `test/BusinessHours.ts` | **新增** | BH 模块专项用例 |
| `test/Cap.ts` | **新增** | CAP 模块专项用例 |
| TLSN Verifier 服务端（Rust）| 修改 | orderBindingHash 计算加入 rateVersion |

---

## §9 关键精度说明

### CRYPTO 产品 fiatAmountX1000 公式（不变）

```
fiatAmountX1000 = mulDiv(amount, rate, 1e33)
// TRADE_AMOUNT = 1e18, RATE_ALIPAY_CRYPTO = 7.2e18 → fiatX1000 = 7200 = 7.200 CNY
```

### FIAT 产品 fiatAmountX1000 公式（不变）

```
fiatAmountX1000 = mulDiv(amount, rate * 10, 1e18)
// TRADE_AMOUNT = 1e18, RATE_ALIPAY_FIAT = 720 → fiatX1000 = 7200 = 7.200 CNY
```

### USD 上限（D-5：1:1）

```
maxOrderAmount = 1000 * 1e18  // 单位：USDT wei（18 decimals）
校验：amount <= maxOrderAmount
```

无需价格预言机，无需乘法，直接比较。

### rateVersion 在 hash 中的编码

```
abi.encodePacked(..., uint256 rate, uint32 rateVersion, uint256 deadline, ...)
// 使用 uint32 节省 gas，version 上限 ~42亿，足够使用
```

---

*文档结束。实现时以此文档为准，代码修改按 §7 执行顺序逐步进行。*
