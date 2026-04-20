# 账号隐私保护改造 — 完整代码变更记录

## 背景与目的

### 问题
原始实现将商家和买家的支付账号（`displayName` 字符串 + `handle`/`email` 字符串）以明文存储在链上 calldata 中，任何人都可以通过区块链浏览器永久查阅。

### 解决方案
改为在链上只存储账号的 `keccak256` 哈希值，明文账号只在 Verifier 服务器的 TLS transcript 内存中进行比对，比对通过后 Verifier 用私钥签名 `orderBindingHash`，合约凭签名验证账号一致性。

### 为什么需要两个哈希（nameHash + idHash）

Alipay 和 Wise 的账号体系都包含两个维度：
- `displayName`：显示名（如"张三"），人类可读但**不唯一**
- `email / handle`：登录邮箱或用户名（如 `zhang@alipay.com`），**全局唯一标识符**

如果只用一个 `accountHash`，必须把两个字段拼接后再哈希，这样：
1. 拼接方式有歧义（顺序、分隔符）
2. 无法分别在 TLS transcript 中对两个字段的字节范围独立做 keccak256 校验

因此采用**两个独立哈希**：`nameHash = keccak256(displayName)`、`idHash = keccak256(email/handle)`，Verifier 分别校验，合约分别存储。

### orderBindingHash 的作用

`orderBindingHash` 是一个把订单参数与账号哈希绑定在一起的 `keccak256` 指纹，由 Verifier 服务器在校验账号后一并签名。合约收到 `TLSNProof` 后直接比对这个哈希，无需再次校验账号字符串，实现了：
- 账号不上链（隐私保护）
- 合约仍能密码学确认"账号匹配"这一事实（安全保障）

---

## 变更文件清单

| 文件 | 变更类型 | 核心改动 |
|------|----------|---------|
| `packages/contracts/contracts/C2CTypes.sol` | 修改 | struct 从单 `accountHash` 改为 `nameHash + idHash` |
| `packages/contracts/contracts/C2CAdmin.sol` | 修改 | `setMerchantPaymentInfo` 接受双哈希参数 |
| `packages/contracts/contracts/C2CEscrow.sol` | 修改 | `_computeOrderBindingHash` 追加 4 个账号哈希参数 |
| `packages/verifier/src/main.rs` | 修改 | 新增 `AccountCheck` 结构体和账号校验逻辑 |
| `packages/plugin-sdk/src/types.ts` | 修改 | `ProveOptions` 新增 `accountCheckFields` 字段 |
| `packages/extension/src/offscreen/ProveManager/index.ts` | 修改（Bug Fix）| `ClientMessage` 类型补全 `accountChecks`，修复 WebSocket 消息漏传 |
| `packages/extension/src/offscreen/SessionManager.ts` | 修改 | 构建 `accountCheckRanges`，私有范围过滤 |
| `packages/demo/src/utils/proofTransformer.ts` | 修改 | 5 个 sentinel 常量，4 个 inject 函数，`OrderBindingContext` 扩展 |
| `packages/demo/src/utils/c2cAbi.ts` | 修改 | ABI 类型同步双哈希结构体 |
| `packages/demo/src/utils/alipayC2cActions.ts` | 修改 | 所有 action 函数参数改为双哈希 |
| `packages/demo/plugins/alipay.plugin.ts` | 修改 | 5 个 sentinel 常量，`accountCheckFields` 配置 |
| `packages/demo/plugins/wise.plugin.ts` | 修改 | 6 个 sentinel 常量，`accountCheckFields` 配置 |
| `packages/demo/src/components/AlipayC2CDemoFlow.tsx` | 修改 | UI 改为双输入框，前端计算 keccak256 |
| `packages/demo/public/plugins/alipay.js` | 重新编译 | 包含新 sentinel 值 |
| `packages/demo/public/plugins/wise.js` | 重新编译 | 包含新 sentinel 值 |

---

## 详细变更说明

---

### 1. `packages/contracts/contracts/C2CTypes.sol`

**变更类型：** 修改 struct 字段

**原代码：**
```solidity
struct MerchantPaymentInfo {
    bytes32 accountHash;  // keccak256(normalize(account))
    bool isSet;
}

struct BuyerPaymentInfo {
    bytes32 accountHash;
    bool isSet;
}
```

**新代码：**
```solidity
struct MerchantPaymentInfo {
    bytes32 nameHash;  // keccak256(normalize(displayName))
    bytes32 idHash;    // keccak256(normalize(email / handle))
    bool isSet;
}

struct BuyerPaymentInfo {
    bytes32 nameHash;  // keccak256(normalize(displayName))
    bytes32 idHash;    // keccak256(normalize(email / handle))
    bool isSet;
}
```

