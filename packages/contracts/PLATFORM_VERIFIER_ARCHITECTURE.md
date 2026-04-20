# C2C Platform – 多平台支付验证器架构方案

> **状态**: 设计文档（待实施）
> **版本**: v2.0
> **日期**: 2026-04-03
> **背景**: 在 Wise 验证已完整实现的基础上，扩展支持 Alipay 及未来更多支付平台，
>           同时确保合约字节码不超过 EVM 24.5KB 部署上限。

---

## 一、现状分析与核心问题

### 当前架构痛点

| 问题 | 位置 | 影响 |
|------|------|------|
| Wise 特定逻辑硬编码在 `TLSNVerifier` | `verifyWiseFiatPayment()` + `_matchWise*()` 等 | 每新增平台 +50~100 行，合约膨胀 |
| `C2CEscrow.payOrderByWise()` 直接调 Wise 函数 | `payOrderByWise()` | 平台增多需改主合约 |
| JSON 解析工具函数嵌入 `TLSNVerifier` | `_parseKeyHash()` 等 4 个函数 | 各平台重复代码 |
| `MerchantPaymentInfo` 字段 Wise 专属 | `displayName`, `handle` | 其他平台语义不同 |
| 平台特定存储混入核心合约 | `usedTransferIds` | 不同平台的 replay ID 混合 |

---

## 二、目标架构：平台验证器注册表模式

```
┌─────────────────────────────────────────────────────────┐
│                   C2CEscrow                              │
│  payOrderByPlatform(platformId, proof)                   │
│  receiveCryptoWithPlatformPayment(platformId, proof)     │
└────────────────────────┬────────────────────────────────┘
                         │ delegateTo(platformId)
┌────────────────────────▼────────────────────────────────┐
│              TLSNVerifier（精简核心，保持 <10KB）          │
│  verifyProof()           ← 通用 TLSN 验证，不变           │
│  verifyKYB()             ← 通用 KYB 验证，不变            │
│  mapping(bytes32 => address) platformVerifiers  [注册表] │
│  verifyFiatPayment(platformId, proof, ...) → 委托调用     │
│  verifyMerchantPaymentReceived(platformId, ...)           │
└────────────┬──────────────────────────┬─────────────────┘
             │                          │
┌────────────▼──────────┐ ┌─────────────▼──────────┐ ┌──────
│  WisePlatformVerifier  │ │ AlipayPlatformVerifier  │ │ ...
│  (从 TLSNVerifier 抽出)│ │ (新增)                  │ │ (未来)
│  usedTransferIds map   │ │ usedAlipayOrderIds map  │ │
└────────────────────────┘ └────────────────────────┘ └──────
             │                          │
┌────────────▼──────────────────────────────────────────┐
│              TLSNParserLib（共享 library）               │
│  parseKeyHash() / extractStringValue()                 │
│  extractRawUint() / extractFiatAmount()                │
│  parseDatetimeToUnix()  ← Alipay gmtSuccess 解析       │
└───────────────────────────────────────────────────────┘
```

---

## 三、各平台字段对比

### Wise（已实现）

| 合约字段 | Wise JSON key | 格式 | 示例 |
|----------|--------------|------|------|
| 收款人名 | `title` | 字符串 | `"KAI XU LOOI"` |
| 收款人 handle | `subtitle` | 字符串 | `"@kaixul1"` |
| 转账状态 | `state` | 字符串 | `"OUTGOING_PAYMENT_SENT"` |
| 金额 | `targetAmount` | **数字**（无引号）| `450` |
| 货币 | `targetCurrency` | 字符串 | `"MYR"` |
| 转账 ID | `id` | 数字 | `2008490705` |
| 时间戳 | `date` | 毫秒时间戳 | `1772810945000` |
| 服务器 | `serverName` | — | `wise.com` |
| 两个 proof | contacts + transfer | — | — |

### Alipay（待实现）

| 合约字段 | Alipay JSON key | 格式 | 示例 |
|----------|----------------|------|------|
| 收款人名 | `payeeName` | 字符串 | `"* LIM HOOI YEN"` |
| 收款人邮箱 | `payeeLoginEmail` | 字符串 | `"kel***@hotmail.com"` |
| 支付状态 | `status` | 字符串 | `"succeed"` |
| 金额 | `payAmount` | **字符串（带引号）**| `"250.00"` |
| 订单 ID | `orderId` | 字符串 | `"20260331200040011100490058272169"` |
| 时间 | `gmtSuccess` | **日期字符串（UTC+8）** | `"2026-03-31 23:34:44"` |
| 服务器 | `serverName` | — | `mbillexprod.alipay.com` |
| 单个 proof | 单 proof | — | — |

