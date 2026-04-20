# C2C 合约测试用例重建（基于当前最新实现）

- 生成日期：2026-04-18
- 代码基线：`packages/contracts/contracts/*.sol`（以源码行为为准）
- 目标合约：`C2CEscrow`、`C2CAdmin`、`WisePlatformVerifier`、`AlipayPlatformVerifier`、`TLSNVerifier`
- 测试文件：`test/C2CAdmin.ts`、`test/C2CEscrow.ts`、`test/WisePlatform.ts`、`test/AlipayPlatform.ts`、`test/Integration.ts`、`test/BusinessHours.ts`、`test/Cap.ts`、`test/Rate.ts`、`test/TLSNVerifier.ts`

## 0. 当前架构基线（用于定义预期）

1. `placeOrder` 已改为无签名下单：`placeOrder(merchant, productId, assetType, amount, buyerInfo)`。
2. CRYPTO 产品：下单后状态为 `PENDING`，买家后续提交平台支付证明。
3. FIAT 产品：下单时买家立即锁币，状态直接 `WAITING`，商家后续提交平台支付证明。
4. 下单前必须满足：产品激活、商家营业中、链上汇率已发布且未过期、金额不超 `maxOrderAmount`。
5. `orderBindingHash` 已包含 `rateVersion` + 商家/收款方哈希身份字段。
6. 平台验证统一走 `TLSNVerifier.verifyAndDelegate`，再委托到 Wise / Alipay 平台验证器。
7. 单笔限额 `maxOrderAmount` 默认 1000 USDT，合约地址 1:1 USDT，非累计（D-3）。
8. 营业时间通过 `activeDays` bitmask（bit0=周一…bit6=周日）+ `openSecond`/`closeSecond` UTC 秒控制；支持跨午夜。
9. `manualOverride`：0=自动时间表，1=强制开放，2=强制关闭。

---

## 1. C2CAdmin 测试用例（test/C2CAdmin.ts）

### 1.1 正常业务流程（FLOW）

| ID | 场景 | 关键动作 | 预期 |
|---|---|---|---|
| ADM-FLOW-01 | 两步管理员移交 | `proposeAdmin` → `acceptAdmin` | admin 成功切换 |
| ADM-FLOW-02 | 新增支持币种 | `addCryptoInfo` | `SupportCryptoAdded` 事件、计数 +1 |
| ADM-FLOW-03 | 新增支持法币 | `addFiatInfo` | `SupportFiatAdded` 事件、计数 +1 |
| ADM-FLOW-04 | 资产上下架 | `deactivateAsset` → `activateAsset` | 状态切换正确 |
| ADM-FLOW-05 | 管理员注册商家 | `registerMerchantByAdmin` | 商家激活且 KYB=true |
| ADM-FLOW-06 | 商家注册（走 KYB proof） | `registerMerchant(proof)` | `MerchantRegistered` |
| ADM-FLOW-07 | 商家设置支付哈希信息 | `setMerchantPaymentInfo` | `isSet=true`，哈希落链 |
| ADM-FLOW-08 | 商家设置法币账户 | `setMerchantFiatAccount` | 账户字符串保存成功 |
| ADM-FLOW-09 | 首次发布汇率 | `publishRate` | `version=1`、`publishedAt>0` |
| ADM-FLOW-10 | 二次发布汇率 | 再次 `publishRate` | `version` 单调递增 |
| ADM-FLOW-11 | 设置营业时间 | `setBusinessHours` | open/close/daymask 正确 |
| ADM-FLOW-12 | 强制营业/打烊/恢复自动 | `openNow`/`closeNow`/`clearManualOverride` | `isMerchantOpen` 与 override 一致 |
| ADM-FLOW-13 | 设置单笔限额 | `setMaxOrderAmount` | 新限额立即生效 |
| ADM-FLOW-14 | 授权调用方 | `setAuthorizedCaller` | 授权映射更新正确 |
| ADM-FLOW-15 | 受权合约递增产品计数 | `incrementSellCount` | CRYPTO/FIAT 计数各自独立 |

### 1.2 错误拦截（ERR）

| ID | 场景 | 关键动作 | 预期错误 |
|---|---|---|---|
| ADM-ERR-01 | 非 admin 提议新管理员 | 非 admin 调 `proposeAdmin` | `OnlyAdmin` |
| ADM-ERR-02 | 非 pendingAdmin 接受管理员 | 非 pending 调 `acceptAdmin` | `NotPendingAdmin` |
| ADM-ERR-03 | 提议零地址 admin | `proposeAdmin(0x0)` | `ZeroAddress` |
| ADM-ERR-04 | 非 admin 新增 crypto | 非 admin 调 `addCryptoInfo` | `OnlyAdmin` |
| ADM-ERR-05 | 非 admin 新增 fiat | 非 admin 调 `addFiatInfo` | `OnlyAdmin` |
| ADM-ERR-06 | 激活已激活资产 | 重复 `activateAsset` | `AlreadyActive` |
| ADM-ERR-07 | 下架已下架资产 | 重复 `deactivateAsset` | `AlreadyInactive` |
| ADM-ERR-08 | 资产 ID 越界 | `activateAsset/deactivateAsset` 越界 | `WrongId` |
| ADM-ERR-09 | 非商家发布汇率 | 随机地址 `publishRate` | `NotMerchant` |
| ADM-ERR-10 | 发布过期汇率 | `expiresAt <= now` | `RateExpired` |
| ADM-ERR-11 | 非商家设置营业时间 | 随机地址 `setBusinessHours` | `NotMerchant` |
| ADM-ERR-12 | 非商家 openNow/closeNow | 随机地址调用 | `NotMerchant` |
| ADM-ERR-13 | 非 admin 设置限额 | 非 admin `setMaxOrderAmount` | `OnlyAdmin` |
| ADM-ERR-14 | 非授权调用递增计数 | 随机地址 `incrementSellCount` | revert("not authorized") |
| ADM-ERR-15 | 非商家设置法币账户 | 随机地址 `setMerchantFiatAccount` | `NotMerchant` |
| ADM-ERR-16 | 空法币账户 | `setMerchantFiatAccount("")` | `EmptyAccount` |
| ADM-ERR-17 | 非商家设置支付哈希 | 随机地址 `setMerchantPaymentInfo` | `NotMerchant` |
| ADM-ERR-18 | 支付哈希为空 | 任一 hash = 0 | `EmptyAccount` |
| ADM-ERR-19 | 重复商家注册 | 已注册地址再注册 | `AlreadyRegistered` |
| ADM-ERR-20 | KYB proof 链 ID 错误 | `registerMerchant(proof)` | `WrongChainId` |
| ADM-ERR-21 | KYB proof session 重放 | 重用同 sessionId | `SessionAlreadyUsed` |
| ADM-ERR-22 | KYB proof 伪造签名 | verifier 非信任签名 | `UntrustedVerifier` |
| ADM-ERR-23 | KYB server 未信任 | serverName 非白名单 | `NotTrustedKYBServer` |
| ADM-ERR-24 | KYB 状态非 verified | revealed value 非 verified | `KYCNotVerified` |

### 1.3 攻击防御（ATT）