**原因：** Alipay/Wise 账号有两个独立维度（显示名 + 唯一标识符），必须分别存储哈希才能在 Verifier 端对 TLS transcript 的不同字节范围进行独立校验。单一 `accountHash` 无法区分两个字段，也无法指定 transcript 中的对应字节范围。

---

### 2. `packages/contracts/contracts/C2CAdmin.sol`

**变更类型：** 修改函数签名、事件签名

**原代码（L213–L222）：**
```solidity
event MerchantPaymentInfoSet(address indexed merchant, bytes32 accountHash);

function setMerchantPaymentInfo(bytes32 _accountHash) external {
    if (!merchants[msg.sender].isActive) revert NotMerchant();
    if (_accountHash == bytes32(0)) revert EmptyAccount();
    merchantPaymentInfo[msg.sender] = MerchantPaymentInfo({
        accountHash: _accountHash,
        isSet: true
    });
    emit MerchantPaymentInfoSet(msg.sender, _accountHash);
}
```

**新代码（L213–L222）：**
```solidity
event MerchantPaymentInfoSet(address indexed merchant, bytes32 nameHash, bytes32 idHash);

function setMerchantPaymentInfo(bytes32 _nameHash, bytes32 _idHash) external {
    if (!merchants[msg.sender].isActive) revert NotMerchant();
    if (_nameHash == bytes32(0) || _idHash == bytes32(0)) revert EmptyAccount();
    merchantPaymentInfo[msg.sender] = MerchantPaymentInfo({
        nameHash: _nameHash,
        idHash:   _idHash,
        isSet:    true
    });
    emit MerchantPaymentInfoSet(msg.sender, _nameHash, _idHash);
}
```

**原因：** 对应 struct 的双哈希结构，同时校验两个哈希均非零（任意一个为零都不允许注册），防止商家只注册部分信息。

---

### 3. `packages/contracts/contracts/C2CEscrow.sol`

**变更类型：** 修改 3 处

#### 3a. `_computeOrderBindingHash` 新增 4 个账号哈希参数（L347–L377）

**原签名：**
```solidity
function _computeOrderBindingHash(
    address _merchant, address _buyer, uint256 _productId, uint256 _orderId,
    AssetType _assetType, uint256 _amount, uint256 _rate, uint256 _deadline
) internal view returns (bytes32)
```

**新签名：**
```solidity
function _computeOrderBindingHash(
    address _merchant, address _buyer, uint256 _productId, uint256 _orderId,
    AssetType _assetType, uint256 _amount, uint256 _rate, uint256 _deadline,
    bytes32 _merchantNameHash, bytes32 _merchantIdHash,
    bytes32 _payeeNameHash, bytes32 _payeeIdHash
) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(
        address(this), uint64(block.chainid),
        _merchant, _buyer, _productId, _orderId, uint8(_assetType),
        _amount, _rate, _deadline,
        _merchantNameHash, _merchantIdHash,
        _payeeNameHash, _payeeIdHash
    ));
}
```

**原因：** `orderBindingHash` 现在需要把账号哈希绑定进去，否则攻击者可以用相同订单参数但不同账号生成伪造的 `orderBindingHash`，绕过账号匹配。

#### 3b. `placeOrder()` FIAT 分支（L447–L454）

**原代码：**
```solidity
if (buyerInfo.accountHash == bytes32(0)) revert BuyerPaymentInfoRequired();
buyerOrderPaymentInfo[so.merchant][so.productID][oid] = BuyerPaymentInfo({
    accountHash: buyerInfo.accountHash,
    isSet: true
});
emit BuyerPaymentInfoSet(msg.sender, so.merchant, oid, buyerInfo.accountHash);
```

**新代码：**
```solidity
if (buyerInfo.nameHash == bytes32(0) || buyerInfo.idHash == bytes32(0)) revert BuyerPaymentInfoRequired();
buyerOrderPaymentInfo[so.merchant][so.productID][oid] = BuyerPaymentInfo({
    nameHash: buyerInfo.nameHash,
    idHash:   buyerInfo.idHash,
    isSet:    true
});
emit BuyerPaymentInfoSet(msg.sender, so.merchant, oid, buyerInfo.nameHash, buyerInfo.idHash);
```

**原因：** 买家下单时必须提供两个账号哈希（显示名 + 唯一ID），商家提交支付证明时 Verifier 会验证 TLS transcript 中的收款方账号与这两个哈希匹配。

#### 3c. `payOrderByPlatform()` CRYPTO 分支（L531–L536）

**原代码（含旧字段）：**
```solidity
bytes32 expectedBinding = _computeOrderBindingHash(
    _merchant, o.buyer, _productId, _orderId,
    AssetType.CRYPTO, o.amount, o.rate, o.deadline
);
```