> **关键差异**：
> 1. Alipay `payAmount` 是带引号的字符串 `"250.00"`（Wise `targetAmount` 是裸数字 `450`），但 `_extractFiatAmountFromBytes` 已支持跳过可选引号，可复用
> 2. Alipay `gmtSuccess` 是 UTC+8 的日期时间字符串，需要在合约内转换为 Unix 时间戳（详见第五节）
> 3. Alipay 只有一个 proof（Wise 需要 contacts + transfer 两个）

---

## 四、需要新增 / 修改的文件

### 新增文件

#### 1. `contracts/interfaces/IPlatformVerifier.sol`
统一接口，所有平台验证器实现：
```solidity
interface IPlatformVerifier {
    function verifyFiatPayment(
        TLSNProof calldata proof,
        uint256 fiatAmountX1000,
        string calldata targetCurrency,
        address merchant,        // 用于从 C2CAdmin 读取商家信息
        uint256 orderDeadline
    ) external returns (bytes32 uniquePaymentId);

    function verifyMerchantPaymentSent(
        TLSNProof calldata proof,
        uint256 fiatAmountX1000,
        uint256 orderDeadline
    ) external returns (bytes32 uniquePaymentId);
}
```

#### 2. `contracts/lib/TLSNParserLib.sol`
从 `TLSNVerifier` 中提取 4 个解析函数 + 新增 Alipay 日期解析：
```solidity
library TLSNParserLib {
    function parseKeyHash(bytes memory val) internal pure returns (bytes32);
    function extractStringValue(bytes memory val) internal pure returns (bytes memory);
    function extractRawUint(bytes memory val) internal pure returns (uint256);
    function extractFiatAmount(bytes memory val) internal pure returns (uint256);

    // ← 新增：Alipay gmtSuccess 专用
    function parseDatetimeToUnix(bytes memory dateStr) internal pure returns (uint256);
}
```

#### 3. `contracts/platforms/WisePlatformVerifier.sol`
将 `TLSNVerifier` 中以下内容迁移：
- `verifyWiseFiatPayment()` 整体逻辑
- `_matchWiseContactsProof()` + `_matchWiseTransferProof()` + `_parseWiseTransferItems()`
- `usedTransferIds` mapping
- KEY_STATE / KEY_TARGET_AMOUNT / KEY_DATE 等常量

#### 4. `contracts/platforms/AlipayPlatformVerifier.sol`
新平台验证器（详见第五节）。

---

### 修改文件

#### 5. `contracts/TLSNVerifier.sol`
**移除**：
- `verifyWiseFiatPayment()` 函数
- `_matchWiseContactsProof()` 等 Wise 内部函数（全部迁至 `WisePlatformVerifier`）
- 4 个 JSON 解析私有函数（全部迁至 `TLSNParserLib`）
- `usedTransferIds` mapping（迁至 `WisePlatformVerifier`）

**新增**：
```solidity
bytes32 public constant PLATFORM_WISE   = keccak256("wise");
bytes32 public constant PLATFORM_ALIPAY = keccak256("alipay");

mapping(bytes32 => address) public platformVerifiers;

function registerPlatformVerifier(bytes32 platformId, address verifier) external onlyAdmin;

function verifyFiatPayment(
    bytes32 platformId,
    TLSNProof calldata proof,
    uint256 fiatAmountX1000,
    string calldata targetCurrency,
    address merchant,
    uint256 orderDeadline
) external onlyAuthorized returns (bytes32 uniquePaymentId) {
    address pv = platformVerifiers[platformId];
    require(pv != address(0), "Platform not registered");
    _verifyTLSNProof(proof);  // 通用验证仍在核心合约
    return IPlatformVerifier(pv).verifyFiatPayment(
        proof, fiatAmountX1000, targetCurrency, merchant, orderDeadline
    );
}
```

#### 6. `contracts/C2CEscrow.sol`
**替换** `payOrderByWise()` → `payOrderByPlatform(bytes32 platformId, proof)`
**新增** `receiveCryptoWithPlatformPayment(bytes32 platformId, proof)`

核心改动：
```solidity
function payOrderByPlatform(
    address _merchant,
    uint256 _productId,
    uint256 _orderId,
    bytes32 _platformId,
    TLSNProof calldata proof
) external {
    // ... 同 payOrderByWise，但调用 verifier.verifyFiatPayment(_platformId, ...)
}
```

#### 7. `contracts/C2CTypes.sol`（可选优化）
将 `MerchantPaymentInfo` 泛化，支持多平台：
```solidity
struct MerchantPaymentInfo {
    string field1;    // wise: displayName / alipay: payeeName
    string field2;    // wise: handle     / alipay: payeeLoginEmail
    bytes32 platform; // keccak256("wise") / keccak256("alipay")
    bool isSet;
}
```