| ID | 攻击向量 | 关键动作 | 预期防御 |
|---|---|---|---|
| ADM-ATT-01 | 管理员劫持尝试 | 非 pending 抢先 `acceptAdmin` | `NotPendingAdmin` |
| ADM-ATT-02 | 伪造 KYB 签名 | 使用攻击者私钥签 proof | `UntrustedVerifier` |
| ADM-ATT-03 | KYB 会话重放 | 复用旧 `sessionId` | `SessionAlreadyUsed` |
| ADM-ATT-04 | commitments 篡改 | 改 `commitmentsHash` | `CommitmentsHashMismatch` |
| ADM-ATT-05 | opening 篡改 | 改 `blinderHex` | `CommitmentOpeningMismatch` |
| ADM-ATT-06 | 越权授权调用方 | 非 admin 调 `setAuthorizedCaller` | `OnlyAdmin` |
| ADM-ATT-07 | 越权调高/调低限额 | 非 admin 调 `setMaxOrderAmount` | `OnlyAdmin` |
| ADM-ATT-08 | 伪造商家身份发布汇率 | 未注册地址 publish | `NotMerchant` |

### 1.4 流程篡改（TAMPER）

| ID | 篡改场景 | 关键动作 | 预期 |
|---|---|---|---|
| ADM-TAMPER-01 | 商家频繁改汇率 | 连续 `publishRate` | 版本严格递增，不回退 |
| ADM-TAMPER-02 | 商家把 `expiresAt` 设很短 | 先可下单，后快速过期 | 过期后新单 `RateExpired` |
| ADM-TAMPER-03 | 商家开门后立即关门 | `openNow` → `closeNow` | 最新 override 生效 |
| ADM-TAMPER-04 | 商家关门后清除覆盖 | `closeNow` → `clearManualOverride` | 回到时间表判定 |
| ADM-TAMPER-05 | 修改营业时间不应抹掉 override | openNow 后 setBusinessHours | `manualOverride` 保持不变 |
| ADM-TAMPER-06 | 产品维度隔离检查 | product0 open, product1 close | `isMerchantOpen` 按产品隔离 |
| ADM-TAMPER-07 | 管理员中途改限额 | 先下单后改低上限 | 仅影响新单，不影响已下单订单流转 |
| ADM-TAMPER-08 | ⚠️ 异常 assetType 发布汇率 | `_assetType=2` publish | 当前实现会落库，需补业务守卫（风险用例） |
| ADM-TAMPER-09 | ⚠️ 零汇率发布 | `rate=0` publish | 当前实现允许，后续可能导致 0 金额支付校验（风险用例） |

---

## 2. C2CEscrow 测试用例（test/C2CEscrow.ts）

### 2.1 正常业务流程（FLOW）

| ID | 场景 | 关键动作 | 预期 |
|---|---|---|---|
| ESC-FLOW-01 | 商家上架 CRYPTO 产品 | `listCryptoProduct` | 产品记录正确、抵押入池 |
| ESC-FLOW-02 | 商家上架 FIAT 产品 | `listFiatProduct` | 产品记录正确、抵押入池 |
| ESC-FLOW-03 | CRYPTO 下单成功 | `placeOrder(...CRYPTO...)` | `PENDING`，`pendingAmount` 增 |
| ESC-FLOW-04 | FIAT 下单成功 | `placeOrder(...FIAT..., buyerInfo)` | 直接 `WAITING`，买家锁币 |
| ESC-FLOW-05 | CRYPTO 完整支付成功 | `payOrderByPlatform` | 订单 `COMPLETED`，买家得币 |
| ESC-FLOW-06 | FIAT 完整支付成功 | `receiveCryptoWithPlatformPayment` | 商家得币，`buyerInfo` 删除 |
| ESC-FLOW-07 | CRYPTO 买家取消 PENDING | `cancelOrder` | `CANCELLED/EXPIRED`，释放活跃标记 |
| ESC-FLOW-08 | FIAT 超时索赔成功 | `claimRefundAfterTimeout` | 买家获 2x，`CompensationPaid` |
| ESC-FLOW-09 | cleanup 自动处理过期单 | `cleanupProductExpired` / 新交易触发 | 过期单状态正确收敛 |
| ESC-FLOW-10 | 产品启停切换 | `inactiveProduct` 后尝试下单，再 `activeProduct` 后下单 | 下架后触发 `ProductInactive`，重新上架后可下单 |
| ESC-FLOW-11 | 商家补充抵押 | `addAmount` | `collateralAmount` 增加 |
| ESC-FLOW-12 | 商家分批提取可用抵押 | 多次 `takeAmount`（不同金额） | 不同可用金额均可成功提取（总和不超过 `collateral - pending`） |
| ESC-FLOW-13 | 商家提取超出可用抵押 | `takeAmount > collateral - pending` | `InsufficientPendingLocked` |
| ESC-FLOW-14 | 读取订单信息 | `getOrder` | buyer/amount/rate/status/rateVersion 正确 |
| ESC-FLOW-15 | 读取 buyerPaymentInfo | `getBuyerPaymentInfo` | FIAT 在途单为 isSet=true，结束后 false |
| ESC-FLOW-16 | 读取平台 ID | `getProductPlatformId` | 与上架时 `platformId` 一致 |

### 2.2 错误拦截（ERR）

| ID | 场景 | 关键动作 | 预期错误 |
|---|---|---|---|
| ESC-ERR-01 | 非商家上架产品 | 随机地址 `listCryptoProduct/listFiatProduct` | `NotMerchant` |
| ESC-ERR-02 | 上架时 cryptoId 越界 | `list*Product` 越界 ID | `WrongId` |
| ESC-ERR-03 | 上架时 fiatId 越界 | `list*Product` 越界 ID | `WrongId` |
| ESC-ERR-04 | 激活已激活产品 | `activeProduct` 重复 | `AlreadyActive` |
| ESC-ERR-05 | 下架已下架产品 | `inactiveProduct` 重复 | `AlreadyInactive` |
| ESC-ERR-06 | 提取超可用抵押 | `takeAmount > available` | `InsufficientPendingLocked` |
| ESC-ERR-07 | 产品关闭时下单 | product inactive | `ProductInactive` |
| ESC-ERR-08 | 非营业时间下单 | `isMerchantOpen=false` | `MerchantClosed` |
| ESC-ERR-09 | 汇率未发布下单 | 无 `publishRate` | `RateNotPublished` |
| ESC-ERR-10 | 汇率过期下单 | rate 已过期 | `RateExpired` |
| ESC-ERR-11 | 金额为 0 下单 | `amount=0` | `ZeroAmount` |
| ESC-ERR-12 | 超过单笔限额下单 | `amount > maxOrderAmount` | `ExceedsUsdCap` |
| ESC-ERR-13 | 超抵押下单 | `amount > available` | `InsufficientAvailable` |
| ESC-ERR-14 | 同买家同产品重复活跃下单 | 连续 placeOrder | `AlreadyHasActiveOrder` |
| ESC-ERR-15 | FIAT 不传 buyerInfo | buyerInfo hash 为 0 | `BuyerPaymentInfoRequired` |
| ESC-ERR-16 | WAITING 订单调用 cancel | FIAT 下单后 `cancelOrder` | `NotPending` |
| ESC-ERR-17 | 非买家取消订单 | 第三方 `cancelOrder` | `NotAllowed` |
| ESC-ERR-18 | 订单过期后提交 proof | `payOrderByPlatform/receive...` | `OutOfDeadline` |
| ESC-ERR-19 | FIAT 在 PENDING 场景提交收款证明 | `receive...` 非 WAITING | `NotWaiting` |
| ESC-ERR-20 | claimRefund 未超时 | deadline 未到 | `NotYetExpired` |
| ESC-ERR-21 | cancel 不存在订单 | 错 orderId | `OrderNotFound` |
| ESC-ERR-22 | pay proof OBH 错误 | 伪造 `orderBindingHash` | `OrderBindingHashMismatch` |
| ESC-ERR-23 | 平台未注册 | 调用平台验证前未注册 | `PlatformNotRegistered` |
| ESC-ERR-24 | payment server 不可信 | proof.serverName 非白名单 | `NotTrustedPaymentServer` |
| ESC-ERR-25 | proof chainId 错误 | `chainId != block.chainid` | `WrongChainId` |
| ESC-ERR-26 | sessionId 重放 | 重复 proof | `SessionAlreadyUsed` |
| ESC-ERR-27 | verifier 签名不可信 | 伪造签名 | `UntrustedVerifier` |
| ESC-ERR-28 | commitmentsHash 篡改 | proof hash 不一致 | `CommitmentsHashMismatch` |
| ESC-ERR-29 | blinder 篡改 | opening 不一致 | `CommitmentOpeningMismatch` |
| ESC-ERR-30 | FIAT 非商家调用提交证明 | 随机地址 `receive...` | 当前实现 `WrongId`（行为确认） |