**新代码：**
```solidity
MerchantPaymentInfo memory payInfo = adminContract.getMerchantPaymentInfo(_merchant);
bytes32 expectedBinding = _computeOrderBindingHash(
    _merchant, o.buyer, _productId, _orderId,
    AssetType.CRYPTO, o.amount, o.rate, o.deadline,
    payInfo.nameHash, payInfo.idHash,
    payInfo.nameHash, payInfo.idHash  // CRYPTO: payee = merchant
);
```

**原因：** CRYPTO 产品中，商家既是付款发起方（merchantNameHash/merchantIdHash）也是收款终点（payeeNameHash/payeeIdHash），两对哈希相同。

#### 3d. `receiveCryptoWithPlatformPayment()` FIAT 分支

**新代码（在原有基础上新增读取 merchantInfo 和 buyerInfo）：**
```solidity
MerchantPaymentInfo memory merchantInfo = adminContract.getMerchantPaymentInfo(_merchant);
BuyerPaymentInfo memory buyerInfo = buyerOrderPaymentInfo[_merchant][_productId][_orderId];
bytes32 expectedBinding = _computeOrderBindingHash(
    _merchant, o.buyer, _productId, _orderId,
    AssetType.FIAT, o.amount, o.rate, o.deadline,
    merchantInfo.nameHash, merchantInfo.idHash,
    buyerInfo.nameHash, buyerInfo.idHash  // FIAT: payee = buyer
);
```

**原因：** FIAT 产品中商家向买家付款，收款方是买家，因此 payeeNameHash/payeeIdHash 取自 buyerInfo（买家在 placeOrder 时提交的哈希）。

---

### 4. `packages/verifier/src/main.rs`

**变更类型：** 新增结构体、修改 `RevealConfig`、新增账号校验逻辑

#### 4a. 新增 `AccountCheck` 结构体（L139–L147）

```rust
// Account hash check: verifier compares keccak256 of transcript slice against expected hash
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct AccountCheck {
    pub(crate) direction: String,
    pub(crate) start: usize,
    pub(crate) end: usize,
    #[serde(rename = "expectedHash")]
    pub(crate) expected_hash: String,
}
```

**原因：** 定义账号校验的输入格式。`direction` 指明从 sent/recv transcript 取字节，`start/end` 是字节范围，`expectedHash` 是 `0x` 前缀的 keccak256 hex 字符串。

#### 4b. `RevealConfig` 新增 `account_checks` 字段（L150–L156）

```rust
struct RevealConfig {
    sent: Vec<RangeWithHandler>,
    recv: Vec<RangeWithHandler>,
    #[serde(rename = "accountChecks", default)]
    account_checks: Vec<AccountCheck>,
}
```

#### 4c. `ClientMessage::RevealConfig` 枚举变体新增字段

```rust
ClientMessage::RevealConfig { sent, recv, account_checks } => RevealConfig { sent, recv, account_checks },
```

#### 4d. `run_verifier_task()` 中插入账号校验循环（在 `verify_reveal_config` 之前）

```rust
// Account hash checks: verify keccak256 of transcript byte slices
for check in &reveal_config.account_checks {
    let data = match check.direction.as_str() {
        "sent" => &sent_data[check.start..check.end],
        "recv" => &recv_data[check.start..check.end],
        _ => { send_error(&mut socket, "Invalid direction").await; return; }
    };
    use sha3::{Digest, Keccak256};
    let mut hasher = Keccak256::new();
    hasher.update(data);
    let hash = format!("0x{}", hex::encode(hasher.finalize()));
    if hash != check.expected_hash {
        send_error(&mut socket, &format!(
            "Account hash mismatch: expected {}, got {}", check.expected_hash, hash
        )).await;
        return;
    }
}
```

**原因：** Verifier 是唯一能看到 TLS transcript 明文内容的实体。在这里对 transcript 指定字节范围做 keccak256，并与链上存储的哈希比对，就完成了"账号匹配"的链下密码学证明，而账号明文永远不离开 Verifier 内存。

**注意：** `AccountCheck` 最初只有 `#[derive(Deserialize)]`，但 `RevealConfig` 有 `Serialize`，导致编译错误 `E0277`。修复方法是在 `AccountCheck` 的 derive 中同时加入 `Serialize`。

---

### 5. `packages/plugin-sdk/src/types.ts`

**变更类型：** 新增可选字段

```typescript
// 新增到 ProveOptions 接口末尾
accountCheckFields?: Array<{
  handlerIndex: number;
  sessionDataKey: string;
}>;
```

**原因：** 让插件能声明"哪个 handler 对应的 transcript 字节范围需要做账号哈希校验，校验期望值从 sessionData 的哪个 key 取"。这是插件到 SessionManager 的配置通道。

---

### 6. `packages/extension/src/offscreen/ProveManager/index.ts`

**变更类型：** Bug Fix — 修复 `accountChecks` 从未被发送到 Verifier

**原 `ClientMessage` 类型（reveal_config 变体）：**
```typescript
type ClientMessage =
  | { type: 'reveal_config'; sent: ...; recv: ... }  // accountChecks 字段缺失
```