---

## 五、Alipay gmtSuccess → block.timestamp 转换方案

### 问题描述
Alipay API 返回的时间格式为 UTC+8 的日期时间字符串：
```
"gmtSuccess":"2026-03-31 23:34:44"
```
合约需要将其转换为 Unix UTC 秒级时间戳，与 `block.timestamp` / `orderDeadline` 比较。

### 最优方案：BokkyPooBahsDateTimeLibrary 内联算法

参考：https://github.com/bokkypoobah/BokkyPooBahsDateTimeLibrary
License: MIT

核心函数内联入 `TLSNParserLib`，无需外部依赖：

```solidity
/// @notice 将 Alipay "YYYY-MM-DD HH:MM:SS" (UTC+8) 转换为 Unix UTC 时间戳
/// @dev  格式固定 19 字节，UTC+8 偏移 = 8 * 3600 = 28800 秒
function parseDatetimeToUnix(bytes memory d) internal pure returns (uint256) {
    require(d.length == 19, "InvalidDatetimeLength");
    // d: 2026-03-31 23:34:44
    //    0123456789012345678
    uint256 year   = _p4(d, 0);
    uint256 month  = _p2(d, 5);
    uint256 day    = _p2(d, 8);
    uint256 hour   = _p2(d, 11);
    uint256 minute = _p2(d, 14);
    uint256 second = _p2(d, 17);

    uint256 utc8Unix = _timestampFromDateTime(year, month, day, hour, minute, second);
    return utc8Unix - 28800; // UTC+8 → UTC
}

/// @dev BokkyPooBah 核心算法（MIT License）
function _timestampFromDateTime(
    uint256 year, uint256 month, uint256 day,
    uint256 hour, uint256 minute, uint256 second
) private pure returns (uint256) {
    return _daysFromDate(year, month, day) * 86400
         + hour * 3600 + minute * 60 + second;
}

function _daysFromDate(uint256 y, uint256 m, uint256 d) private pure returns (uint256) {
    // Proleptic Gregorian calendar → days since Unix epoch (1970-01-01)
    if (m <= 2) { y -= 1; m += 12; }
    uint256 A = y / 100;
    uint256 B = 2 - A + A / 4;
    return uint256(
        int256(36525 * (y + 4716) / 100)
      + int256(306001 * (m + 1) / 10000)
      + int256(d)
      + int256(B)
      - 1524
      - 2440588    // Julian Day 2440588 = 1970-01-01
    );
}

function _p2(bytes memory b, uint256 i) private pure returns (uint256 v) {
    v = (uint8(b[i]) - 48) * 10 + (uint8(b[i+1]) - 48);
}

function _p4(bytes memory b, uint256 i) private pure returns (uint256 v) {
    v = (uint8(b[i])-48)*1000 + (uint8(b[i+1])-48)*100
      + (uint8(b[i+2])-48)*10 + (uint8(b[i+3])-48);
}
```

### 测试侧时间戳转换（TypeScript）

```typescript
// block.timestamp (UTC) → Alipay gmtSuccess string (UTC+8)
function unixToAlipayDateString(unixTs: bigint): string {
    const utc8Offset = 8 * 3600;
    const d = new Date((Number(unixTs) + utc8Offset) * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} `
         + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
```

**验证**：
- `block.timestamp = 1000000000` (UTC)
- UTC+8 = 1000028800 → `new Date(1000028800000)` → "2001-09-09 09:46:40"
- 合约解析 → 反向 -28800 → 1000000000 ✓

---

## 六、AlipayPlatformVerifier 实现要点

### 关键存储

```solidity
// 防重放：Alipay orderId（字符串哈希）
mapping(bytes32 => bool) public usedAlipayOrderIds;

// 预计算 key hash
bytes32 private constant KEY_PAYEE_NAME   = keccak256("payeeName");
bytes32 private constant KEY_PAYEE_EMAIL  = keccak256("payeeLoginEmail");
bytes32 private constant KEY_PAY_AMOUNT   = keccak256("payAmount");
bytes32 private constant KEY_STATUS       = keccak256("status");
bytes32 private constant KEY_ORDER_ID     = keccak256("orderId");
bytes32 private constant KEY_GMT_SUCCESS  = keccak256("gmtSuccess");
```

### 金额精度（与 Wise 完全一致，可复用 1e33 公式）

```
fiatAmountX1000 = mulDiv(cryptoAmount, rate, 1e33)
// 示例: 100 USDT, rate = parseUnits("2.50", 18)
// = mulDiv(100e18, 2.5e18, 1e33) = 250000
// 证明中 "payAmount":"250.00" → _extractFiatAmountFromBytes → 250000 ✓
```

`_extractFiatAmountFromBytes` 已支持带引号的字符串值（`"250.00"` 中 `"` 自动跳过），无需修改。

