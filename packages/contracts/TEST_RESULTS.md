# C2C Platform 智能合约测试结果

**日期：** 2026-04-19  
**命令：** `npm run test:all`  
**预期来源：** `C2C_TEST_CASES_REGENERATED.md`（规格优先，备选测试断言）  
**网络：** hardhatMainnet（chainId 31337，模拟）  
**框架：** Hardhat v3 + node:test + viem

---

## 汇总

| 测试套件 | 用例数 | 通过 | 失败 |
|---------|------:|-----:|-----:|
| C2CAdmin | 60 | 60 | 0 |
| C2CEscrow | 76 | 76 | 0 |
| AlipayPlatformVerifier | 37 | 37 | 0 |
| WisePlatformVerifier | 34 | 34 | 0 |
| Integration — 跨合约联动 | 11 | 11 | 0 |
| BusinessHours | 14 | 14 | 0 |
| Cap | 6 | 6 | 0 |
| Rate | 10 | 10 | 0 |
| TLSNVerifier | 28 | 28 | 0 |
| **合计** | **276** | **276** | **0** |

**运行汇总（node:test）：** 276 通过 / 0 失败

---

## C2CAdmin

**结果：** 60 / 60 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) | 失败原因 |
|---|---------|---------|------|:----:|----------:|------------:|----------------:|---------|
| ADM-FLOW-01 | 两步管理员移交（proposeAdmin → acceptAdmin） | 成功 | 成功 | ✅ | 84 | 40 | 27,676 | — |
| ADM-FLOW-02 | 新增支持币种 | SupportCryptoAdded 事件、计数 +1 | 成功 | ✅ | 40 | 28 | 105,832 | — |
| ADM-FLOW-03 | 新增支持法币 | SupportFiatAdded 事件、计数 +1 | 成功 | ✅ | 31 | 21 | 99,823 | — |
| ADM-FLOW-04 | 资产上下架切换 | 状态切换正确 | 成功 | ✅ | 48 | 21 | 34,238 | — |
| ADM-FLOW-05 | 管理员注册商家 | 商家激活且 KYB=true | 成功 | ✅ | 33 | 23 | 74,966 | — |
| ADM-FLOW-06 | 商家KYB证明注册 | MerchantRegistered | 成功 | ✅ | 36 | 26 | 141,808 | — |
| ADM-FLOW-07 | 商家设置平台支付哈希信息（Wise） | isSet=true，哈希落链（平台化） | 成功 | ✅ | 62 | 34 | 101,698 | — |
| ADM-FLOW-07A | 商家可分别设置 Wise/Alipay 支付信息 | 两平台可独立写入并各自读回 | 成功 | ✅ | 95 | 31 | 101,710 | — |
| ADM-FLOW-07B | 修改某平台支付信息且不影响其他平台 | 仅目标平台变更，其他平台不变 | 成功 | ✅ | 70 | 17 | 47,598 | — |
| ADM-FLOW-07C | 未设置的平台读取返回 isSet=false | 未配置平台返回 isSet=false | 成功 | ✅ | 51 | 21 | 101,698 | — |
| ADM-FLOW-08 | 商家设置法币账户 | 成功 | 成功 | ✅ | 35 | 18 | 49,701 | — |
| ADM-FLOW-09 | 首次发布汇率 version=1 | version=1、publishedAt>0 | 成功 | ✅ | 35 | 17 | 72,261 | — |
| ADM-FLOW-10 | 二次发布汇率 version递增 | version 单调递增 | 成功 | ✅ | 137 | 32 | 38,061 | — |
| ADM-FLOW-11 | 设置营业时间 | open/close/daymask 正确 | 成功 | ✅ | 63 | 15 | 49,973 | — |
| ADM-FLOW-12 | 强制营业/打烊/恢复自动 | isMerchantOpen 与 override 一致 | 成功 | ✅ | 77 | 19 | 26,483 | — |
| ADM-FLOW-13 | 设置单笔限额 | 新限额立即生效 | 成功 | ✅ | 21 | 17 | 30,139 | — |
| ADM-FLOW-14 | 授权调用方 | 授权映射更新正确 | 成功 | ✅ | 41 | 17 | 46,528 | — |
| ADM-FLOW-15 | 受权合约递增产品计数 | CRYPTO/FIAT 计数各自独立 | 成功 | ✅ | 65 | 43 | 200,661 | — |
| ADM-ERR-01 | 非admin调proposeAdmin | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ | 27 | 27 | — | — |
| ADM-ERR-02 | 非pendingAdmin调acceptAdmin | 触发 NotPendingAdmin | 触发 NotPendingAdmin | ✅ | 24 | 24 | — | — |
| ADM-ERR-03 | proposeAdmin零地址 | 触发 ZeroAddress | 触发 ZeroAddress | ✅ | 13 | 13 | — | — |
| ADM-ERR-04 | 非admin新增crypto | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ | 11 | 11 | — | — |
| ADM-ERR-05 | 非admin新增fiat | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ | 11 | 11 | — | — |
| ADM-ERR-06 | 激活已激活资产 | 触发 AlreadyActive | 触发 AlreadyActive | ✅ | 11 | 11 | — | — |
| ADM-ERR-07 | 下架已下架资产 | 触发 AlreadyInactive | 触发 AlreadyInactive | ✅ | 272 | 9 | — | — |
| ADM-ERR-08 | 资产ID越界 | 触发 WrongId | 触发 WrongId | ✅ | 10 | 10 | — | — |
| ADM-ERR-09 | 非商家发布汇率 | 触发 NotMerchant | 触发 NotMerchant | ✅ | 10 | 10 | — | — |
| ADM-ERR-10 | 发布过期汇率 | 触发 RateExpired | 触发 RateExpired | ✅ | 10 | 10 | — | — |
| ADM-ERR-11 | 非商家设置营业时间 | 触发 NotMerchant | 触发 NotMerchant | ✅ | 10 | 10 | — | — |
| ADM-ERR-12 | 非商家openNow/closeNow | 触发 NotMerchant | 触发 NotMerchant | ✅ | 20 | 10 | — | — |
| ADM-ERR-13 | 非admin设置限额 | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ | 11 | 11 | — | — |
| ADM-ERR-14 | 非授权调用递增计数 | revert: not authorized | revert: not authorized | ✅ | 13 | 13 | — | — |
| ADM-ERR-15 | 非商家设置法币账户 | 触发 NotMerchant | 触发 NotMerchant | ✅ | 11 | 11 | — | — |
| ADM-ERR-16 | 空法币账户 | 触发 EmptyAccount | 触发 EmptyAccount | ✅ | 11 | 11 | — | — |
| ADM-ERR-17 | 非商家设置支付哈希 | 触发 NotMerchant | 触发 NotMerchant | ✅ | 10 | 10 | — | — |
| ADM-ERR-18 | 支付哈希为空 | 触发 EmptyAccount | 触发 EmptyAccount | ✅ | 12 | 12 | — | — |
| ADM-ERR-18A | 未注册平台设置支付哈希 | 触发 PlatformNotRegistered | 触发 PlatformNotRegistered | ✅ | 14 | 14 | — | — |
| ADM-ERR-19 | 重复商家注册 | 触发 AlreadyRegistered | 触发 AlreadyRegistered | ✅ | 11 | 11 | — | — |
| ADM-ERR-20 | KYB proof链ID错误 | 触发 WrongChainId | 触发 WrongChainId | ✅ | 16 | 12 | — | — |
| ADM-ERR-21 | KYB proof session重放 | 触发 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ | 51 | 26 | — | — |
| ADM-ERR-22 | KYB proof伪造签名 | 触发 UntrustedVerifier | 触发 UntrustedVerifier | ✅ | 18 | 14 | — | — |
| ADM-ERR-23 | KYB server未信任 | 触发 NotTrustedKYBServer | 触发 NotTrustedKYBServer | ✅ | 18 | 13 | — | — |
| ADM-ERR-24 | KYB状态非verified | 触发 KYCNotVerified | 触发 KYCNotVerified | ✅ | 16 | 12 | — | — |
| ADM-ATT-01 | 管理员劫持 — 非pending抢先acceptAdmin | 触发 NotPendingAdmin | 触发 NotPendingAdmin | ✅ | 74 | 16 | — | — |
| ADM-ATT-02 | 伪造KYB签名 | 触发 UntrustedVerifier | 触发 UntrustedVerifier | ✅ | 17 | 13 | — | — |
| ADM-ATT-03 | KYB会话重放 | 触发 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ | 34 | 11 | — | — |
| ADM-ATT-04 | commitments篡改 | 触发 CommitmentsHashMismatch | 触发 CommitmentsHashMismatch | ✅ | 14 | 11 | — | — |
| ADM-ATT-05 | opening篡改 | 触发 CommitmentOpeningMismatch | 触发 CommitmentOpeningMismatch | ✅ | 13 | 10 | — | — |
| ADM-ATT-06 | 越权授权调用方 | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ | 12 | 12 | — | — |
| ADM-ATT-07 | 越权调整限额 | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ | 10 | 10 | — | — |
| ADM-ATT-08 | 伪造商家身份发布汇率 | 触发 NotMerchant | 触发 NotMerchant | ✅ | 10 | 10 | — | — |
| ADM-TAMPER-01 | 商家频繁改汇率 版本严格递增 | 版本严格递增，不回退 | 成功 | ✅ | 46 | 12 | 38,061 | — |
| ADM-TAMPER-02 | 短expiresAt汇率先可下单后快速过期 | 过期后新单 RateExpired | 成功 | ✅ | 24 | 4 | — | — |
| ADM-TAMPER-03 | 开门后立即关门 最新override生效 | 最新 override 生效 | 成功 | ✅ | 29 | 12 | 31,544 | — |
| ADM-TAMPER-04 | 关门后清除覆盖回到时间表 | 回到时间表判定 | 成功 | ✅ | 34 | 14 | 26,495 | — |
| ADM-TAMPER-05 | openNow后setBusinessHours不抹掉override | manualOverride 保持不变 | 成功 | ✅ | 35 | 22 | 32,885 | — |
| ADM-TAMPER-06 | 产品维度isMerchantOpen隔离 | isMerchantOpen 按产品隔离 | 成功 | ✅ | 163 | 6 | — | — |
| ADM-TAMPER-07 | 管理员中途改限额 仅影响新单 | 仅影响新单，不影响已下单订单流转 | 成功 | ✅ | 25 | 10 | — | — |
| ADM-TAMPER-08 | ⚠️ assetType=2发布汇率（风险用例-当前无守卫） | 当前实现会落库（风险用例） | 成功 | ✅ | 15 | 12 | 72,273 | — |
| ADM-TAMPER-09 | ⚠️ rate=0发布（风险用例-当前允许） | 当前实现允许（风险用例） | 成功 | ✅ | 16 | 13 | 33,237 | — |