**新代码：**
```typescript
type ClientMessage =
  | {
      type: 'reveal_config';
      sent: Array<{ start: number; end: number; handler: any }>;
      recv: Array<{ start: number; end: number; handler: any }>;
      accountChecks?: Array<{ direction: string; start: number; end: number; expectedHash: string }>;
    };
```

**原 `sendRevealConfig` 消息构造（L~200）：**
```typescript
const message: ClientMessage = {
  type: 'reveal_config',
  sent: revealConfig.sent,
  recv: revealConfig.recv,
  // accountChecks 完全没有被包含进消息！
};
```

**新代码：**
```typescript
const message: ClientMessage = {
  type: 'reveal_config',
  sent: revealConfig.sent,
  recv: revealConfig.recv,
  ...(revealConfig.accountChecks?.length
    ? { accountChecks: revealConfig.accountChecks }
    : {}),
};
```

**原因：** 这是一个严重的静默 Bug。SessionManager 已经正确构建了 `accountCheckRanges`，但 ProveManager 在构造 WebSocket 消息时完全丢弃了这个字段，导致 Verifier 始终收不到账号校验指令，整个 accountCheck 功能处于"构建了但从未执行"的状态。

---

### 7. `packages/extension/src/offscreen/SessionManager.ts`

**变更类型：** 新增两段逻辑

#### 7a. 构建 `accountCheckRanges`（在 `processHandlers` 之后、`sendRevealConfig` 之前）

```typescript
const accountCheckFields = (proverOptions as any).accountCheckFields as
  | Array<{ handlerIndex: number; sessionDataKey: string }>
  | undefined;

const accountCheckRanges: Array<{
  direction: string; start: number; end: number; expectedHash: string;
}> = [];

if (accountCheckFields?.length) {
  const allRangesWithHandlers = [
    ...sentRangesWithHandlers.map((r) => ({ ...r, direction: 'SENT' as const })),
    ...recvRangesWithHandlers.map((r) => ({ ...r, direction: 'RECV' as const })),
  ];

  for (const field of accountCheckFields) {
    const targetHandler = proverOptions.handlers[field.handlerIndex];
    if (!targetHandler) continue;
    const expectedHash = (proverOptions.sessionData ?? {})[field.sessionDataKey];
    if (!expectedHash) continue;

    for (const rwh of allRangesWithHandlers) {
      const isSameHandler =
        rwh.handler === targetHandler ||
        (rwh.handler.type === targetHandler.type &&
         rwh.handler.part === targetHandler.part &&
         rwh.handler.action === targetHandler.action);
      if (isSameHandler) {
        accountCheckRanges.push({
          direction: rwh.direction.toLowerCase(),
          start: rwh.start,
          end: rwh.end,
          expectedHash,
        });
      }
    }
  }
}
```

**原因：** SessionManager 拿到 `processHandlers` 的输出后知道每个 handler 对应 transcript 的哪个字节范围。通过 `accountCheckFields` 配置，把"handler 索引 → sessionData key"的映射转换为"方向 + 字节范围 + 期望哈希"的具体校验指令，发给 Verifier。

#### 7b. 私有范围过滤（在 `enrichedResults` 构建之后、返回 `ProveResponse` 之前）

```typescript
// Filter out private account-check ranges from results and openings
const privateRangeKeys = new Set<string>(
  accountCheckRanges.map((r) => `${r.direction.toUpperCase()}:${r.start}:${r.end}`),
);

const filteredResults = privateRangeKeys.size > 0
  ? enrichedResults.filter((result) => {
      const key = `${result.type}:${result.start}:${result.end}`;
      return !privateRangeKeys.has(key);
    })
  : enrichedResults;

const filteredOpenings = privateRangeKeys.size > 0
  ? transcriptCommitOpenings.filter((opening: any) => {
      const dir = (opening.direction ?? '').toUpperCase();
      return !(opening.ranges ?? []).some((r: { start: number; end: number }) =>
        privateRangeKeys.has(`${dir}:${r.start}:${r.end}`)
      );
    })
  : transcriptCommitOpenings;
```

**原因：** 账号字段的 PEDERSEN 承诺（handler）必须排除在返回给插件的 `results` 和 `transcriptCommitOpenings` 之外，否则：
1. `results` 中的账号值会以明文出现在链上 `revealedItems`
2. `commitmentOpenings` 中的 blinder 会暴露，让任何人可以用原始哈希值反向验证账号

通过 key `DIRECTION:start:end` 精确匹配需要排除的范围，其余结果不受影响。

---

### 8. `packages/demo/src/utils/proofTransformer.ts`

**变更类型：** 新增常量、函数、扩展接口

#### 8a. Sentinel 常量（由 1 个扩展为 5 个）