### 2.3 攻击防御（ATT）

| ID | 攻击向量 | 关键动作 | 预期防御 |
|---|---|---|---|
| ESC-ATT-01 | 用户抢跑提交买家 proof | 普通用户 attacker 调 `payOrderByPlatform` | `NotAllowed` |
| ESC-ATT-02 | 其他商家抢跑提交买家 proof | 其他 merchant 地址调 `payOrderByPlatform` | `NotAllowed` |
| ESC-ATT-03 | 用户抢跑提交商家 proof | 普通用户 attacker 调 `receive...` | `WrongId`（当前实现） |
| ESC-ATT-04 | 其他商家抢跑提交商家 proof | 其他 merchant 地址调 `receive...`（且该商家已具备对应产品与在途订单） | `OrderBindingHashMismatch` |
| ESC-ATT-05 | 跨订单 replay | A 订单 proof 提交到 B 订单 | `OrderBindingHashMismatch` |
| ESC-ATT-06 | 同订单重复提交 proof | 完成后再提交（分别覆盖 cleanup 后/未 cleanup） | cleanup 后 `OrderNotFound`；未 cleanup 时 `NotPending` |
| ESC-ATT-07 | 跨平台 proof 注入 | Wise 订单喂 Alipay serverName | `NotTrustedPaymentServer` |
| ESC-ATT-08 | transfer/orderId replay | 平台唯一 ID 复用 | `DuplicateTransferId` / `DuplicateAlipayOrderId` |
| ESC-ATT-09 | 伪造买家身份哈希 | OBH 里替换 buyer/payee hash | `OrderBindingHashMismatch` |
| ESC-ATT-10 | 篡改 rateVersion | proof 用错误 rateVersion | `OrderBindingHashMismatch` |
| ESC-ATT-11 | commitments 哈希碰撞尝试 | 改 revealed/commitments 组合 | `CommitmentOpeningMismatch` 或 `CommitmentsHashMismatch` |
| ESC-ATT-12 | 旧 session 多次利用 | 不同订单重复 sessionId | `SessionAlreadyUsed` |
| ESC-ATT-13 | DoS 填满 pending 队列 | 同产品灌单到 200 | `TooManyPending` |
| ESC-ATT-14 | 商家趁挂单提走抵押 | 下单后 `takeAmount` 提超可用 | `InsufficientPendingLocked` |
| ESC-ATT-15 | 非授权平台验证器直调 | 外部直接调用平台 verifier | revert("only TLSNVerifier") |
| ESC-ATT-16 | 过期后再 claim/release | deadline 后伪造支付成功 | `OutOfDeadline` |

### 2.4 流程篡改（TAMPER）

| ID | 篡改场景 | 关键动作 | 预期 |
|---|---|---|---|
| ESC-TAMPER-01 | 商家改汇率后企图影响旧单 | 下单后 `publishRate` | 旧单按旧 `rateVersion` 验证（D-1） |
| ESC-TAMPER-02 | 商家更新支付哈希 | 下单后改 `merchantPaymentInfo` | 已下单订单按快照校验，旧 proof 仍可通过（当前实现） |
| ESC-TAMPER-03 | FIAT 下单后（已锁币）买家尝试取消订单 | 买家调用 `cancelOrder` | 被拒绝：`NotPending`（FIAT 在 WAITING 阶段不支持取消） |
| ESC-TAMPER-04 | 非营业时间下单 | closeNow 或 schedule closed | `MerchantClosed` |
| ESC-TAMPER-05 | 商家关门后已有订单继续 | 下单后 `closeNow` | 已有订单仍可正常完成 |
| ESC-TAMPER-06 | 产品下架后已有订单继续 | 下单后 `inactiveProduct` | 已有订单仍可完成/超时处理 |
| ESC-TAMPER-07 | 汇率到期后已有订单处理 | 下单后 rate 过期 | 已有订单可按快照继续验证 |
| ESC-TAMPER-08 | 管理员中途调低 cap | 下单后降 cap | 只影响后续新单 |
| ESC-TAMPER-09 | 买家更换收款身份数据 | 提交 proof 时 payee hash 不一致 | `OrderBindingHashMismatch` |
| ESC-TAMPER-10 | 商家尝试提走 FIAT 在途订单占用的抵押 | FIAT 订单在 WAITING 时调用 `takeAmount` | 被拒绝：受 `pendingAmount` 锁定，触发 `InsufficientPendingLocked` |
| ESC-TAMPER-11 | 利用 cleanup 规避状态检查 | 在错误时机触发 cleanup | 仅过期单被收敛，不影响未过期有效单 |
| ESC-TAMPER-12 | 边界时刻提交（deadline 秒级） | `==deadline` / `>deadline` | 边界行为稳定，>deadline 必拒绝 |
| ESC-TAMPER-13 | 旧订单仍按下单快照校验商家收款哈希 | 下单后更新 `merchantPaymentInfo`，故意用新 hash 生成旧订单 proof | 被拒绝：`OrderBindingHashMismatch`（旧单必须用旧哈希） |

---

## 3. WisePlatformVerifier 测试用例（test/WisePlatform.ts）

### 3.1 正常业务流程（FLOW）

| ID | 场景 | 关键动作 | 预期 |
|---|---|---|---|
| WISE-FLOW-01 | 买家支付验证成功 | `verifyBuyerPayment([contacts,transfer], params)` | 返回 txId=transferId，验证通过 |
| WISE-FLOW-02 | 商家支付验证成功 | `verifyMerchantSent(...)` | 返回 txId=transferId，验证通过 |
| WISE-FLOW-03 | 时间边界等于创建时间 | `dateMs/1000 == orderCreationTime` | 允许通过 |
| WISE-FLOW-04 | 时间边界等于截止时间 | `dateMs/1000 == orderDeadline` | 允许通过 |
| WISE-FLOW-05 | transferId 使用后落库 | 成功后读 `usedTransferIds[id]` | 为 true |