## C2CEscrow

**结果：** 76 / 76 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) | 失败原因 |
|---|---------|---------|------|:----:|----------:|------------:|----------------:|---------|
| ESC-FLOW-01 | 商家上架 CRYPTO 产品记录正确、抵押入池 | 产品记录正确、抵押入池 | 成功 | ✅ | 809 | — | — | — |
| ESC-FLOW-02 | 商家上架 FIAT 产品记录正确、抵押入池 | 产品记录正确、抵押入池 | 成功 | ✅ | 17 | — | — | — |
| ESC-FLOW-03 | CRYPTO 下单成功 → PENDING | PENDING，pendingAmount 增 | 成功 | ✅ | 40 | 27 | 359,868 | — |
| ESC-FLOW-04 | FIAT 下单成功 → WAITING + 买家锁币 | 直接 WAITING，买家锁币 | 成功 | ✅ | 37 | 22 | 500,216 | — |
| ESC-FLOW-05 | CRYPTO 完整支付成功 → buyer 收币 | 订单 COMPLETED，买家得币 | 成功 | ✅ | 228 | 164 | 426,445 | — |
| ESC-FLOW-06 | FIAT 完整支付成功 → merchant 收币 + buyerInfo 删除 | 商家得币，buyerInfo 删除 | 成功 | ✅ | 236 | 157 | 413,823 | — |
| ESC-FLOW-07 | CRYPTO 买家取消 PENDING → 释放活跃标记 | CANCELLED/EXPIRED，释放活跃标记 | 成功 | ✅ | 99 | 31 | 113,528 | — |
| ESC-FLOW-08 | FIAT 超时索赔成功 → buyer 获 2x | 买家获 2x，CompensationPaid | 成功 | ✅ | 100 | 40 | 141,565 | — |
| ESC-FLOW-09 | cleanup 自动处理过期单 | 过期单状态正确收敛 | 成功 | ✅ | 77 | 33 | 112,188 | — |
| ESC-FLOW-10 | 产品启停切换正确 | 下架后触发 ProductInactive，重新上架后可下单 | 触发 ProductInactive + 成功下单(PENDING) | ✅ | 54 | 12 | 58,988 | — |
| ESC-FLOW-11 | 商家补充抵押 addAmount 成功 | collateralAmount 增加 | 成功 | ✅ | 25 | 11 | 72,228 | — |
| ESC-FLOW-12 | 商家提取可用抵押 takeAmount（分批成功） | 不同可用金额均可成功提取 | 成功（两次不同金额提取均成功） | ✅ | 39 | 11 | 70,470 | — |
| ESC-FLOW-13 | 商家提取超出可用抵押 → InsufficientPendingLocked | 触发 InsufficientPendingLocked | 触发 InsufficientPendingLocked | ✅ | 25 | 11 | — | — |
| ESC-FLOW-14 | 读取 getOrder 字段正确 | buyer/amount/rate/status/rateVersion 正确 | 成功 | ✅ | 18 | — | — | — |
| ESC-FLOW-15 | 读取 buyerPaymentInfo：在途 true，结束 false | FIAT 在途单为 isSet=true，结束后 false | 成功 | ✅ | 98 | — | — | — |
| ESC-FLOW-16 | 读取平台 ID 与上架一致 | 与上架时 platformId 一致 | 成功 | ✅ | 5 | — | — | — |
| ESC-ERR-01 | 非商家上架产品 → NotMerchant | 触发 NotMerchant | 触发 NotMerchant | ✅ | 21 | 19 | — | — |
| ESC-ERR-02 | 上架时 cryptoId 越界 → WrongId | 触发 WrongId | 触发 WrongId | ✅ | 15 | 14 | — | — |
| ESC-ERR-03 | 上架时 fiatId 越界 → WrongId | 触发 WrongId | 触发 WrongId | ✅ | 17 | 16 | — | — |
| ESC-ERR-04 | 激活已激活产品 → AlreadyActive | 触发 AlreadyActive | 触发 AlreadyActive | ✅ | 12 | 12 | — | — |
| ESC-ERR-05 | 下架已下架产品 → AlreadyInactive | 触发 AlreadyInactive | 触发 AlreadyInactive | ✅ | 57 | 15 | — | — |
| ESC-ERR-06 | 提取超可用抵押 → InsufficientPendingLocked | 触发 InsufficientPendingLocked | 触发 InsufficientPendingLocked | ✅ | 13 | 12 | — | — |
| ESC-ERR-07 | 产品关闭时下单 → ProductInactive | 触发 ProductInactive | 触发 ProductInactive | ✅ | 35 | 19 | — | — |
| ESC-ERR-08 | 非营业时间下单 → MerchantClosed | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | 29 | 13 | — | — |
| ESC-ERR-09 | 汇率未发布下单 → RateNotPublished | 触发 RateNotPublished | 触发 RateNotPublished | ✅ | 44 | 17 | — | — |
| ESC-ERR-10 | 汇率过期下单 → RateExpired | 触发 RateExpired | 触发 RateExpired | ✅ | 47 | 18 | — | — |
| ESC-ERR-11 | amount=0 下单 → ZeroAmount | 触发 ZeroAmount | 触发 ZeroAmount | ✅ | 16 | 15 | — | — |
| ESC-ERR-12 | 超过单笔限额 → ExceedsUsdCap | 触发 ExceedsUsdCap | 触发 ExceedsUsdCap | ✅ | 36 | 17 | — | — |
| ESC-ERR-13 | 超过可用抵押下单 → InsufficientAvailable | 触发 InsufficientAvailable | 触发 InsufficientAvailable | ✅ | 22 | 21 | — | — |
| ESC-ERR-14 | 同买家同产品重复活跃下单 → AlreadyHasActiveOrder | 触发 AlreadyHasActiveOrder | 触发 AlreadyHasActiveOrder | ✅ | 38 | 17 | — | — |
| ESC-ERR-15 | FIAT 不传 buyerInfo → BuyerPaymentInfoRequired | 触发 BuyerPaymentInfoRequired | 触发 BuyerPaymentInfoRequired | ✅ | 15 | 14 | — | — |
| ESC-ERR-31 | 订单平台未配置支付信息 → MerchantPaymentInfoNotSet | 触发 MerchantPaymentInfoNotSet | 触发 MerchantPaymentInfoNotSet | ✅ | 128 | 18 | — | — |
| ESC-ERR-16 | WAITING 订单调用 cancel → NotPending | 触发 NotPending | 触发 NotPending | ✅ | 33 | 15 | — | — |
| ESC-ERR-17 | 非买家取消订单 → NotAllowed | 触发 NotAllowed | 触发 NotAllowed | ✅ | 28 | 13 | — | — |
| ESC-ERR-18 | 订单过期后提交 proof → OutOfDeadline | 触发 OutOfDeadline | 触发 OutOfDeadline | ✅ | 131 | 78 | — | — |
| ESC-ERR-19 | FIAT 非 WAITING 场景提交收款证明 → NotWaiting | 触发 NotWaiting | 触发 NotWaiting | ✅ | 216 | 13 | — | — |
| ESC-ERR-20 | claimRefund 未超时 → NotYetExpired | 触发 NotYetExpired | 触发 NotYetExpired | ✅ | 27 | 12 | — | — |
| ESC-ERR-21 | cancel 不存在订单 → OrderNotFound | 触发 OrderNotFound | 触发 OrderNotFound | ✅ | 14 | 14 | — | — |
| ESC-ERR-22 | pay proof OBH 错误 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 43 | 15 | — | — |
| ESC-ERR-23 | 平台未注册且未配置支付信息 → MerchantPaymentInfoNotSet | 触发 MerchantPaymentInfoNotSet | 触发 MerchantPaymentInfoNotSet | ✅ | 92 | 14 | — | — |
| ESC-ERR-24 | payment server 不可信 → NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | ✅ | 108 | 38 | — | — |
| ESC-ERR-25 | proof chainId 错误 → WrongChainId | 触发 WrongChainId | 触发 WrongChainId | ✅ | 80 | 23 | — | — |
| ESC-ERR-26 | sessionId 重放 → SessionAlreadyUsed | 触发 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ | 248 | 22 | — | — |
| ESC-ERR-27 | verifier 签名不可信 → UntrustedVerifier | 触发 UntrustedVerifier | 触发 UntrustedVerifier | ✅ | 54 | 22 | — | — |
| ESC-ERR-28 | commitmentsHash 篡改 → CommitmentsHashMismatch | 触发 CommitmentsHashMismatch | 触发 CommitmentsHashMismatch | ✅ | 61 | 28 | — | — |
| ESC-ERR-29 | blinder 篡改 → CommitmentOpeningMismatch | 触发 CommitmentOpeningMismatch | 触发 CommitmentOpeningMismatch | ✅ | 58 | 26 | — | — |
| ESC-ERR-30 | FIAT 非商家提交证明 → WrongId（当前实现） | 触发 WrongId | 触发 WrongId | ✅ | 50 | 15 | — | — |
| ESC-ATT-01 | 用户抢跑提交买家 proof → NotAllowed | 触发 NotAllowed | 触发 NotAllowed | ✅ | 65 | 16 | — | — |
| ESC-ATT-02 | 其他商家抢跑提交买家 proof → NotAllowed | 触发 NotAllowed | 触发 NotAllowed | ✅ | 83 | 12 | — | — |
| ESC-ATT-03 | 用户抢跑提交商家 proof → WrongId（当前实现） | 触发 WrongId | 触发 WrongId | ✅ | 47 | 16 | — | — |
| ESC-ATT-04 | 其他商家抢跑提交商家 proof → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 121 | 14 | — | — |
| ESC-ATT-05 | 跨订单 replay → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 83 | 13 | — | — |
| ESC-ATT-06 | 同订单重复提交 proof：cleanup 后 OrderNotFound；未 cleanup 时 NotPending | cleanup 后 `OrderNotFound`；未 cleanup 时 `NotPending` | 触发 OrderNotFound + NotPending | ✅ | 336 | 15 | — | — |
| ESC-ATT-07 | 跨平台 proof 注入 → NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | ✅ | 51 | 22 | — | — |
| ESC-ATT-08 | 平台唯一交易 ID 重放 → DuplicateTransferId | DuplicateTransferId / DuplicateAlipayOrderId | 触发 DuplicateTransferId | ✅ | 304 | 60 | — | — |
| ESC-ATT-09 | 伪造买家身份哈希 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 57 | 16 | — | — |
| ESC-ATT-10 | 篡改 rateVersion → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 50 | 17 | — | — |
| ESC-ATT-11 | commitments 组合碰撞尝试 → CommitmentOpeningMismatch/CommitmentsHashMismatch | CommitmentOpeningMismatch 或 CommitmentsHashMismatch | 触发 CommitmentOpeningMismatch / CommitmentsHashMismatch | ✅ | 49 | 19 | — | — |
| ESC-ATT-12 | 旧 session 多次利用 → SessionAlreadyUsed | 触发 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ | 221 | 19 | — | — |
| ESC-ATT-13 | DoS 填满 pending 队列 → TooManyPending | 触发 TooManyPending | 触发 TooManyPending | ✅ | 9864 | 10 | — | — |
| ESC-ATT-14 | 商家趁挂单提走抵押 → InsufficientPendingLocked | 触发 InsufficientPendingLocked | 触发 InsufficientPendingLocked | ✅ | 25 | 11 | — | — |
| ESC-ATT-15 | 非授权直调平台 verifier → only TLSNVerifier | revert: only TLSNVerifier | 触发 only TLSNVerifier | ✅ | 11 | 11 | — | — |
| ESC-ATT-16 | 过期后再 release/claim 提交 proof → OutOfDeadline | 触发 OutOfDeadline | 触发 OutOfDeadline | ✅ | 45 | 15 | — | — |
| ESC-TAMPER-01 | 下单后改汇率不影响旧单（rateVersion 快照） | 旧单按旧 rateVersion 验证（D-1） | 成功 | ✅ | 93 | 61 | 426,481 | — |
| ESC-TAMPER-02 | 下单后商家改支付哈希，旧单按快照仍可通过 | 成功 | 成功 | ✅ | 78 | 55 | 426,433 | — |
| ESC-TAMPER-03 | FIAT 下单后已是 WAITING，买家调用 cancelOrder 会被拒绝（NotPending） | FIAT 在 WAITING 阶段不支持取消 | 触发 NotPending（符合预期） | ✅ | 26 | 12 | — | — |
| ESC-TAMPER-04 | 非营业时间下单 → MerchantClosed | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | 28 | 15 | — | — |
| ESC-TAMPER-05 | 下单后关门，不影响已有订单完成 | 已有订单仍可正常完成 | 成功 | ✅ | 150 | 106 | 426,481 | — |
| ESC-TAMPER-06 | 下单后下架产品，不影响已有订单完成 | 已有订单仍可完成/超时处理 | 成功 | ✅ | 162 | 116 | 426,505 | — |
| ESC-TAMPER-07 | 下单后汇率过期，旧单仍可处理 | 已有订单可按快照继续验证 | 成功 | ✅ | 144 | 87 | 426,481 | — |
| ESC-TAMPER-08 | 下单后管理员调低 cap，只影响新单 | 只影响后续新单 | 触发 ExceedsUsdCap | ✅ | 180 | 18 | — | — |
| ESC-TAMPER-09 | 提交 proof 时篡改 payee hash → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 57 | 17 | — | — |
| ESC-TAMPER-10 | FIAT 订单处于 WAITING 时，商家不能提走被占用抵押 | pendingAmount 锁定在途订单，超提应拒绝 | 触发 InsufficientPendingLocked（符合预期） | ✅ | 37 | 19 | — | — |
| ESC-TAMPER-11 | 错误时机 cleanup 不应影响有效未过期订单 | 仅过期单被收敛，不影响未过期有效单 | 成功 | ✅ | 160 | 107 | 426,421 | — |
| ESC-TAMPER-12 | deadline 边界：==deadline 可过，>deadline 必拒绝 | 边界行为稳定，>deadline 必拒绝 | 触发 OutOfDeadline | ✅ | 199 | 17 | — | — |
| ESC-TAMPER-13 | 旧订单必须使用下单时商家收款哈希；改哈希后用新值签旧单会失败 | 旧订单按下单快照校验，使用新哈希应拒绝 | 触发 OrderBindingHashMismatch（符合预期） | ✅ | 84 | 16 | — | — |