```typescript
// 旧代码（已删除）：
// export const ORDER_BINDING_HASH_SENTINEL = '0x...0000';

// 新代码：
export const ZERO_HASH_32: Hex =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

export const ORDER_BINDING_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000001';

export const MERCHANT_NAME_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000002';

export const MERCHANT_ID_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000003';

export const PAYEE_NAME_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000004';

export const PAYEE_ID_HASH_SENTINEL =
    '0x0000000000000000000000000000000000000000000000000000000000000005';
```

**原因：** 每个 sentinel 末位数字唯一，保证 `String.replace()` 调用互不影响（`…0001` 替换不会命中 `…0002`）。旧的 `…0000` 是危险的，因为它与 `ZERO_HASH_32` 完全相同，一旦某个哈希值恰好为零会发生误替换。

#### 8b. 新增 4 个 inject 函数

```typescript
export function injectMerchantNameHash(pluginCode: string, hash: Hex): string
export function injectMerchantIdHash(pluginCode: string, hash: Hex): string
export function injectPayeeNameHash(pluginCode: string, hash: Hex): string
export function injectPayeeIdHash(pluginCode: string, hash: Hex): string
```

#### 8c. `OrderBindingContext` 接口扩展

```typescript
// 旧代码（已删除）：
// merchantAccountHash: Hex;
// payeeAccountHash: Hex;

// 新代码：
merchantNameHash: Hex;  // keccak256(normalize(displayName)) — merchant payer
merchantIdHash: Hex;    // keccak256(normalize(email/handle)) — merchant payer
payeeNameHash: Hex;     // CRYPTO: merchant; FIAT: buyer
payeeIdHash: Hex;       // CRYPTO: merchant; FIAT: buyer
```

#### 8d. `computeOrderBindingHash` 扩展至 14 元素

```typescript
return keccak256(encodePacked(
    ['address', 'uint64', 'address', 'address',
     'uint256', 'uint256', 'uint8', 'uint256', 'uint256', 'uint256',
     'bytes32', 'bytes32', 'bytes32', 'bytes32'],
    [
        ctx.escrowAddress, BigInt(ctx.chainId), ctx.merchant, ctx.buyer,
        ctx.productId, ctx.orderId, ctx.assetType, ctx.amount, ctx.rate, ctx.deadline,
        ctx.merchantNameHash, ctx.merchantIdHash,
        ctx.payeeNameHash, ctx.payeeIdHash,
    ],
));
```

**原因：** 前端计算的 `orderBindingHash` 必须与合约 `_computeOrderBindingHash()` 的结果完全一致，包括类型和顺序，否则合约校验必然失败。

---

### 9. `packages/demo/src/utils/c2cAbi.ts`

**变更类型：** 修改 ABI 类型定义

#### 9a. `buyerPaymentInfoComponents`

```typescript
// 旧代码：
const buyerPaymentInfoComponents = [
  { name: 'accountHash', type: 'bytes32' as const },
  { name: 'isSet', type: 'bool' as const },
] as const;

// 新代码：
const buyerPaymentInfoComponents = [
  { name: 'nameHash', type: 'bytes32' as const },
  { name: 'idHash',   type: 'bytes32' as const },
  { name: 'isSet',    type: 'bool'    as const },
] as const;
```

#### 9b. `C2C_ADMIN_ABI` — `setMerchantPaymentInfo` inputs

```typescript
// 旧代码：
inputs: [{ name: '_accountHash', type: 'bytes32' as const }]

// 新代码：
inputs: [
  { name: '_nameHash', type: 'bytes32' as const },
  { name: '_idHash',   type: 'bytes32' as const },
]
```

#### 9c. `C2C_ADMIN_ABI` — `MerchantPaymentInfoSet` event（新增）

```typescript
{
  type: 'event' as const,
  name: 'MerchantPaymentInfoSet',
  inputs: [
    { name: 'merchant',  type: 'address' as const, indexed: true  },
    { name: 'nameHash',  type: 'bytes32' as const, indexed: false },
    { name: 'idHash',    type: 'bytes32' as const, indexed: false },
  ],
}
```

#### 9d. `C2C_ESCROW_ABI` — 新增 `getBuyerPaymentInfo` view 函数

```typescript
{
  type: 'function' as const,
  name: 'getBuyerPaymentInfo',
  inputs: [
    { name: '_merchant',  type: 'address' as const },
    { name: '_productId', type: 'uint256' as const },
    { name: '_orderId',   type: 'uint256' as const },
  ],
  outputs: [{ type: 'tuple' as const, components: buyerPaymentInfoComponents }],
  stateMutability: 'view' as const,
}
```

**原因：** `getBuyerPaymentInfo` 是新增的 explicit getter（合约侧对应新增），避免依赖 Solidity 自动生成的 public mapping getter（ABI 表达方式有歧义）。前端 `makeCryptoToFiatBindingContext` 需要读取买家账号哈希来构造 `orderBindingHash`。