### 3.2 错误拦截（ERR）

| ID | 场景 | 关键动作 | 预期错误 |
|---|---|---|---|
| WISE-ERR-01 | 非 TLSNVerifier 调用 | 外部地址直接调 verify* | revert("only TLSNVerifier") |
| WISE-ERR-02 | proof 数量不足 | 仅给 transfer 或 contacts | 越界/泛化 revert |
| WISE-ERR-03 | proof 顺序颠倒 | `[transfer, contacts]` | `MissingWiseField` |
| WISE-ERR-04 | state 不匹配 | 非 `OUTGOING_PAYMENT_SENT` | `PaymentNotCompleted` |
| WISE-ERR-05 | amount 不匹配 | `targetAmount != fiatAmountX1000` | `PaymentAmountMismatch` |
| WISE-ERR-06 | currency 不匹配 | `targetCurrency != expected` | `CurrencyMismatch` |
| WISE-ERR-07 | transferId 重放 | 重复 transferId | `DuplicateTransferId` |
| WISE-ERR-08 | 付款早于下单 | `dateMs/1000 < orderCreationTime` | `WiseTransferTooOld` |
| WISE-ERR-09 | 付款晚于截止 | `dateMs/1000 > orderDeadline` | `TransferDateExpired` |
| WISE-ERR-10 | 缺 `state` 字段 | 移除 key | `MissingWiseField` |
| WISE-ERR-11 | 缺 `targetAmount` 字段 | 移除 key | `MissingWiseField` |
| WISE-ERR-12 | 缺 `targetCurrency` 字段 | 移除 key | `MissingWiseField` |
| WISE-ERR-13 | 缺 `id` 字段 | 移除 key | `MissingWiseField` |
| WISE-ERR-14 | 缺 `date` 字段 | 移除 key | `MissingWiseField` |

### 3.3 攻击防御（ATT）

| ID | 攻击向量 | 关键动作 | 预期防御 |
|---|---|---|---|
| WISE-ATT-01 | 跨订单 transferId replay | 不同订单重用同 id | `DuplicateTransferId` |
| WISE-ATT-02 | 旧转账复用攻击 | transfer 时间早于下单 | `WiseTransferTooOld` |
| WISE-ATT-03 | 延迟提交攻击 | 超过订单截止后提交 | `TransferDateExpired` |
| WISE-ATT-04 | 伪造 amount/currency | 仅改 revealedItems | 与 params 不符被拒绝 |
| WISE-ATT-05 | 弱化 contacts proof | contacts revealedItems 为空 | 由 TLSN + server 机制保护（文档性用例） |
| WISE-ATT-06 | 直连调用平台合约绕过 TLSN | 外部直接调用 verify* | onlyVerifier 拦截 |
| WISE-ATT-07 | session replay（跨 proof） | contacts 与 transfer 同 session | 在 TLSNVerifier 层 `SessionAlreadyUsed` |
| WISE-ATT-08 | 不可信 payment server | serverName 非 white list | 在 TLSNVerifier 层 `NotTrustedPaymentServer` |

### 3.4 流程篡改（TAMPER）

| ID | 篡改场景 | 关键动作 | 预期 |
|---|---|---|---|
| WISE-TAMPER-01 | 商家改支付哈希后沿用旧 proof | 修改 name/id hash 后提交旧 proof | 仍可通过（订单内 merchant hash 快照，当前实现） |
| WISE-TAMPER-02 | 改 rateVersion 提交 | proof 使用错误 rateVersion | `OrderBindingHashMismatch` |
| WISE-TAMPER-03 | 改 buyer/payee 绑定 | OBH 改 payee hash | `OrderBindingHashMismatch` |
| WISE-TAMPER-04 | 商家更新汇率后旧单证明 | 下单后改汇率再提交旧版本 proof | 旧单仍可完成（D-1） |
| WISE-TAMPER-05 | 订单完成后再提交同 proof | 二次提交 | `OutOfDeadline`（Escrow 清理后） |
| WISE-TAMPER-06 | 伪造同平台不同商家上下文 | 复用他人 proof | 绑定字段不一致被拒绝 |
| WISE-TAMPER-07 | 反向用例：改支付哈希后用新哈希签旧订单 | 下单后更新商家 hash，并按新 hash 生成旧单 proof | `OrderBindingHashMismatch` |

---

## 4. AlipayPlatformVerifier 测试用例（test/AlipayPlatform.ts）

### 4.1 正常业务流程（FLOW）

| ID | 场景 | 关键动作 | 预期 |
|---|---|---|---|
| ALI-FLOW-01 | 买家支付验证成功 | `verifyBuyerPayment([proof], params)` | 返回 txId=keccak(orderId) |
| ALI-FLOW-02 | 商家支付验证成功 | `verifyMerchantSent([proof], params)` | 返回 txId=keccak(orderId) |
| ALI-FLOW-03 | 边界时间等于创建时间 | `gmtSuccess == creation` | 允许通过 |
| ALI-FLOW-04 | 边界时间等于截止时间 | `gmtSuccess == deadline` | 允许通过 |
| ALI-FLOW-05 | orderId 使用后落库 | 成功后 `usedAlipayOrderIds[txId]` | 为 true |

### 4.2 错误拦截（ERR）

| ID | 场景 | 关键动作 | 预期错误 |
|---|---|---|---|
| ALI-ERR-01 | 非 TLSNVerifier 调用 | 普通地址直接调用 `verifyBuyerPayment`（非空 bytes 参数） | revert("only TLSNVerifier") |
| ALI-ERR-02 | status 非 SUCCESS | status=FAILED/PENDING | `AlipayPaymentNotCompleted` |
| ALI-ERR-03 | bizType 非 TRANSFER | bizType=REFUND | `InvalidAlipayBizType` |
| ALI-ERR-04 | 买家流金额不匹配 | `payAmount != expected` | `PaymentAmountMismatch` |
| ALI-ERR-05 | 商家流金额不匹配 | `payAmount != expected` | `ReceivedAmountMismatch` |
| ALI-ERR-06 | orderId 重放 | 重复同 orderId | `DuplicateAlipayOrderId` |
| ALI-ERR-07 | 付款早于下单 | gmtSuccess < creation | `AlipayTransferTooOld` |
| ALI-ERR-08 | 付款晚于截止 | gmtSuccess > deadline | `AlipayTransferDateExpired` |
| ALI-ERR-09 | 缺 `payAmount` 字段 | 删除 key | `MissingAlipayField` |
| ALI-ERR-10 | 缺 `status` 字段 | 删除 key | `MissingAlipayField` |
| ALI-ERR-11 | 缺 `bizType` 字段 | 删除 key | `MissingAlipayField` |
| ALI-ERR-12 | 缺 `orderId` 字段 | 删除 key | `MissingAlipayField` |
| ALI-ERR-13 | 缺 `gmtSuccess` 字段 | 删除 key | `MissingAlipayField` |
| ALI-ERR-14 | 时间格式异常 | `gmtSuccess` 非法格式 | parser revert（日期解析失败） |

### 4.3 攻击防御（ATT）