## AlipayPlatformVerifier

**结果：** 37 / 37 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) | 失败原因 |
|---|---------|---------|------|:----:|----------:|------------:|----------------:|---------|
| ALI-FLOW-01 | 买家支付验证成功，txId=keccak(orderId) | 返回 txId=keccak(orderId) | 成功 | ✅ | 168 | 119 | 376,329 | — |
| ALI-FLOW-02 | 商家收款验证成功，txId=keccak(orderId) | 返回 txId=keccak(orderId) | 成功 | ✅ | 192 | 135 | 363,774 | — |
| ALI-FLOW-03 | 边界 gmtSuccess == creation 允许通过 | 成功 | 成功 | ✅ | 153 | 117 | 376,353 | — |
| ALI-FLOW-04 | 边界 gmtSuccess == deadline 允许通过 | 成功 | 成功 | ✅ | 146 | 112 | 376,341 | — |
| ALI-FLOW-05 | orderId 成功后落库 usedAlipayOrderIds=true | 为 true | 成功 | ✅ | 188 | 142 | 376,353 | — |
| ALI-ERR-01 | 非 TLSNVerifier（普通地址）调用 verify* → only TLSNVerifier | revert: only TLSNVerifier | 触发 only TLSNVerifier | ✅ | 20 | 18 | — | — |
| ALI-ERR-02 | status 非 SUCCESS → AlipayPaymentNotCompleted | 触发 AlipayPaymentNotCompleted | 触发 AlipayPaymentNotCompleted | ✅ | 127 | 77 | — | — |
| ALI-ERR-03 | bizType 非 TRANSFER → InvalidAlipayBizType | 触发 InvalidAlipayBizType | 触发 InvalidAlipayBizType | ✅ | 115 | 80 | — | — |
| ALI-ERR-04 | 买家流金额不匹配 → PaymentAmountMismatch | 触发 PaymentAmountMismatch | 触发 PaymentAmountMismatch | ✅ | 121 | 79 | — | — |
| ALI-ERR-05 | 商家流金额不匹配 → ReceivedAmountMismatch | 触发 ReceivedAmountMismatch | 触发 ReceivedAmountMismatch | ✅ | 105 | 68 | — | — |
| ALI-ERR-06 | orderId 重放 → DuplicateAlipayOrderId | 触发 DuplicateAlipayOrderId | 触发 DuplicateAlipayOrderId | ✅ | 233 | 53 | — | — |
| ALI-ERR-07 | 付款早于下单 → AlipayTransferTooOld | 触发 AlipayTransferTooOld | 触发 AlipayTransferTooOld | ✅ | 89 | 55 | — | — |
| ALI-ERR-08 | 付款晚于截止 → AlipayTransferDateExpired | 触发 AlipayTransferDateExpired | 触发 AlipayTransferDateExpired | ✅ | 71 | 44 | — | — |
| ALI-ERR-09 | 缺 payAmount 字段 → MissingAlipayField | 触发 MissingAlipayField | 触发 MissingAlipayField | ✅ | 78 | 48 | — | — |
| ALI-ERR-10 | 缺 status 字段 → MissingAlipayField | 触发 MissingAlipayField | 触发 MissingAlipayField | ✅ | 76 | 50 | — | — |
| ALI-ERR-11 | 缺 bizType 字段 → MissingAlipayField | 触发 MissingAlipayField | 触发 MissingAlipayField | ✅ | 74 | 47 | — | — |
| ALI-ERR-12 | 缺 orderId 字段 → MissingAlipayField | 触发 MissingAlipayField | 触发 MissingAlipayField | ✅ | 75 | 45 | — | — |
| ALI-ERR-13 | 缺 gmtSuccess 字段 → MissingAlipayField | 触发 MissingAlipayField | 触发 MissingAlipayField | ✅ | 91 | 49 | — | — |
| ALI-ERR-14 | 时间格式异常 → parser revert | parser revert（日期解析失败） | revert匹配 /bad datetime/ | ✅ | 68 | 41 | — | — |
| ALI-ATT-01 | 跨订单 orderId replay → DuplicateAlipayOrderId | 触发 DuplicateAlipayOrderId | 触发 DuplicateAlipayOrderId | ✅ | 282 | 45 | — | — |
| ALI-ATT-02 | 旧支付复用攻击 → AlipayTransferTooOld | 触发 AlipayTransferTooOld | 触发 AlipayTransferTooOld | ✅ | 72 | 43 | — | — |
| ALI-ATT-03 | 延时提交攻击 → AlipayTransferDateExpired | 触发 AlipayTransferDateExpired | 触发 AlipayTransferDateExpired | ✅ | 66 | 41 | — | — |
| ALI-ATT-04 | 字段删减绕过 → MissingAlipayField | 触发 MissingAlipayField | 触发 MissingAlipayField | ✅ | 76 | 49 | — | — |
| ALI-ATT-05 | 直连平台合约绕过 TLSN（普通地址）→ only TLSNVerifier | onlyVerifier 拦截 | 触发 only TLSNVerifier | ✅ | 18 | 16 | — | — |
| ALI-ATT-06 | 伪造状态码 → AlipayPaymentNotCompleted | 触发 AlipayPaymentNotCompleted | 触发 AlipayPaymentNotCompleted | ✅ | 109 | 72 | — | — |
| ALI-ATT-07 | 伪造业务类型 → InvalidAlipayBizType | 触发 InvalidAlipayBizType | 触发 InvalidAlipayBizType | ✅ | 114 | 54 | — | — |
| ALI-ATT-08 | 不可信 payment server → NotTrustedPaymentServer | TLSN 层 NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | ✅ | 51 | 25 | — | — |
| ALI-TAMPER-01 | 商家改汇率后旧单 proof 仍可通过 | 旧单仍可按快照完成（D-1） | 成功 | ✅ | 223 | 155 | 376,894 | — |
| ALI-TAMPER-02 | proof 使用错误 rateVersion → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 52 | 17 | — | — |
| ALI-TAMPER-03 | 改 buyer/payee 绑定 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 56 | 18 | — | — |
| ALI-TAMPER-04 | FIAT WAITING 订单 cancel → NotPending | NotPending（D-2） | 触发 NotPending | ✅ | 38 | 15 | — | — |
| ALI-TAMPER-05 | 非买家取消 PENDING 订单 → NotAllowed | NotAllowed（PENDING 路径） | 触发 NotAllowed | ✅ | 37 | 16 | — | — |
| ALI-TAMPER-06 | 非商家提交 FIAT 证明 → WrongId（当前实现） | 触发 WrongId | 触发 WrongId | ✅ | 47 | 16 | — | — |
| ALI-TAMPER-07 | 订单完成后重复提交 proof：cleanup 后 OrderNotFound；未 cleanup 时 NotPending | cleanup 后 `OrderNotFound`；未 cleanup 时 `NotPending` | 触发 OrderNotFound + NotPending | ✅ | 311 | 13 | — | — |
| ALI-TAMPER-08 | 商家更新支付哈希后复用旧 proof 仍可通过 | 成功 | 成功 | ✅ | 113 | 80 | 376,918 | — |
| ALI-TAMPER-09 | 非营业时段下单 → MerchantClosed | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | 43 | 29 | — | — |
| ALI-TAMPER-10 | 改支付哈希后用新哈希签旧订单 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 49 | 14 | — | — |