---

### 10. `packages/demo/src/utils/alipayC2cActions.ts`

**变更类型：** 修改多个函数签名和实现

#### 10a. `getAlipayMerchantInfo` 返回类型

```typescript
// 旧代码：{ accountHash: `0x${string}`; isSet: boolean }
// 新代码：
{ nameHash: `0x${string}`; idHash: `0x${string}`; isSet: boolean }
```

#### 10b. `setupFiatToCrypto` 和 `setupCryptoToFiat` 参数

```typescript
// 旧代码：setupFiatToCrypto(accountHash: `0x${string}`)
// 新代码：
export async function setupFiatToCrypto(
  nameHash: `0x${string}`,
  idHash: `0x${string}`,
): Promise<{ productId: bigint; txHash: Hex }>
```

#### 10c. `EMPTY_BUYER_INFO`

```typescript
// 旧代码：{ accountHash: ZERO_HASH_32, isSet: false }
// 新代码：
const EMPTY_BUYER_INFO = {
  nameHash: ZERO_HASH_32 as `0x${string}`,
  idHash:   ZERO_HASH_32 as `0x${string}`,
  isSet: false
};
```

#### 10d. `placeCryptoToFiatOrder` 参数

```typescript
// 旧代码：placeCryptoToFiatOrder(productId, buyerAccountHash)
// 新代码：
export async function placeCryptoToFiatOrder(
  productId: bigint,
  buyerNameHash: `0x${string}`,
  buyerIdHash: `0x${string}`,
): Promise<{ orderId: bigint; deadline: bigint; txHash: Hex }>
```

#### 10e. `makeFiatToCryptoBindingContext`（CRYPTO 产品）

```typescript
return {
  // ...
  merchantNameHash: merchantInfo.nameHash,
  merchantIdHash:   merchantInfo.idHash,
  payeeNameHash:    merchantInfo.nameHash, // CRYPTO: payee = merchant
  payeeIdHash:      merchantInfo.idHash,
};
```

#### 10f. `makeCryptoToFiatBindingContext`（FIAT 产品）

```typescript
// 同时读取 merchantInfo 和 buyerInfo（并行 Promise.all）
return {
  // ...
  merchantNameHash: merchantInfo.nameHash,
  merchantIdHash:   merchantInfo.idHash,
  payeeNameHash:    buyerInfo.nameHash, // FIAT: payee = buyer
  payeeIdHash:      buyerInfo.idHash,
};
```

#### 10g. `_runAlipayPlugin` 中 inject 调用链

```typescript
// 旧代码：2 次 inject
// 新代码：4 次 inject
let code = pluginCode;
code = injectOrderBindingHash(code, orderBindingHash);
code = injectMerchantNameHash(code, ctx.merchantNameHash);
code = injectMerchantIdHash(code, ctx.merchantIdHash);
code = injectPayeeNameHash(code, ctx.payeeNameHash);
code = injectPayeeIdHash(code, ctx.payeeIdHash);
```

**原因：** CRYPTO/FIAT 产品的 payee 指向不同对象（商家/买家），必须在运行时动态注入正确的哈希值，不能硬编码在插件 JS 里。

---

### 11. `packages/demo/plugins/alipay.plugin.ts`

**变更类型：** 修改 sentinel 常量、sessionData、新增 accountCheckFields

#### 11a. Sentinel 常量（1 个扩展为 5 个）

```typescript
// 旧代码（已删除）：
// const ORDER_BINDING_HASH = '0x...0000';
// const MERCHANT_ACCOUNT_HASH = '0x...0001';
// const PAYEE_ACCOUNT_HASH = '0x...0002';

// 新代码：
const ORDER_BINDING_HASH = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MERCHANT_NAME_HASH = '0x0000000000000000000000000000000000000000000000000000000000000002';
const MERCHANT_ID_HASH   = '0x0000000000000000000000000000000000000000000000000000000000000003';
const PAYEE_NAME_HASH    = '0x0000000000000000000000000000000000000000000000000000000000000004';
const PAYEE_ID_HASH      = '0x0000000000000000000000000000000000000000000000000000000000000005';
```

#### 11b. `sessionData` 扩展为 5 个 key

```typescript
sessionData: {
    __tlsn_order_binding_hash: ORDER_BINDING_HASH,
    __tlsn_merchant_name_hash: MERCHANT_NAME_HASH,
    __tlsn_merchant_id_hash:   MERCHANT_ID_HASH,
    __tlsn_payee_name_hash:    PAYEE_NAME_HASH,
    __tlsn_payee_id_hash:      PAYEE_ID_HASH,
},
```

#### 11c. 新增 `accountCheckFields`