### 校验逻辑

```
verifyAlipayFiatPayment():
  1. trustedPaymentServers[mbillexprod.alipay.com] ✓
  2. payeeName  == merchant.displayName (从 C2CAdmin 读)
  3. payeeLoginEmail == merchant.handle
  4. status == "succeed"
  5. payAmount (×1000 精度) == fiatAmountX1000
  6. orderId 未使用 → 标记已用（防重放）
  7. gmtSuccess → parseDatetimeToUnix → <= orderDeadline
```

### 新增 Custom Errors（加入 C2CTypes.sol）

```solidity
error MissingAlipayField();
error DuplicateAlipayOrderId();
error AlipayPaymentNotCompleted();
error AlipayTransferDateExpired();
```

---

## 七、部署顺序

```
1. deploy TLSNParserLib
2. deploy WisePlatformVerifier  (link TLSNParserLib)
3. deploy AlipayPlatformVerifier (link TLSNParserLib)
4. deploy TLSNVerifier (精简版，link TLSNParserLib)
5. deploy C2CAdmin(tlsnVerifier)
6. deploy C2CEscrow(c2cAdmin, tlsnVerifier)

# 授权
tlsnVerifier.setAuthorizedCaller(c2cAdmin)
tlsnVerifier.setAuthorizedCaller(c2cEscrow)
c2cAdmin.setAuthorizedCaller(c2cEscrow)

# 注册平台
tlsnVerifier.registerPlatformVerifier(PLATFORM_WISE, wisePlatformVerifier.address)
tlsnVerifier.registerPlatformVerifier(PLATFORM_ALIPAY, alipayPlatformVerifier.address)

# 注册可信服务器
tlsnVerifier.addTrustedPaymentServer("wise.com")
tlsnVerifier.addTrustedPaymentServer("mbillexprod.alipay.com")
```

---

## 八、合约大小预估

| 合约 | 当前 | 改造后 |
|------|------|--------|
| `TLSNVerifier` | ~18KB（估算） | ~9KB（移除平台逻辑 + parser） |
| `WisePlatformVerifier` | N/A | ~7KB |
| `AlipayPlatformVerifier` | N/A | ~6KB（含 datetime parser） |
| `TLSNParserLib` | N/A | ~3KB（linked library，不计入调用方） |

每新增平台：仅部署 ~6KB 验证器合约 + 调用 `registerPlatformVerifier()`，无需修改任何已部署合约。

---

## 九、测试文件规划

### `test/BuyerMerchantWise.ts`（重构）
- 保留所有现有 CRYPTO 产品攻防测试（payOrderByWise）
- **新增** FIAT 产品完整流程（商家卖 MYR，买家付 USDT）：
  - ✅ 正向：买家下单 → 托管 USDT → 商家提交 TLSN 确认 → 商家收到 USDT
  - ✅ 攻击：商家提交金额错误的证明
  - ✅ 攻击：商家提交状态错误的证明
  - ✅ 保留：商家超时不确认 → 买家获 2× 赔偿
  - ✅ 保留：商家无法提取被锁抵押品

> 注意：FIAT 产品的 `receiveCryptoWithPayment` 使用 `FIAT_RATE = 450n`
> （2 位小数制，rate 不含 1e18 缩放，公式 `mulDiv(amount, rate, 1e18)`）

### `test/BuyerMerchantAlipay.ts`（新建）
> ⚠️ 需要合约实现 `payOrderByAlipay` / `receiveCryptoWithAlipayPayment` / `verifyAlipayFiatPayment` 后才能运行

- CRYPTO 产品（商家卖 USDT，买家付 CNY 通过 Alipay）：
  - 正向 + 全套攻击向量（对标 Wise）
  - 新增 Alipay 专有：`gmtSuccess` 超时、`orderId` 重放
- FIAT 产品（商家卖 CNY，买家付 USDT，商家提交收款证明）：
  - 正向 + 攻防测试
  - 商家超时 → 2× 赔偿

---

## 十、汇率约定（双轨制）

| 场景 | rate 格式 | 金额公式 | 例 |
|------|-----------|----------|----|
| Wise / Alipay CRYPTO 产品 | `parseUnits("X", 18)` | `mulDiv(amount, rate, 1e33)` | rate=`parseUnits("2.50",18)`, 100 USDT → 250000 (=250.000 CNY) |
| 通用 FIAT 产品（`receiveCryptoWithPayment`）| 简单 2 位小数整数 | `mulDiv(amount, rate, 1e18)` | rate=`450n`, 200 USDT → 90000 (→ "900.00" MYR) |