## WisePlatformVerifier

**结果：** 34 / 34 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) | 失败原因 |
|---|---------|---------|------|:----:|----------:|------------:|----------------:|---------|
| WISE-FLOW-01 | 买家支付验证成功，txId=transferId | 成功 | 成功 | ✅ | 250 | 180 | 426,457 | — |
| WISE-FLOW-02 | 商家收款验证成功，txId=transferId | 成功 | 成功 | ✅ | 226 | 161 | 413,811 | — |
| WISE-FLOW-03 | 时间边界 dateMs/1000 == orderCreationTime 允许通过 | 成功 | 成功 | ✅ | 222 | 159 | 426,469 | — |
| WISE-FLOW-04 | 时间边界 dateMs/1000 == orderDeadline 允许通过 | 成功 | 成功 | ✅ | 178 | 137 | 426,469 | — |
| WISE-FLOW-05 | transferId 成功后落库 usedTransferIds=true | 为 true | 成功 | ✅ | 150 | 107 | 426,481 | — |
| WISE-ERR-01 | 非 TLSNVerifier 直接调用 verify* → only TLSNVerifier | revert: only TLSNVerifier | 触发 only TLSNVerifier | ✅ | 25 | 25 | — | — |
| WISE-ERR-02 | proof 数量不足（仅 transfer 或 contacts） | 越界/泛化 revert | revert匹配 /(0x32\|out-of-bounds\|panic\|revert)/ | ✅ | 115 | 27 | — | — |
| WISE-ERR-03 | proof 顺序颠倒 [transfer, contacts] | 触发 MissingWiseField | 触发 MissingWiseField | ✅ | 63 | 34 | — | — |
| WISE-ERR-04 | state 不匹配 → PaymentNotCompleted | 触发 PaymentNotCompleted | 触发 PaymentNotCompleted | ✅ | 79 | 52 | — | — |
| WISE-ERR-05 | amount 不匹配 → PaymentAmountMismatch | 触发 PaymentAmountMismatch | 触发 PaymentAmountMismatch | ✅ | 80 | 54 | — | — |
| WISE-ERR-06 | currency 不匹配 → CurrencyMismatch | 触发 CurrencyMismatch | 触发 CurrencyMismatch | ✅ | 79 | 52 | — | — |
| WISE-ERR-07 | transferId 重放 → DuplicateTransferId | 触发 DuplicateTransferId | 触发 DuplicateTransferId | ✅ | 211 | 43 | — | — |
| WISE-ERR-08 | 付款早于下单 → WiseTransferTooOld | 触发 WiseTransferTooOld | 触发 WiseTransferTooOld | ✅ | 123 | 91 | — | — |
| WISE-ERR-09 | 付款晚于截止 → TransferDateExpired | 触发 TransferDateExpired | 触发 TransferDateExpired | ✅ | 96 | 51 | — | — |
| WISE-ERR-10 | 缺 state 字段 → MissingWiseField | 触发 MissingWiseField | 触发 MissingWiseField | ✅ | 79 | 42 | — | — |
| WISE-ERR-11 | 缺 targetAmount 字段 → MissingWiseField | 触发 MissingWiseField | 触发 MissingWiseField | ✅ | 76 | 41 | — | — |
| WISE-ERR-12 | 缺 targetCurrency 字段 → MissingWiseField | 触发 MissingWiseField | 触发 MissingWiseField | ✅ | 68 | 37 | — | — |
| WISE-ERR-13 | 缺 id 字段 → MissingWiseField | 触发 MissingWiseField | 触发 MissingWiseField | ✅ | 87 | 51 | — | — |
| WISE-ERR-14 | 缺 date 字段 → MissingWiseField | 触发 MissingWiseField | 触发 MissingWiseField | ✅ | 120 | 70 | — | — |
| WISE-ATT-01 | 跨订单 transferId replay → DuplicateTransferId | 触发 DuplicateTransferId | 触发 DuplicateTransferId | ✅ | 335 | 95 | — | — |
| WISE-ATT-02 | 旧转账复用攻击 → WiseTransferTooOld | 触发 WiseTransferTooOld | 触发 WiseTransferTooOld | ✅ | 115 | 61 | — | — |
| WISE-ATT-03 | 延迟提交攻击 → TransferDateExpired | 触发 TransferDateExpired | 触发 TransferDateExpired | ✅ | 90 | 52 | — | — |
| WISE-ATT-04 | 伪造 amount/currency → 参数校验拒绝 | 与 params 不符被拒绝 | 触发 PaymentAmountMismatch / CurrencyMismatch | ✅ | 83 | 49 | — | — |
| WISE-ATT-05 | 弱化 contacts proof（文档性用例） | 由 TLSN + server 机制保护（文档性用例） | 成功 | ✅ | 159 | 126 | 497,773 | — |
| WISE-ATT-06 | 直连调用平台合约绕过 TLSN → only TLSNVerifier | onlyVerifier 拦截 | 触发 only TLSNVerifier | ✅ | 13 | 12 | — | — |
| WISE-ATT-07 | session replay（跨 proof）→ SessionAlreadyUsed | 在 TLSNVerifier 层 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ | 64 | 20 | — | — |
| WISE-ATT-08 | 不可信 payment server → NotTrustedPaymentServer | 在 TLSNVerifier 层 NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | ✅ | 44 | 22 | — | — |
| WISE-TAMPER-01 | 商家改支付哈希后沿用旧 proof 仍可通过 | 成功 | 成功 | ✅ | 146 | 106 | 426,469 | — |
| WISE-TAMPER-02 | 改 rateVersion 提交 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 59 | 18 | — | — |
| WISE-TAMPER-03 | 改 buyer/payee 绑定 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 55 | 17 | — | — |
| WISE-TAMPER-04 | 商家更新汇率后旧单 proof 仍可通过 | 旧单仍可完成（D-1） | 成功 | ✅ | 156 | 110 | 426,481 | — |
| WISE-TAMPER-05 | 订单完成后重复提交同 proof | OutOfDeadline（Escrow 清理后） | 触发 OutOfDeadline / OrderNotFound | ✅ | 181 | 17 | — | — |
| WISE-TAMPER-06 | 伪造同平台不同商家上下文 → 绑定不一致拒绝 | 绑定字段不一致被拒绝 | 触发 OrderBindingHashMismatch | ✅ | 182 | 15 | — | — |
| WISE-TAMPER-07 | 改支付哈希后用新哈希签旧订单 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 58 | 14 | — | — |