```typescript
accountCheckFields: [
    // handlers[4] = payeeName regex → verify against payeeNameHash
    { handlerIndex: 4, sessionDataKey: '__tlsn_payee_name_hash' },
    // handlers[5] = payeeLoginEmail regex → verify against payeeIdHash
    { handlerIndex: 5, sessionDataKey: '__tlsn_payee_id_hash' },
],
```

**原因：** Alipay transcript 的 JSON 响应中，`payeeName` 对应 handlers[4]（regex `"payeeName"\s*:\s*"[^"]*"`），`payeeLoginEmail` 对应 handlers[5]。这两个字段就是收款方的显示名和登录邮箱，Verifier 需要对这两段字节分别做 keccak256 并与 sessionData 中的哈希比对。

---

### 12. `packages/demo/plugins/wise.plugin.ts`

**变更类型：** 修改 sentinel 常量（6 个），新增 accountCheckFields

#### 12a. Sentinel 常量（6 个，比 Alipay 多 1 个 TRANSFER 专用）

```typescript
const CONTACTS_ORDER_BINDING_HASH = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MERCHANT_NAME_HASH          = '0x0000000000000000000000000000000000000000000000000000000000000002';
const MERCHANT_ID_HASH            = '0x0000000000000000000000000000000000000000000000000000000000000003';
const PAYEE_NAME_HASH             = '0x0000000000000000000000000000000000000000000000000000000000000004';
const PAYEE_ID_HASH               = '0x0000000000000000000000000000000000000000000000000000000000000005';
const TRANSFER_ORDER_BINDING_HASH = '0x0000000000000000000000000000000000000000000000000000000000000006';
```

**注意：** TRANSFER 的 sentinel 编号是 `…0006`，不是 `…0004`。旧版 v3 计划中是 `…0004`，但 `…0004` 现在被 `PAYEE_NAME_HASH` 占用，必须重新编号为 `…0006` 避免冲突。

#### 12b. contacts prove() sessionData 和 accountCheckFields

```typescript
// contacts prove() 中：
sessionData: {
    __tlsn_order_binding_hash: CONTACTS_ORDER_BINDING_HASH,
    __tlsn_merchant_name_hash: MERCHANT_NAME_HASH,
    __tlsn_merchant_id_hash:   MERCHANT_ID_HASH,
    __tlsn_payee_name_hash:    PAYEE_NAME_HASH,
    __tlsn_payee_id_hash:      PAYEE_ID_HASH,
},
accountCheckFields: [
    // CONTACTS_HANDLERS[2] = title regex  → payeeNameHash
    { handlerIndex: 2, sessionDataKey: '__tlsn_payee_name_hash' },
    // CONTACTS_HANDLERS[3] = subtitle regex → payeeIdHash
    { handlerIndex: 3, sessionDataKey: '__tlsn_payee_id_hash' },
],
```

#### 12c. transfer prove() sessionData 改用 TRANSFER sentinel

```typescript
// transfer prove() 中：
sessionData: {
    __tlsn_order_binding_hash: TRANSFER_ORDER_BINDING_HASH,
},
```

**原因：** Wise 有两类 proof：contacts（包含收款人信息）和 transfer（包含转账金额和状态）。contacts proof 需要验证账号，transfer proof 只需绑定订单哈希。两个 `orderBindingHash` sentinel 不同，前端 inject 时可以精确替换各自的值。

#### 12d. `CONTACTS_HANDLERS[2]` 和 `[3]` 的 action 已经是 `PEDERSEN`

（这是正确的现状，title 和 subtitle 字段不能 REVEAL 明文，只能 PEDERSEN 承诺后由 Verifier 在内存中比对。）

---

### 13. `packages/demo/src/components/AlipayC2CDemoFlow.tsx`

**变更类型：** 修改 state 变量、输入表单、业务逻辑

#### 13a. FiatToCryptoFlow — state 和 setup

```typescript
// 旧代码：
const [accountInput, setAccountInput] = useState('');
const [merchantInfo, setMerchantInfo] = useState<{ accountHash: `0x${string}`; isSet: boolean } | null>(null);

// 新代码：
const [displayName, setDisplayName] = useState('');
const [accountId, setAccountId] = useState('');
const [merchantInfo, setMerchantInfo] = useState<{ nameHash: `0x${string}`; idHash: `0x${string}`; isSet: boolean } | null>(null);
```

#### 13b. FiatToCryptoFlow — `handleSetup` 计算双哈希

```typescript
// 旧代码：
const accountHash = keccak256(toBytes(accountInput.trim().toLowerCase()));
await setupFiatToCrypto(accountHash);

// 新代码：
const nameHash = keccak256(toBytes(displayName.trim().toLowerCase())) as `0x${string}`;
const idHash   = keccak256(toBytes(accountId.trim().toLowerCase()))   as `0x${string}`;
await setupFiatToCrypto(nameHash, idHash);
```

#### 13c. FiatToCryptoFlow — Step 1 UI 改为双输入框