| ID | 攻击向量 | 关键动作 | 预期防御 |
|---|---|---|---|
| ALI-ATT-01 | 跨订单 orderId replay | 用同 orderId 提交新订单 | `DuplicateAlipayOrderId` |
| ALI-ATT-02 | 旧支付复用攻击 | gmtSuccess 早于订单创建 | `AlipayTransferTooOld` |
| ALI-ATT-03 | 延时提交攻击 | gmtSuccess 晚于 deadline | `AlipayTransferDateExpired` |
| ALI-ATT-04 | 字段删减绕过 | 缺关键 key | `MissingAlipayField` |
| ALI-ATT-05 | 直连平台合约绕过 TLSN | 普通地址直接调 `verifyMerchantSent`（非空 bytes 参数） | onlyVerifier 拦截 |
| ALI-ATT-06 | 伪造状态码 | status 改为 SUCCESS 以外 | `AlipayPaymentNotCompleted` |
| ALI-ATT-07 | 伪造业务类型 | bizType 改为非 TRANSFER | `InvalidAlipayBizType` |
| ALI-ATT-08 | 不可信 payment server | serverName 非白名单 | TLSN 层 `NotTrustedPaymentServer` |

### 4.4 流程篡改（TAMPER）

| ID | 篡改场景 | 关键动作 | 预期 |
|---|---|---|---|
| ALI-TAMPER-01 | 商家改汇率后企图影响旧单 | 下单后改 rate 再提交旧 proof | 旧单仍可按快照完成（D-1） |
| ALI-TAMPER-02 | proof 使用错误 rateVersion | 手动 +1/-1 rateVersion | `OrderBindingHashMismatch` |
| ALI-TAMPER-03 | 改 buyer/payee 绑定哈希 | proof 绑定与订单不一致 | `OrderBindingHashMismatch` |
| ALI-TAMPER-04 | FIAT WAITING 想取消 | 买家对 WAITING 调 `cancelOrder` | `NotPending`（D-2） |
| ALI-TAMPER-05 | 非买家取消订单 | 第三方调用 cancel | `NotAllowed`（PENDING 路径） |
| ALI-TAMPER-06 | 非商家提交 FIAT 证明 | 攻击者调 `receive...` | 当前实现 `WrongId` |
| ALI-TAMPER-07 | 完成后重复提交 proof（两种状态） | 分别覆盖 cleanup 后与未 cleanup 的重复提交 | cleanup 后 `OrderNotFound`；未 cleanup 时 `NotPending` |
| ALI-TAMPER-08 | 商家更新支付哈希后复用旧 proof | 改 name/id hash 后提交旧 proof | 仍可通过（订单内 merchant hash 快照，当前实现） |
| ALI-TAMPER-09 | 非营业时段下单 | closeNow 或 schedule closed | `MerchantClosed` |
| ALI-TAMPER-10 | 反向用例：改支付哈希后用新哈希签旧订单 | 下单后更新商家 hash，并按新 hash 生成旧单 proof | `OrderBindingHashMismatch` |

---

## 5. 跨合约联动与攻击链路（test/Integration.ts）

| ID | 联动场景 | 关键动作 | 预期 |
|---|---|---|---|
| INT-01 | 全链路完成（Wise-CRYPTO） | 注册→上架→发布汇率→开门→下单→支付证明 | 完整完成，买家收币 |
| INT-02 | 全链路完成（Wise-FIAT） | 注册→上架→发布汇率→开门→一步下单锁币→商家证明 | 完整完成，商家收币 |
| INT-03 | 全链路完成（Alipay-CRYPTO） | 同上 | 完整完成，买家收币 |
| INT-04 | 全链路完成（Alipay-FIAT） | 同上 | 完整完成，商家收币 |
| INT-05 | deadline 竞争条件 | 在截止前后 1 秒分别提交 | 前者可过、后者拒绝 |
| INT-06 | 同 session 跨平台复用 | 一份 proof 给 Wise/Alipay | `SessionAlreadyUsed` 或绑定不匹配 |
| INT-07 | 跨链 proof 注入 | 使用其他链 chainId proof | `WrongChainId` |
| INT-08 | 批量挂单 + cleanup 压力 | 大量订单过期后清理 | 状态与金额一致，无异常扣款 |
| INT-09 | 商家改支付身份中途切换 | 下单后改 hash 再提交旧 proof | 旧 proof 仍可通过（订单快照）；如按新 hash 生成 proof 则应失败 |
| INT-10 | 商家关门/下架中途切换 | 下单后 closeNow + inactive | 已有订单不受影响可正常结算 |
| INT-11 | 反向联动：商家改支付身份后"新 hash proof 打旧单" | 下单后更新商家 hash，构造新 hash proof 提交旧订单 | `OrderBindingHashMismatch` |

---

## 6. 营业时间测试用例（test/BusinessHours.ts）

> **逻辑说明：**
> - `manualOverride == 2` → false（强制关闭）
> - `manualOverride == 1` → true（强制开放）
> - 否则检查 `activeDays` bitmask（bit0=周一…bit6=周日）：若当前工作日 bit 未设置则关闭
> - 正常情况：`openSecond <= daySecond < closeSecond`
> - 跨午夜（close < open）：`daySecond >= openSecond || daySecond < closeSecond`
> - 默认：无 setBusinessHours/openNow → `isMerchantOpen = false`

| ID | 场景 | 关键动作 | 预期 |
|---|---|---|---|
| BH-01 | 默认状态（无 setBusinessHours/openNow）→ 关闭 | 直接调用 `isMerchantOpen` | false |
| BH-02 | 关门时下单 → MerchantClosed | `placeOrder` | `MerchantClosed` |
| BH-03 | openNow → 开放，下单成功 | `openNow` 后 `placeOrder` | 成功 |
| BH-04 | openNow 后 closeNow → 关闭 | `openNow` → `closeNow` → `placeOrder` | `MerchantClosed` |
| BH-05 | openNow 后 clearManualOverride → 回到时间表（默认关闭） | `clearManualOverride` 后检查 | `isMerchantOpen = false` |
| BH-06 | setBusinessHours 配合 openNow override → 开放 | `setBusinessHours` + `openNow` | `isMerchantOpen = true` |
| BH-07 | setBusinessHours + clearManualOverride，当前时间在窗口内 → 开放 | 调整时间戳在窗口内 | `isMerchantOpen = true` |
| BH-08 | 无效工作日（activeDays=0）→ 关闭 | 设置 activeDays=0 | `isMerchantOpen = false` |
| BH-09 | 全天全周激活（activeDays=0x7F，00:00–23:59）→ 始终开放 | 任意时间调用 | `isMerchantOpen = true` |
| BH-10 | 跨午夜时间表（22:00–06:00，全周），当前 23:00 → 开放 | `advanceTime` 至 23:00 | `isMerchantOpen = true` |
| BH-11 | 跨午夜时间表（22:00–06:00，全周），当前 12:00 → 关闭 | `advanceTime` 至 12:00 | `isMerchantOpen = false` |
| BH-12 | placeOrder 时 manualOverride=2（closeNow）→ MerchantClosed | `closeNow` 后 `placeOrder` | `MerchantClosed` |
| BH-13 | placeOrder 全天开放时间表（00:00–23:59）→ 成功 | 全天窗口，所有工作日激活 | 成功 |
| BH-14 | 不同 productId 的营业时间相互独立 | product0 open, product1 close | 触发 `MerchantClosed`（product1） |