## Integration — 跨合约联动

**结果：** 11 / 11 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) | 失败原因 |
|---|---------|---------|------|:----:|----------:|------------:|----------------:|---------|
| INT-01 | Wise-CRYPTO 全链路完成，买家收币 | 成功 | 成功 | ✅ | 200 | 139 | 426,457 | — |
| INT-02 | Wise-FIAT 全链路完成，商家收币 | 成功 | 成功 | ✅ | 234 | 159 | 413,835 | — |
| INT-03 | Alipay-CRYPTO 全链路完成，买家收币 | 成功 | 成功 | ✅ | 213 | 141 | 376,353 | — |
| INT-04 | Alipay-FIAT 全链路完成，商家收币 | 成功 | 成功 | ✅ | 248 | 176 | 363,774 | — |
| INT-05 | deadline 前 1 秒可过，后 1 秒拒绝 | 触发 OutOfDeadline | 触发 OutOfDeadline | ✅ | 301 | 33 | — | — |
| INT-06 | 同 session 跨平台复用 → SessionAlreadyUsed | 触发 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ | 185 | 22 | — | — |
| INT-07 | 跨链 proof 注入 → WrongChainId | 触发 WrongChainId / RPC | 触发 WrongChainId / RPC | ✅ | 42 | 14 | — | — |
| INT-08 | 批量挂单+cleanup 压力，状态和资金一致 | 成功 | 成功 | ✅ | 314 | 33 | 369,122 | — |
| INT-09 | 改商家支付身份后，旧 hash proof 仍可通过 | 成功 | 成功 | ✅ | 169 | 121 | 426,469 | — |
| INT-10 | 下单后关门/下架，不影响已有订单结算 | 成功 | 成功 | ✅ | 185 | 111 | 426,469 | — |
| INT-11 | 改支付身份后用新 hash proof 打旧单 → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ | 73 | 17 | — | — |