```tsx
<input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
    placeholder="支付宝显示名（如：张三）" />
<input value={accountId} onChange={(e) => setAccountId(e.target.value)}
    placeholder="支付宝登录邮箱（如：zhang@example.com）" />
```

#### 13d. CryptoToFiatFlow — 买家账号 state

```typescript
// 旧代码：
const [buyerAccountInput, setBuyerAccountInput] = useState('');

// 新代码：
const [buyerDisplayName, setBuyerDisplayName] = useState('');
const [buyerAccountId, setBuyerAccountId] = useState('');
```

#### 13e. CryptoToFiatFlow — `handlePlaceOrder` 计算双哈希

```typescript
// 旧代码：
const buyerAccountHash = keccak256(toBytes(buyerAccountInput.trim().toLowerCase()));
await placeCryptoToFiatOrder(productId, buyerAccountHash);

// 新代码：
const buyerNameHash = keccak256(toBytes(buyerDisplayName.trim().toLowerCase())) as `0x${string}`;
const buyerIdHash   = keccak256(toBytes(buyerAccountId.trim().toLowerCase()))   as `0x${string}`;
await placeCryptoToFiatOrder(productId, buyerNameHash, buyerIdHash);
```

#### 13f. CryptoToFiatFlow — Step 1 商家 UI 双输入框（与 FiatToCrypto 相同结构）

#### 13g. CryptoToFiatFlow — Step 2 买家 UI 改为双输入框

```tsx
// 旧代码：
<input value={buyerAccountInput} onChange={(e) => setBuyerAccountInput(e.target.value)}
    placeholder="买家支付宝账号（如：buyer@example.com）"
    disabled={loading || step !== 1} />
<Btn disabled={loading || step !== 1 || !buyerAccountInput.trim()} ... />

// 新代码：
<input value={buyerDisplayName} onChange={(e) => setBuyerDisplayName(e.target.value)}
    placeholder="买家支付宝显示名（如：李四）"
    disabled={loading || step !== 1} />
<input value={buyerAccountId} onChange={(e) => setBuyerAccountId(e.target.value)}
    placeholder="买家支付宝登录邮箱（如：buyer@example.com）"
    disabled={loading || step !== 1} />
<Btn disabled={loading || step !== 1 || !buyerDisplayName.trim() || !buyerAccountId.trim()} ... />
```

**原因：** UI 与后端逻辑保持一致。用户输入明文账号，前端在本地用 `keccak256` 计算哈希后传给合约，明文不离开用户浏览器。

---

## 系统整体数据流（改造后）

```
用户输入 displayName + email
  ↓ 前端 keccak256（浏览器内，明文不传输）
  ↓
nameHash + idHash → 链上 setMerchantPaymentInfo / placeOrder
  ↓
前端读取链上 nameHash/idHash → 构造 OrderBindingContext
  ↓ computeOrderBindingHash(…, merchantNameHash, merchantIdHash, payeeNameHash, payeeIdHash)
  ↓
orderBindingHash 注入插件代码（sentinel replace）
  + merchantNameHash/merchantIdHash/payeeNameHash/payeeIdHash 也注入（4 次 replace）
  ↓
插件执行 prove()，sessionData 携带 5 个 0x 哈希
accountCheckFields 指定 transcript 哪两段需要校验账号
  ↓
SessionManager 构建 accountCheckRanges，发给 Verifier
  ↓
Verifier：
  1. 对 transcript[start..end] 计算 keccak256
  2. 与 expectedHash 比对
  3. 通过 → 对包含 orderBindingHash 的消息用私钥签名
  ↓
插件收到签名（verifierSignature.orderBindingHash = 我们注入的哈希值）
  ↓
合约 payOrderByPlatform / receiveCryptoWithPlatformPayment：
  1. 重新计算 expectedBinding（从链上 nameHash/idHash 计算）
  2. 比对 proof.orderBindingHash === expectedBinding
  3. 验证 verifierSignature（Verifier 私钥签名）
  4. 通过 → 释放资金
```

---

## 安全保证

1. **账号不上链**：链上只有 `keccak256(account)`，即使全量扫描 calldata 也无法还原账号明文
2. **双维度约束**：displayName 和 email/handle 分别哈希，两者都必须通过才能完成交易
3. **CRYPTO vs FIAT 收款方区分**：`payeeNameHash/payeeIdHash` 根据产品类型指向不同的账号（商家或买家），防止商家在 FIAT 产品中向自己转账套现
4. **orderBindingHash 绑定**：账号哈希是 `orderBindingHash` 的一部分，Verifier 签名等同于同时认证了"账号匹配"和"订单参数正确"两件事
5. **私有范围过滤**：账号字段的 PEDERSEN 承诺和 opening 不返回给链上，账号字段不出现在 `revealedItems` 或公开的 commitment openings 中