---

## 7. 单笔限额测试用例（test/Cap.ts）

> **重要：** 所有 Cap 测试当前均失败（0/6）。
>
> **根本原因：** `CAP_COLLATERAL = MAX_ORDER_AMOUNT × 2 = 2000 USDT`，但 `deploy.ts` 默认只铸造 `MINT_AMOUNT = 50 USDT`，商家余额不足以支付抵押，导致 `listCryptoProduct` 中 ERC-20 转账失败，后续 `placeOrder` 始终遇到 `InsufficientAvailable`。
>
> **修复方案：** 在 `test/Cap.ts` 的 `before()` 钩子中，使用 MockERC20 的 `mint` 方法为商家补铸 ≥ 2000 USDT（或将 `CAP_COLLATERAL` 改为不超过 `MINT_AMOUNT` 的值，并调整 `setMaxOrderAmount` 以匹配）。

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| CAP-01 | 金额 == maxOrderAmount（1000 USDT）→ 下单成功 | `placeOrder(amount=maxOrderAmount)` | 成功 | ❌ 抵押不足 |
| CAP-02 | 金额 < maxOrderAmount（999 USDT）→ 下单成功 | `placeOrder(amount=999 USDT)` | 成功 | ❌ 抵押不足 |
| CAP-03 | 金额 > maxOrderAmount（1001 USDT）→ ExceedsUsdCap | `placeOrder(amount=1001 USDT)` | `ExceedsUsdCap` | ❌ 先触发 InsufficientAvailable |
| CAP-04 | 管理员降低上限至 500 USDT → 600 USDT 订单触发 ExceedsUsdCap | `setMaxOrderAmount(500)` → `placeOrder(600)` | `ExceedsUsdCap` | ❌ 先触发 InsufficientAvailable |
| CAP-05 | FIAT 产品 — 金额 > maxOrderAmount → ExceedsUsdCap | `placeOrder(FIAT, amount > cap)` | `ExceedsUsdCap` | ❌ 先触发 InsufficientAvailable |
| CAP-06 | D-3 — 单笔限额非累计（管理员提高上限后两笔 600 USDT 订单均成功） | 提高 cap → 下单 → 取消 → 再下单 | 两笔均成功 | ❌ 抵押不足 |

---

## 8. 汇率版本测试用例（test/Rate.ts）

> **RATE-02/03 已知失败（2/10）：**
>
> `assert.equal(BigInt(mr.version), RATE_VERSION_INITIAL)` 在 node:assert/strict 下因类型不一致报 `1 !== 1n`（number vs bigint 严格比较）。
>
> **修复方案：** 统一类型比较，例如改为 `assert.equal(mr.version, RATE_VERSION_INITIAL)` 并确保 `RATE_VERSION_INITIAL` 与合约返回类型一致，或使用 `String()` 转换后比较。

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| RATE-01 | 未 publishRate 时下单 → RateNotPublished | `placeOrder`（无 publishRate） | `RateNotPublished` | ✅ |
| RATE-02 | 首次 publishRate → version == 1 | `publishRate`，读 `getMerchantRate().version` | version == 1 | ❌ 断言类型不匹配 |
| RATE-03 | 二次 publishRate → version == 2 | 再次 `publishRate`，读 version | version == 2 | ❌ 断言类型不匹配 |
| RATE-04 | placeOrder 将 rateVersion 快照存入 Order 结构体 | 下单后读 `getOrder().rateVersion` | == 1 | ✅ |
| RATE-05 | 二次 publishRate 后 placeOrder 快照 version 2 | 两次 publishRate 后下单 | rateVersion == 2 | ✅ |
| RATE-06 | D-1：placeOrder 后 publishRate 不影响已有订单 proof | 下单后改汇率，提交旧版 proof | 旧单按旧 rateVersion 验证通过 | ✅ |
| RATE-07 | D-1：用新 rateVersion 构建旧订单 proof → OrderBindingHashMismatch | 用 rateVersion+1 构建 proof | `OrderBindingHashMismatch` | ✅ |
| RATE-08 | placeOrder 时汇率已过期 → RateExpired | `advanceTime` 超出 expiresAt | `RateExpired` | ✅ |
| RATE-09 | expiresAt == 0 表示永不过期 → placeOrder 成功 | `publishRate(expiresAt=0)` + 时间推进 | 成功 | ✅ |
| RATE-10 | 汇率在边界时间发布（now + 1s）→ 先成功后触发 RateExpired | 发布 `expiresAt=now+5s` → 立即下单成功 → 推进时间 → 再下单 | 先成功后 `RateExpired` | ✅ |

---

## 9. TLSNVerifier 测试用例（test/TLSNVerifier.ts）

> **已知失败：21/28 用例失败，3 类根本原因：**
>
> **原因一（HHE100 — 12 个用例）：** 部分 `revertWithCustomError` 调用无法从 Hardhat v3 提取 revert 数据。
> **修复：** 改用 try-catch + 字符串/selector 匹配（参考 TLSN-02/07 现有实现）。
>
> **原因二（TypeError — 6 个用例）：** `helpers/buildTLSNProof.ts` 中的辅助函数返回结构与合约期望不符。
> **修复：** 统一改用 `helpers/proofBuilder.ts` 中的对应函数，或修复 `buildTLSNProof.ts`。
>
> **原因三（AssertionError — 3 个用例 TLSN-25/26/27）：** 将自定义错误断言传入 `d.tlsnVerifier`，但 `PaymentAmountMismatch`/`CurrencyMismatch`/`MissingWiseField` 定义在 `WisePlatformVerifier` 合约。
> **修复：** 改为传入 `d.wisePlatformVerifier`。

### 9.1 管理员管理（Admin）

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| TLSN-01 | 两步管理员移交（proposeAdmin → acceptAdmin） | `proposeAdmin` + `acceptAdmin` | admin 切换成功 | ✅ |
| TLSN-02 | 非管理员调用 proposeAdmin → OnlyAdmin | 非 admin 调用 `proposeAdmin` | `OnlyAdmin` | ❌ HHE100（改用 try-catch） |
| TLSN-03 | 非 pendingAdmin 调用 acceptAdmin → NotPendingAdmin | 非 pending 调 `acceptAdmin` | `NotPendingAdmin` | ✅ |
| TLSN-04 | proposeAdmin 零地址 → ZeroAddress | `proposeAdmin(0x0)` | `ZeroAddress` | ✅ |

### 9.2 可信 Verifier 管理

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| TLSN-05 | 新增信任 verifier 地址 | `addTrustedVerifier` + 读 `trustedVerifiers` | true | ✅ |
| TLSN-06 | 移除信任 verifier 地址 | `removeTrustedVerifier` + 读 `trustedVerifiers` | false | ✅ |
| TLSN-07 | 非管理员新增信任 verifier → OnlyAdmin | 非 admin 调 `addTrustedVerifier` | `OnlyAdmin` | ❌ HHE100（改用 try-catch） |