## BusinessHours

**结果：** 14 / 14 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) | 失败原因 |
|---|---------|---------|------|:----:|----------:|------------:|----------------:|---------|
| BH-01 | 默认状态（无 setBusinessHours/openNow）→ isMerchantOpen = false | isMerchantOpen 为 false | 成功 | ✅ | — | — | — | — |
| BH-02 | 关门时下单 → MerchantClosed | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | — | — | — | — |
| BH-03 | openNow → isMerchantOpen = true，下单成功 | 成功 | 成功 | ✅ | — | — | — | — |
| BH-04 | openNow 后 closeNow → isMerchantOpen = false | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | — | — | — | — |
| BH-05 | openNow 后 clearManualOverride → 回到时间表（默认关闭） | 成功 | 成功 | ✅ | — | — | — | — |
| BH-06 | setBusinessHours 配合 openNow override → isMerchantOpen = true | 成功 | 成功 | ✅ | — | — | — | — |
| BH-07 | setBusinessHours + clearManualOverride，时间窗口内 → isMerchantOpen = true | 成功 | 成功 | ✅ | — | — | — | — |
| BH-08 | 无效工作日（activeDays=0）→ isMerchantOpen = false | 成功 | 成功 | ✅ | — | — | — | — |
| BH-09 | 全天激活（activeDays=0x7F），窗口 00:00–23:59 → 始终开放 | 成功 | 成功 | ✅ | — | — | — | — |
| BH-10 | 跨午夜时间表（22:00–06:00，每日），当前时间 23:00 → 开放 | 成功 | 成功 | ✅ | 95 | — | — | — |
| BH-11 | 跨午夜时间表（22:00–06:00，每日），当前时间 12:00 → 关闭 | 成功 | 成功 | ✅ | 75 | — | — | — |
| BH-12 | placeOrder 时 manualOverride=2（closeNow）→ MerchantClosed | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | 93 | — | — | — |
| BH-13 | placeOrder 全天开放时间表（00:00–23:59）→ 成功 | 成功 | 成功 | ✅ | 80 | — | — | — |
| BH-14 | 不同 productId 的营业时间相互独立 | 触发 MerchantClosed | 触发 MerchantClosed | ✅ | 92 | — | — | — |

## Cap

**结果：** 6 / 6 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 |
|---|---------|---------|------|:----:|
| CAP-01 | 金额 == maxOrderAmount（1000 USDT）→ 下单成功 | 成功 | 成功 | ✅ |
| CAP-02 | 金额 < maxOrderAmount（999 USDT）→ 下单成功 | 成功 | 成功 | ✅ |
| CAP-03 | 金额 > maxOrderAmount（1001 USDT）→ ExceedsUsdCap | 触发 ExceedsUsdCap | 触发 ExceedsUsdCap | ✅ |
| CAP-04 | 管理员降低上限至 500 USDT → 600 USDT 订单触发 ExceedsUsdCap | 触发 ExceedsUsdCap | 触发 ExceedsUsdCap | ✅ |
| CAP-05 | FIAT 产品 — 金额 > maxOrderAmount → ExceedsUsdCap | 触发 ExceedsUsdCap | 触发 ExceedsUsdCap | ✅ |
| CAP-06 | D-3 — 单笔限额非累计（管理员提高上限后两笔 600 USDT 订单均成功） | 成功 | 成功 | ✅ |

## Rate

**结果：** 10 / 10 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 |
|---|---------|---------|------|:----:|
| RATE-01 | 未 publishRate 时下单 → RateNotPublished | 触发 RateNotPublished | 触发 RateNotPublished | ✅ |
| RATE-02 | 首次 publishRate → version == 1 | version 为 1 | version 为 1 | ✅ |
| RATE-03 | 二次 publishRate → version == 2 | version 为 2 | version 为 2 | ✅ |
| RATE-04 | placeOrder 将 rateVersion 快照存入 Order 结构体 | 快照 rateVersion=1 | 成功 | ✅ |
| RATE-05 | 二次 publishRate 后 placeOrder 快照 version 2 | 快照 rateVersion=2 | 成功 | ✅ |
| RATE-06 | D-1：placeOrder 后 publishRate 不影响已有订单 proof | 旧单按旧 rateVersion 验证 | 成功 | ✅ |
| RATE-07 | D-1：用新 rateVersion 构建旧订单 proof → OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | 触发 OrderBindingHashMismatch | ✅ |
| RATE-08 | placeOrder 时汇率已过期 → RateExpired | 触发 RateExpired | 触发 RateExpired | ✅ |
| RATE-09 | expiresAt == 0 表示永不过期 → placeOrder 成功 | 成功 | 成功 | ✅ |
| RATE-10 | 汇率在边界时间发布（now + 1s）→ 先成功后触发 RateExpired | 触发 RateExpired | 触发 RateExpired | ✅ |