### 9.3 KYB Server 与授权调用方管理

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| TLSN-08 | 新增并移除 KYB server | `addTrustedKYBServer` + `removeTrustedKYBServer`（事件验证） | `TrustedKYBServerAdded` + `TrustedKYBServerRemoved` | ✅ |
| TLSN-09 | 管理员设置授权调用方 | `setAuthorizedCaller(addr, true)` + 读 `authorizedCallers` | true | ✅ |
| TLSN-10 | 非授权调用方调用 verifyProof → not authorized | 非授权地址调 `verifyProof` | revert "not authorized" | ❌ HHE100（改用 try-catch） |

### 9.4 Proof 核心验证

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| TLSN-11 | 验证有效 proof → 触发 TLSNProofVerified 事件 | `verifyProof(buildKYBProof(...))` | emit `TLSNProofVerified` | ❌ TypeError（buildTLSNProof.ts 结构错误） |
| TLSN-12 | 链 ID 错误 → WrongChainId | `verifyProof(proof with chainId=99999)` | `WrongChainId` | ❌ HHE100（改用 try-catch） |
| TLSN-13 | sessionId 重复 → SessionAlreadyUsed | 同 sessionId 提交两次 | `SessionAlreadyUsed` | ❌ TypeError（buildTLSNProof.ts 结构错误） |
| TLSN-14 | 篡改 commitment opening → CommitmentOpeningMismatch | 改 blinder 后提交 | `CommitmentOpeningMismatch` | ❌ HHE100（改用 try-catch） |
| TLSN-15 | 篡改 commitmentsHash → CommitmentsHashMismatch | 改 commitmentsHash 后提交 | `CommitmentsHashMismatch` | ❌ HHE100（改用 try-catch） |
| TLSN-16 | 不可信 verifier 签名 → UntrustedVerifier | 用随机私钥签名后提交 | `UntrustedVerifier` | ❌ HHE100（改用 try-catch） |

### 9.5 KYB 验证

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| TLSN-17 | 验证有效 KYB proof | `verifyKYB(buildKYBProof(...))` | 成功 | ❌ TypeError（buildTLSNProof.ts 结构错误） |
| TLSN-18 | KYC 状态非 verified → KYCNotVerified | KYB proof status="pending" | `KYCNotVerified` | ❌ HHE100（改用 try-catch） |
| TLSN-19 | KYB server 不可信 → NotTrustedKYBServer | serverName="evil.example.com" | `NotTrustedKYBServer` | ❌ HHE100（改用 try-catch） |
| TLSN-20 | revealedItems 为空 → MissingRevealedItems | `revealedItems=[]` | `MissingRevealedItems` | ❌ HHE100（改用 try-catch） |

### 9.6 verifyAndDelegate 平台委托

| ID | 场景 | 关键动作 | 预期 | 当前状态 |
|---|---|---|---|---|
| TLSN-21 | 通过 verifyAndDelegate 验证 Wise 买家支付 | `verifyAndDelegate(PLATFORM_WISE, false, [contacts, transfer], params)` | emit `PlatformPaymentVerified` | ❌ TypeError（buildWiseContactsProof 结构错误） |
| TLSN-22 | 通过 verifyAndDelegate 验证 Wise 商家发款 | `verifyAndDelegate(PLATFORM_WISE, true, [contacts, transfer], params)` | emit `PlatformPaymentVerified` | ❌ TypeError（buildWiseTransferProof 结构错误） |
| TLSN-23 | 平台未注册 → PlatformNotRegistered | 传入未知 platformId | `PlatformNotRegistered` | ❌ HHE100（改用 try-catch） |
| TLSN-24 | proof serverName 不可信 → NotTrustedPaymentServer | serverName="evil.com" | `NotTrustedPaymentServer` | ❌ HHE100（改用 try-catch） |
| TLSN-25 | Wise 支付金额不匹配（通过 delegate）→ PaymentAmountMismatch | 传入错误金额 params | `PaymentAmountMismatch` | ❌ 应传入 `d.wisePlatformVerifier` 而非 `d.tlsnVerifier` |
| TLSN-26 | Wise 货币不匹配（通过 delegate）→ CurrencyMismatch | 传入错误货币 params | `CurrencyMismatch` | ❌ 应传入 `d.wisePlatformVerifier` 而非 `d.tlsnVerifier` |
| TLSN-27 | Wise 转账 proof 缺失必填字段 → MissingWiseField | transfer proof 只有 id 字段 | `MissingWiseField` | ❌ 应传入 `d.wisePlatformVerifier` 而非 `d.tlsnVerifier` |
| TLSN-28 | 通过 verifyAndDelegate 验证 Alipay 买家支付 | `verifyAndDelegate(PLATFORM_ALIPAY, false, [alipayProof], params)` | emit `PlatformPaymentVerified` | ❌ TypeError（buildAlipayProof 结构错误） |

---

## 10. 实现方案 · 修改文件 · 执行计划

> 生成日期：2026-04-18
> 框架：Hardhat 3 + Viem + Node test runner（与现有 `Rate.ts` / `BusinessHours.ts` 保持一致）

---

### 10.1 指标采集架构

每个测试用例需记录 5 个维度：

| 列 | 采集方式 | 说明 |
|---|---|---|
| **测试内容** | 用例 ID + 描述字符串（中文） | 手动填写，截断到 52 字符 |
| **通过** | try/catch 包裹整个 it 体，catch 置 pass=false | 失败时仍 `addRecord` 再 `throw` |
| **总时间(ms)** | `t0 = Date.now()` 在 it 体最开头，`Date.now()-t0` 在 `finally` | 包含部署/setup 在内的全程时间 |
| **验证时间(ms)** | `ctx.markVerifyStart()` / `ctx.markVerifyEnd()` 夹住**关键链上调用** | 对应合约 call 的挂起到 receipt 返回 |
| **Gas** | `receipt.gasUsed`（通过 `publicClient.getTransactionReceipt`） | revert 用例置 `0n` |

#### 10.1.1 通用测试包装模式

```typescript
import { addRecord, makeCtx } from "./helpers/tableReporter.js";

it("ADM-FLOW-01: 两步管理员移交", async () => {
  const t0 = Date.now();
  const ctx = makeCtx();
  let pass = false;
  try {
    // ── setup（不计入 verifyMs）──
    const fresh = await viem.deployContract("C2CAdmin", [d.tlsnVerifier.address]);
    await fresh.write.proposeAdmin([d.newAdmin.account.address]);

    // ── 关键链上验证（计入 verifyMs）──
    ctx.markVerifyStart();
    const hash = await freshAsNewAdmin.write.acceptAdmin();
    const receipt = await pc.getTransactionReceipt({ hash });
    ctx.markVerifyEnd();
    ctx.setGas(receipt.gasUsed);

    // ── 断言 ──
    assert.equal((await fresh.read.admin()).toLowerCase(),
                 d.newAdmin.account.address.toLowerCase());
    pass = true;
  } finally {
    addRecord({
      id: "ADM-FLOW-01",
      desc: "两步管理员移交 proposeAdmin->acceptAdmin",
      pass,
      totalMs: Date.now() - t0,
      verifyMs: ctx.verifyMs(),
      gasUsed: ctx.gasUsed,
    });
  }
});
```

#### 10.1.2 Revert 用例模式（gas = 0n）