## TLSNVerifier

**结果：** 28 / 28 通过

| # | 测试内容 | 预期结果 | 结果 | 通过 |
|---|---------|---------|------|:----:|
| TLSN-01 | 两步管理员移交（proposeAdmin → acceptAdmin） | 成功 | 成功 | ✅ |
| TLSN-02 | 非管理员调用 proposeAdmin → OnlyAdmin | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ |
| TLSN-03 | 非 pendingAdmin 调用 acceptAdmin → NotPendingAdmin | 触发 NotPendingAdmin | 触发 NotPendingAdmin | ✅ |
| TLSN-04 | proposeAdmin 零地址 → ZeroAddress | 触发 ZeroAddress | 触发 ZeroAddress | ✅ |
| TLSN-05 | 新增信任 verifier 地址 | 成功 | 成功 | ✅ |
| TLSN-06 | 移除信任 verifier 地址 | 成功 | 成功 | ✅ |
| TLSN-07 | 非管理员新增信任 verifier → OnlyAdmin | 触发 OnlyAdmin | 触发 OnlyAdmin | ✅ |
| TLSN-08 | 新增并移除 KYB server（事件验证） | 成功 | 成功 | ✅ |
| TLSN-09 | 管理员设置授权调用方 | 成功 | 成功 | ✅ |
| TLSN-10 | 非授权调用方调用 verifyProof → not authorized | revert: not authorized | revert: not authorized | ✅ |
| TLSN-11 | 验证有效 proof → 触发 TLSNProofVerified 事件 | 成功 | 成功 | ✅ |
| TLSN-12 | 链 ID 错误 → WrongChainId | 触发 WrongChainId | 触发 WrongChainId | ✅ |
| TLSN-13 | sessionId 重复 → SessionAlreadyUsed | 触发 SessionAlreadyUsed | 触发 SessionAlreadyUsed | ✅ |
| TLSN-14 | 篡改 commitment opening → CommitmentOpeningMismatch | 触发 CommitmentOpeningMismatch | 触发 CommitmentOpeningMismatch | ✅ |
| TLSN-15 | 篡改 commitmentsHash → CommitmentsHashMismatch | 触发 CommitmentsHashMismatch | 触发 CommitmentsHashMismatch | ✅ |
| TLSN-16 | 不可信 verifier 签名 → UntrustedVerifier | 触发 UntrustedVerifier | 触发 UntrustedVerifier | ✅ |
| TLSN-17 | 验证有效 KYB proof | 成功 | 成功 | ✅ |
| TLSN-18 | KYC 状态非 verified → KYCNotVerified | 触发 KYCNotVerified | 触发 KYCNotVerified | ✅ |
| TLSN-19 | KYB server 不可信 → NotTrustedKYBServer | 触发 NotTrustedKYBServer | 触发 NotTrustedKYBServer | ✅ |
| TLSN-20 | revealedItems 为空 → MissingRevealedItems | 触发 MissingRevealedItems | 触发 MissingRevealedItems | ✅ |
| TLSN-21 | 通过 verifyAndDelegate 验证 Wise 买家支付 | 成功 | 成功 | ✅ |
| TLSN-22 | 通过 verifyAndDelegate 验证 Wise 商家发款 | 成功 | 成功 | ✅ |
| TLSN-23 | 平台未注册 → PlatformNotRegistered | 触发 PlatformNotRegistered | 触发 PlatformNotRegistered | ✅ |
| TLSN-24 | proof serverName 不可信 → NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | 触发 NotTrustedPaymentServer | ✅ |
| TLSN-25 | Wise 支付金额不匹配（通过 delegate）→ PaymentAmountMismatch | 触发 PaymentAmountMismatch | 触发 PaymentAmountMismatch | ✅ |
| TLSN-26 | Wise 货币不匹配（通过 delegate）→ CurrencyMismatch | 触发 CurrencyMismatch | 触发 CurrencyMismatch | ✅ |
| TLSN-27 | Wise 转账 proof 缺失必填字段 → MissingWiseField | 触发 MissingWiseField | 触发 MissingWiseField | ✅ |
| TLSN-28 | 通过 verifyAndDelegate 验证 Alipay 买家支付 | 成功 | 成功 | ✅ |

---

## 预期与实际不一致清单（通过但不一致）

- 无（全部 276 用例通过，无不一致）