```typescript
it("ADM-ERR-01: 非admin提议新管理员", async () => {
  const t0 = Date.now();
  const ctx = makeCtx();
  let pass = false;
  try {
    ctx.markVerifyStart();
    await viem.assertions.revertWithCustomError(
      asRandom.write.proposeAdmin([d.randomUser.account.address]),
      d.c2cAdmin, "OnlyAdmin",
    );
    ctx.markVerifyEnd();
    pass = true;
  } finally {
    addRecord({
      id: "ADM-ERR-01",
      desc: "非admin调proposeAdmin → OnlyAdmin",
      pass, totalMs: Date.now() - t0,
      verifyMs: ctx.verifyMs(), gasUsed: 0n,
    });
  }
});
```

#### 10.1.3 HHE100 兼容模式（TLSNVerifier onlyAdmin 等）

```typescript
it("TLSN-02: 非管理员调用 proposeAdmin → OnlyAdmin", async () => {
  try {
    await freshAsRandom.write.proposeAdmin([d.randomUser.account.address]);
    assert.fail("应当触发 OnlyAdmin revert");
  } catch (err: any) {
    const msg = String(err);
    assert.ok(
      msg.includes("OnlyAdmin") || msg.includes("0x47556579"),
      `期望 OnlyAdmin revert，实际收到：${msg.slice(0, 300)}`,
    );
  }
});
```

---

### 10.2 文件清单

| 文件路径 | 说明 | 对应测试 ID |
|---|---|---|
| `test/C2CAdmin.ts` | C2CAdmin 全量测试 | ADM-FLOW-01~15, ADM-ERR-01~24, ADM-ATT-01~08, ADM-TAMPER-01~09 |
| `test/C2CEscrow.ts` | C2CEscrow 全量测试 | ESC-FLOW-01~16, ESC-ERR-01~30, ESC-ATT-01~16, ESC-TAMPER-01~13 |
| `test/WisePlatform.ts` | WisePlatformVerifier 测试 | WISE-FLOW-01~05, WISE-ERR-01~14, WISE-ATT-01~08, WISE-TAMPER-01~07 |
| `test/AlipayPlatform.ts` | AlipayPlatformVerifier 测试 | ALI-FLOW-01~05, ALI-ERR-01~14, ALI-ATT-01~08, ALI-TAMPER-01~10 |
| `test/Integration.ts` | 跨合约联动测试 | INT-01~11 |
| `test/BusinessHours.ts` | 营业时间测试 | BH-01~14 |
| `test/Cap.ts` | 单笔限额测试 | CAP-01~06 |
| `test/Rate.ts` | 汇率版本测试 | RATE-01~10 |
| `test/TLSNVerifier.ts` | TLSNVerifier 核心测试 | TLSN-01~28 |

**辅助文件：**

| 文件路径 | 说明 |
|---|---|
| `test/helpers/deploy.ts` | 部署所有合约（含 MockERC20 铸造、授权注册） |
| `test/helpers/proofBuilder.ts` | 构建 Wise / Alipay proof（含 orderBindingHash 签名） |
| `test/helpers/orderBindingHash.ts` | `computeOrderBindingHash` 工具函数 |
| `test/helpers/buildTLSNProof.ts` | TLSNVerifier 专用 proof 构建（⚠️ 当前返回结构需修复） |
| `test/helpers/tableReporter.ts` | 表格输出工具 |
| `test/helpers/time.ts` | `advanceTime(testClient, seconds)` 工具 |
| `test/helpers/constants.ts` | 所有共享常量（服务器名、金额、汇率、身份哈希等） |

---

### 10.3 package.json 脚本

```json
"scripts": {
  "test":             "hardhat test --network hardhatMainnet",
  "test:admin":       "hardhat test test/C2CAdmin.ts --network hardhatMainnet",
  "test:escrow":      "hardhat test test/C2CEscrow.ts --network hardhatMainnet",
  "test:wise":        "hardhat test test/WisePlatform.ts --network hardhatMainnet",
  "test:alipay":      "hardhat test test/AlipayPlatform.ts --network hardhatMainnet",
  "test:integration": "hardhat test test/Integration.ts --network hardhatMainnet",
  "test:bh":          "hardhat test test/BusinessHours.ts --network hardhatMainnet",
  "test:cap":         "hardhat test test/Cap.ts --network hardhatMainnet",
  "test:rate":        "hardhat test test/Rate.ts --network hardhatMainnet",
  "test:tlsn":        "hardhat test test/TLSNVerifier.ts --network hardhatMainnet",
  "test:all":         "hardhat test test/C2CAdmin.ts test/C2CEscrow.ts test/WisePlatform.ts test/AlipayPlatform.ts test/Integration.ts test/BusinessHours.ts test/Cap.ts test/Rate.ts test/TLSNVerifier.ts --network hardhatMainnet",
  "node":             "hardhat node --network hardhatMainnet",
  "deploy:local":     "hardhat run scripts/deploy-local.ts --network hardhatMainnet"
}
```

---

### 10.4 已知失败修复清单

| 套件 | 失败用例 | 根本原因 | 修复方案 |
|---|---|---|---|
| Cap | CAP-01~06（全部） | `CAP_COLLATERAL = 2000 USDT > MINT_AMOUNT = 50 USDT` | 在 `before()` 中为商家额外铸造 ≥ 2000 USDT，或降低 `CAP_COLLATERAL` 并配套调整 `setMaxOrderAmount` |
| Rate | RATE-02/03 | `assert.equal(BigInt(mr.version), 1n)` 类型比较报 `1 !== 1n` | 统一使用 `String(mr.version)` 与 `String(RATE_VERSION_INITIAL)` 比较，或改为 `mr.version` 直接与 `RATE_VERSION_INITIAL` 比较 |
| TLSNVerifier | TLSN-02/07/10/12/14/15/16/18/19/20/23/24 | Hardhat v3 `revertWithCustomError` 无法从 modifier revert 提取数据（HHE100） | 改用 try-catch + 字符串/selector 匹配（参考 `test/TLSNVerifier.ts` TLSN-02/07 现有实现） |
| TLSNVerifier | TLSN-11/13/17/21/22/28 | `helpers/buildTLSNProof.ts` 返回结构与合约期望不符 | 统一改用 `helpers/proofBuilder.ts` 中的 `buildKYBProof`、`buildWiseContactsProof`、`buildWiseTransferProof`、`buildAlipayProof` |
| TLSNVerifier | TLSN-25/26/27 | `revertWithCustomError` 传入 `d.tlsnVerifier`，但错误定义在 `WisePlatformVerifier` | 将第二参数改为 `d.wisePlatformVerifier` |

---

### 10.5 风险用例备注

| 用例 ID | 风险点 | 处理方式 |
|---|---|---|
| ADM-TAMPER-08 | 异常 assetType=2 发布汇率，当前合约无守卫 | 标记 ⚠️，期望当前实现不 revert，desc 中注明风险 |
| ADM-TAMPER-09 | rate=0 发布，合约允许，后续可致 0 金额校验 | 同上 |
| ESC-ERR-30 | FIAT 非商家调 `receive...` 返回 `WrongId` 而非语义错误 | 期望错误为 `WrongId`，注明当前实现行为 |
| ESC-ATT-03 | 普通用户抢跑商家 proof，返回 `WrongId` | 同上 |
| WISE-ATT-05 | contacts proof 弱化，由 TLSN + server 机制保护 | 标记为"文档性用例"，不做强断言 |
