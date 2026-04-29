# Smart Contract Test Results

> Run date: 2026-04-30  
> Network: `hardhatMainnet` (Hardhat fork, edr-simulated l1)  
> Solidity: `0.8.28` (evm target: cancun)  
> Summary: **285 passing, 0 failing** ✅

---

## Overall Summary

| Test Suite              | Tests | Passed | Failed |
|-------------------------|------:|-------:|-------:|
| C2CAdmin                |    60 |     60 |      0 |
| C2CEscrow (V4)          |    62 |     62 |      0 |
| WisePlatformVerifier    |    34 |     34 |      0 |
| AlipayPlatformVerifier  |    37 |     37 |      0 |
| Integration (V4)        |    11 |     11 |      0 |
| TLSNVerifier            |    30 |     30 |      0 |
| Rate                    |     9 |      9 |      0 |
| Cap                     |     6 |      6 |      0 |
| BusinessHours           |    14 |     14 |      0 |
| Bond (V4)               |    22 |     22 |      0 |
| **Total**               | **285** | **285** | **0** |

---

## C2CAdmin — 60/60 ✅

### FLOW — 正常流程

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| ADM-FLOW-01 | proposeAdmin->acceptAdmin 管理员切换成功                   | ✅   |         5 |           2 |           27676 |
| ADM-FLOW-02 | addCryptoInfo 事件+计数+1                               | ✅   |         3 |           1 |          105810 |
| ADM-FLOW-03 | addFiatInfo 事件+计数+1                                 | ✅   |         3 |           1 |           99801 |
| ADM-FLOW-04 | deactivateAsset->activateAsset 状态正确切换                | ✅   |         4 |           2 |           34216 |
| ADM-FLOW-05 | registerMerchantByAdmin 商家激活KYB=true                | ✅   |         3 |           2 |           74966 |
| ADM-FLOW-06 | registerMerchant(kybProof) MerchantRegistered         | ✅   |         6 |           3 |          142236 |
| ADM-FLOW-07 | setMerchantPaymentInfoForPlatform(WISE) isSet=true    | ✅   |         4 |           2 |          101698 |
| ADM-FLOW-07A | 商家可分别设置 Wise/Alipay 支付信息                          | ✅   |         6 |           1 |          101710 |
| ADM-FLOW-07B | 修改某平台支付信息且不影响其他平台                                 | ✅   |         7 |           2 |           47598 |
| ADM-FLOW-07C | 未设置的平台读取返回 isSet=false                             | ✅   |         5 |           2 |          101698 |
| ADM-FLOW-08 | setMerchantFiatAccount 账户字符串保存                      | ✅   |        20 |           2 |           49701 |
| ADM-FLOW-09 | 首次publishRate version=1 publishedAt>0               | ✅   |         4 |           2 |           72239 |
| ADM-FLOW-10 | 二次publishRate version单调递增                           | ✅   |         4 |           1 |           38039 |
| ADM-FLOW-11 | setBusinessHours open/close/daymask正确               | ✅   |         3 |           1 |           49973 |
| ADM-FLOW-12 | openNow/closeNow/clearManualOverride覆盖正确            | ✅   |         7 |           1 |           26483 |
| ADM-FLOW-13 | setMaxOrderAmount 新限额立即生效                           | ✅   |         2 |           2 |           30117 |
| ADM-FLOW-14 | setAuthorizedCaller 授权映射正确更新                        | ✅   |         4 |           2 |           46528 |
| ADM-FLOW-15 | incrementSellCount CRYPTO/FIAT计数独立                  | ✅   |         6 |           4 |          200513 |

### ERR — 错误拦截

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|
| ADM-ERR-01  | 非admin proposeAdmin → OnlyAdmin                      | ✅   |         9 |           9 |
| ADM-ERR-02  | 非pendingAdmin acceptAdmin → NotPendingAdmin          | ✅   |         8 |           8 |
| ADM-ERR-03  | proposeAdmin(0x0) → ZeroAddress                       | ✅   |         3 |           3 |
| ADM-ERR-04  | 非admin addCryptoInfo → OnlyAdmin                     | ✅   |         1 |           1 |
| ADM-ERR-05  | 非admin addFiatInfo → OnlyAdmin                       | ✅   |         2 |           2 |
| ADM-ERR-06  | 重复activateAsset → AlreadyActive                     | ✅   |         2 |           2 |
| ADM-ERR-07  | 重复deactivateAsset → AlreadyInactive                 | ✅   |        54 |           1 |
| ADM-ERR-08  | activateAsset越界 → WrongId                           | ✅   |         2 |           2 |
| ADM-ERR-09  | 非商家publishRate → NotMerchant                        | ✅   |         2 |           2 |
| ADM-ERR-10  | expiresAt<=now publishRate → RateExpired              | ✅   |         2 |           2 |
| ADM-ERR-11  | 非商家setBusinessHours → NotMerchant                   | ✅   |         2 |           2 |
| ADM-ERR-12  | 非商家openNow/closeNow → NotMerchant                   | ✅   |         3 |           1 |
| ADM-ERR-13  | 非admin setMaxOrderAmount → OnlyAdmin                 | ✅   |         1 |           1 |
| ADM-ERR-14  | 非授权incrementSellCount → NotAuthorizedCaller         | ✅   |         2 |           2 |
| ADM-ERR-15  | 非商家setMerchantFiatAccount → NotMerchant             | ✅   |         1 |           1 |
| ADM-ERR-16  | setMerchantFiatAccount('') → EmptyAccount             | ✅   |         1 |           1 |
| ADM-ERR-17  | 非商家setMerchantPaymentInfoForPlatform → NotMerchant  | ✅   |         1 |           1 |
| ADM-ERR-18  | nameHash=0 → EmptyPaymentInfo                         | ✅   |         2 |           2 |
| ADM-ERR-18A | 未注册平台 → PlatformNotRegistered                       | ✅   |         1 |           1 |
| ADM-ERR-19  | 重复registerMerchantByAdmin → AlreadyRegistered        | ✅   |         2 |           2 |
| ADM-ERR-20  | KYB proof chainId错误 → WrongChainId                  | ✅   |         3 |           2 |
| ADM-ERR-21  | KYB同sessionId重放 → SessionAlreadyUsed                | ✅   |         9 |           3 |
| ADM-ERR-22  | KYB伪造签名 → UntrustedVerifier                         | ✅   |         5 |           3 |
| ADM-ERR-23  | KYB server未信任 → NotTrustedKYBServer                 | ✅   |         5 |           3 |
| ADM-ERR-24  | KYB status非verified → KYCNotVerified                 | ✅   |        14 |           4 |

### ATTACK — 攻击防御

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|
| ADM-ATT-01  | 非pending抢acceptAdmin → NotPendingAdmin              | ✅   |         5 |           2 |
| ADM-ATT-02  | 攻击者私钥签KYB proof → UntrustedVerifier                | ✅   |         4 |           3 |
| ADM-ATT-03  | 复用旧sessionId → SessionAlreadyUsed                   | ✅   |         7 |           2 |
| ADM-ATT-04  | tamper commitmentsHash → CommitmentsHashMismatch     | ✅   |         3 |           2 |
| ADM-ATT-05  | tamper blinderHex → CommitmentOpeningMismatch        | ✅   |         3 |           3 |
| ADM-ATT-06  | 非admin setAuthorizedCaller → OnlyAdmin               | ✅   |         1 |           1 |
| ADM-ATT-07  | 非admin setMaxOrderAmount → OnlyAdmin                 | ✅   |         2 |           2 |
| ADM-ATT-08  | 未注册地址publishRate → NotMerchant                     | ✅   |         1 |           1 |

### TAMPER — 流程篡改

| #            | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|--------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| ADM-TAMPER-01 | 连续publishRate版本严格递增不回退                             | ✅   |         6 |           1 |           38039 |
| ADM-TAMPER-02 | 短expiresAt: 先有效后过期                                 | ✅   |         4 |           — |               — |
| ADM-TAMPER-03 | openNow→closeNow 最新override生效                      | ✅   |         3 |           1 |           31522 |
| ADM-TAMPER-04 | closeNow→clearManualOverride回到时间表                  | ✅   |         3 |           2 |           26495 |
| ADM-TAMPER-05 | openNow后setBusinessHours保留manualOverride           | ✅   |         3 |           1 |           32885 |
| ADM-TAMPER-06 | isMerchantOpen按productId维度隔离                       | ✅   |         3 |           — |               — |
| ADM-TAMPER-07 | 管理员改限额立即生效仅影响新单                                   | ✅   |         3 |           1 |               — |
| ADM-TAMPER-08 | ⚠️ assetType=2 publishRate 当前允许(风险)               | ✅   |         2 |           1 |           72251 |
| ADM-TAMPER-09 | ⚠️ rate=0 publishRate 当前允许(风险)                    | ✅   |         2 |           2 |           33215 |

---

## C2CEscrow (V4) — 62/62 ✅

### ESC-FLOW

| #            | 测试内容                                                              | 通过 | 总时间(ms) |
|--------------|-----------------------------------------------------------------------|:----:|----------:|
| ESC-FLOW-01  | listCryptoProduct — merchant lists a CRYPTO product                   | ✅   |        75 |
| ESC-FLOW-02  | listFiatProduct — merchant lists a FIAT product                       | ✅   |        77 |
| ESC-FLOW-03  | placeOrder CRYPTO — PENDING status, collateral locked                 | ✅   |        77 |
| ESC-FLOW-04  | placeOrder FIAT — WAITING status, buyer escrow deposited              | ✅   |        67 |
| ESC-FLOW-05  | payOrderByPlatform (Wise CRYPTO) — order COMPLETED, crypto released   | ✅   |       135 |
| ESC-FLOW-06  | payOrderByPlatform (Alipay CRYPTO) — order COMPLETED                  | ✅   |       129 |
| ESC-FLOW-07  | receiveCryptoWithPlatformPayment (Wise FIAT) — COMPLETED              | ✅   |       143 |
| ESC-FLOW-08  | CRYPTO order timeout — EXPIRED, bond goes to merchant                 | ✅   |        92 |
| ESC-FLOW-09  | FIAT order timeout — EXPIRED, principal + bond claimable via BondVault | ✅  |        95 |
| ESC-FLOW-10  | addAmount / takeAmount — collateral management                        | ✅   |        80 |
| ESC-FLOW-11  | activeProduct / inactiveProduct                                       | ✅   |        78 |
| ESC-FLOW-12  | multiple orders from different buyers                                 | ✅   |        75 |
| ESC-FLOW-13  | cleanupProductExpired removes stale PENDING orders                    | ✅   |        82 |
| ESC-FLOW-14  | V4 cancelOrder → revert OrderCancellationDisabled                     | ✅   |        83 |

### ESC-ERR

| #            | 测试内容                                                              | 通过 | 总时间(ms) |
|--------------|-----------------------------------------------------------------------|:----:|----------:|
| ESC-ERR-01   | placeOrder on inactive product → ProductInactive                      | ✅   |        78 |
| ESC-ERR-02   | placeOrder when merchant is closed → MerchantClosed                   | ✅   |        69 |
| ESC-ERR-03   | placeOrder with zero amount → ZeroAmount                              | ✅   |        78 |
| ESC-ERR-04   | CRYPTO placeOrder exceeding collateral → InsufficientAvailable        | ✅   |        75 |
| ESC-ERR-05   | FIAT placeOrder with empty buyer info → BuyerPaymentInfoRequired      | ✅   |        76 |
| ESC-ERR-06   | duplicate placeOrder from same buyer → AlreadyHasActiveOrder          | ✅   |        66 |
| ESC-ERR-07   | rate not published → RateNotPublished                                 | ✅   |        65 |
| ESC-ERR-08   | payOrderByPlatform after deadline → OutOfDeadline                     | ✅   |        85 |
| ESC-ERR-09   | receiveCryptoWithPlatformPayment after deadline → OutOfDeadline       | ✅   |        85 |
| ESC-ERR-10   | payOrderByPlatform by non-buyer → NotAllowed                          | ✅   |        70 |
| ESC-ERR-11   | receiveCryptoWithPlatformPayment by non-merchant → wrong order        | ✅   |        86 |
| ESC-ERR-12   | placeOrder on wrong assetType → WrongId or ProductInactive            | ✅   |        79 |
| ESC-ERR-13   | takeAmount exceeds available → InsufficientPendingLocked              | ✅   |        81 |
| ESC-ERR-14   | payOrderByPlatform on non-existent order → OrderNotFound              | ✅   |        75 |
| ESC-ERR-15   | setManagers by non-admin → OnlyAdmin                                  | ✅   |        64 |
| ESC-ERR-16   | placeOrder amount exceeds USD cap → ExceedsUsdCap                     | ✅   |        77 |
| ESC-ERR-17   | FIAT 订单金额超过 collateral → revert InsufficientAvailable             | ✅   |        79 |
| ESC-ERR-18   | ManagersNotSet before placeOrder → ManagersNotSet                     | ✅   |        49 |
| ESC-ERR-19   | payOrderByPlatform on COMPLETED order → NotPending                    | ✅   |       123 |
| ESC-ERR-20   | activeProduct on already active → AlreadyActive                       | ✅   |        82 |
| ESC-ERR-21   | inactiveProduct on already inactive → AlreadyInactive                 | ✅   |        79 |
| ESC-ERR-22   | placeOrder on expired rate → RateExpired                              | ✅   |        73 |
| ESC-ERR-23   | non-merchant calls listCryptoProduct → NotMerchant                    | ✅   |        65 |
| ESC-ERR-24   | FIAT receiveCrypto on non-WAITING order → NotWaiting                  | ✅   |        78 |

### ESC-ATT

| #            | 测试内容                                                              | 通过 | 总时间(ms) |
|--------------|-----------------------------------------------------------------------|:----:|----------:|
| ESC-ATT-01   | wrong orderBindingHash in proof → OrderBindingHashMismatch            | ✅   |        83 |
| ESC-ATT-02   | proof for wrong chain ID → OrderBindingHashMismatch                   | ✅   |        78 |
| ESC-ATT-03   | proof for wrong orderId → OrderBindingHashMismatch                    | ✅   |        67 |
| ESC-ATT-04   | attacker replays used sessionId → SessionAlreadyUsed                  | ✅   |       143 |
| ESC-ATT-05   | tampered verifier signature → UntrustedVerifier                       | ✅   |        86 |
| ESC-ATT-06   | wrong transfer amount → PaymentAmountMismatch                         | ✅   |        96 |
| ESC-ATT-07   | wrong currency → CurrencyMismatch                                     | ✅   |       105 |
| ESC-ATT-08   | wrong transfer state → PaymentNotCompleted                            | ✅   |       106 |
| ESC-ATT-09   | transfer date after order deadline → TransferDateExpired              | ✅   |        90 |
| ESC-ATT-10   | duplicate Alipay orderId → DuplicateAlipayOrderId                     | ✅   |       142 |
| ESC-ATT-11   | FIAT proof submitted wrong merchant → OrderBindingHashMismatch        | ✅   |        89 |
| ESC-ATT-12   | FIAT proof submitted wrong payee → OrderBindingHashMismatch           | ✅   |        91 |
| ESC-ATT-13   | attacker spoofs platform proof for CRYPTO → verification fails        | ✅   |        88 |
| ESC-ATT-14   | merchant attempts to steal bond via fake settle call → OnlyEscrow     | ✅   |        80 |

### ESC-TAMPER

| #            | 测试内容                                                              | 通过 | 总时间(ms) |
|--------------|-----------------------------------------------------------------------|:----:|----------:|
| ESC-TAMPER-01 | modified commitmentsHash → CommitmentsHashMismatch                   | ✅   |        75 |
| ESC-TAMPER-02 | modified signature → UntrustedVerifier                               | ✅   |        81 |
| ESC-TAMPER-03 | Alipay status not 'succeed' → AlipayPaymentNotCompleted              | ✅   |       101 |
| ESC-TAMPER-04 | Alipay wrong bizType → InvalidAlipayBizType                          | ✅   |        97 |
| ESC-TAMPER-05~13 | additional tampering — covered by AlipayPlatform.ts / WisePlatform.ts | ✅ |       — |

### PAUSE — 紧急暂停机制

| #        | 测试内容                                                              | 通过 | 总时间(ms) |
|----------|-----------------------------------------------------------------------|:----:|----------:|
| PAUSE-01 | pause blocks placeOrder                                               | ✅   |        82 |
| PAUSE-02 | pause blocks payOrderByPlatform                                       | ✅   |        69 |
| PAUSE-03 | pause blocks receiveCryptoWithPlatformPayment                         | ✅   |        80 |
| PAUSE-04 | unpause re-enables placeOrder                                         | ✅   |        83 |
| PAUSE-05 | non-admin cannot pause → OnlyAdmin                                    | ✅   |        63 |

---

## WisePlatformVerifier — 34/34 ✅

### FLOW

| #            | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|--------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| WISE-FLOW-01 | 买家支付验证成功，txId=transferId                            | ✅   |        55 |          48 |          522367 |
| WISE-FLOW-02 | 商家收款验证成功，txId=transferId                            | ✅   |        48 |          40 |          521146 |
| WISE-FLOW-03 | 时间边界 dateMs/1000 == orderCreationTime 允许通过          | ✅   |        43 |          37 |          522403 |
| WISE-FLOW-04 | 时间边界 dateMs/1000 == orderDeadline 允许通过              | ✅   |        45 |          38 |          522391 |
| WISE-FLOW-05 | transferId 成功后落库 usedTransferIds=true               | ✅   |        57 |          39 |          522391 |

### ERR

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|
| WISE-ERR-01 | 非 TLSNVerifier 直接调用 verify*                         | ✅   |         4 |           3 |
| WISE-ERR-02 | proof 数量不足（仅 transfer 或 contacts）                   | ✅   |        22 |          10 |
| WISE-ERR-03 | proof 顺序颠倒 [transfer, contacts]                     | ✅   |        18 |          12 |
| WISE-ERR-04 | state 不匹配 → PaymentNotCompleted                     | ✅   |        27 |          19 |
| WISE-ERR-05 | amount 不匹配 → PaymentAmountMismatch                  | ✅   |        22 |          17 |
| WISE-ERR-06 | currency 不匹配 → CurrencyMismatch                     | ✅   |        27 |          21 |
| WISE-ERR-07 | transferId 重放 → DuplicateTransferId                 | ✅   |        76 |          18 |
| WISE-ERR-08 | 付款早于下单 → WiseTransferTooOld                         | ✅   |        24 |          17 |
| WISE-ERR-09 | 付款晚于截止 → TransferDateExpired                        | ✅   |        36 |          18 |
| WISE-ERR-10 | 缺 state 字段 → MissingWiseField                       | ✅   |        25 |          17 |
| WISE-ERR-11 | 缺 targetAmount 字段 → MissingWiseField                | ✅   |        22 |          16 |
| WISE-ERR-12 | 缺 targetCurrency 字段 → MissingWiseField              | ✅   |        24 |          17 |
| WISE-ERR-13 | 缺 id 字段 → MissingWiseField                          | ✅   |        25 |          18 |
| WISE-ERR-14 | 缺 date 字段 → MissingWiseField                        | ✅   |        19 |          14 |

### ATTACK

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| WISE-ATT-01 | 跨订单 transferId replay → DuplicateTransferId        | ✅   |        75 |          17 |               — |
| WISE-ATT-02 | 旧转账复用攻击 → WiseTransferTooOld                       | ✅   |        43 |          33 |               — |
| WISE-ATT-03 | 延迟提交攻击 → TransferDateExpired                       | ✅   |        35 |          24 |               — |
| WISE-ATT-04 | 伪造 amount/currency → 参数校验拒绝                        | ✅   |        28 |          20 |               — |
| WISE-ATT-05 | 弱化 contacts proof（文档性用例）                           | ✅   |        56 |          50 |          593858 |
| WISE-ATT-06 | 直连调用平台合约绕过 TLSN → only TLSNVerifier                | ✅   |         3 |           2 |               — |
| WISE-ATT-07 | session replay（跨 proof）→ SessionAlreadyUsed        | ✅   |         8 |           3 |               — |
| WISE-ATT-08 | 不可信 payment server → NotTrustedPaymentServer       | ✅   |         9 |           4 |               — |

### TAMPER

| #              | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|----------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| WISE-TAMPER-01 | 商家改支付哈希后沿用旧 proof 仍可通过                              | ✅   |        46 |          39 |          522403 |
| WISE-TAMPER-02 | 改 rateVersion 提交 → OrderBindingHashMismatch        | ✅   |         8 |           2 |               — |
| WISE-TAMPER-03 | 改 buyer/payee 绑定 → OrderBindingHashMismatch        | ✅   |         8 |           2 |               — |
| WISE-TAMPER-04 | 商家更新汇率后旧单 proof 仍可通过                                | ✅   |        59 |          45 |          522391 |
| WISE-TAMPER-05 | 订单完成后重复提交同 proof                                    | ✅   |        48 |           2 |               — |
| WISE-TAMPER-06 | 伪造同平台不同商家上下文 → 绑定不一致拒绝                             | ✅   |        22 |           2 |               — |
| WISE-TAMPER-07 | 改支付哈希后用新哈希签旧订单 → OrderBindingHashMismatch          | ✅   |         9 |           2 |               — |

---

## AlipayPlatformVerifier — 37/37 ✅

### FLOW

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| ALI-FLOW-01 | 买家支付验证成功，txId=keccak(orderId)                       | ✅   |        48 |          41 |          471896 |
| ALI-FLOW-02 | 商家收款验证成功，txId=keccak(orderId)                       | ✅   |        42 |          34 |          470595 |
| ALI-FLOW-03 | 边界 gmtSuccess == creation 允许通过                      | ✅   |        37 |          32 |          471884 |
| ALI-FLOW-04 | 边界 gmtSuccess == deadline 允许通过                      | ✅   |        36 |          30 |          471896 |
| ALI-FLOW-05 | orderId 成功后落库 usedAlipayOrderIds=true               | ✅   |        38 |          31 |          471884 |

### ERR

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|
| ALI-ERR-01  | 非 TLSNVerifier（普通地址）调用 verify* → only TLSNVerifier | ✅   |         3 |           2 |
| ALI-ERR-02  | status 非 SUCCESS → AlipayPaymentNotCompleted         | ✅   |        22 |          17 |
| ALI-ERR-03  | bizType 非 TRANSFER → InvalidAlipayBizType            | ✅   |        20 |          15 |
| ALI-ERR-04  | 买家流金额不匹配 → PaymentAmountMismatch                   | ✅   |        23 |          18 |
| ALI-ERR-05  | 商家流金额不匹配 → ReceivedAmountMismatch                  | ✅   |        27 |          17 |
| ALI-ERR-06  | orderId 重放 → DuplicateAlipayOrderId                  | ✅   |        67 |          15 |
| ALI-ERR-07  | 付款早于下单 → AlipayTransferTooOld                       | ✅   |        23 |          16 |
| ALI-ERR-08  | 付款晚于截止 → AlipayTransferDateExpired                  | ✅   |        21 |          16 |
| ALI-ERR-09  | 缺 payAmount 字段 → MissingAlipayField                  | ✅   |        24 |          17 |
| ALI-ERR-10  | 缺 status 字段 → MissingAlipayField                    | ✅   |        20 |          14 |
| ALI-ERR-11  | 缺 bizType 字段 → MissingAlipayField                   | ✅   |        21 |          15 |
| ALI-ERR-12  | 缺 orderId 字段 → MissingAlipayField                   | ✅   |        20 |          14 |
| ALI-ERR-13  | 缺 gmtSuccess 字段 → MissingAlipayField                | ✅   |        19 |          13 |
| ALI-ERR-14  | 时间格式异常 → InvalidDatetimeFormat                     | ✅   |        30 |          25 |

### ATTACK

| #           | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) |
|-------------|-------------------------------------------------------|:----:|----------:|------------:|
| ALI-ATT-01  | 跨订单 orderId replay → DuplicateAlipayOrderId        | ✅   |        68 |          17 |
| ALI-ATT-02  | 旧支付复用攻击 → AlipayTransferTooOld                     | ✅   |        22 |          16 |
| ALI-ATT-03  | 延时提交攻击 → AlipayTransferDateExpired                 | ✅   |        21 |          15 |
| ALI-ATT-04  | 字段删减绕过 → MissingAlipayField                        | ✅   |        22 |          16 |
| ALI-ATT-05  | 直连平台合约绕过 TLSN → only TLSNVerifier                  | ✅   |         3 |           2 |
| ALI-ATT-06  | 伪造状态码 → AlipayPaymentNotCompleted                  | ✅   |        20 |          15 |
| ALI-ATT-07  | 伪造业务类型 → InvalidAlipayBizType                      | ✅   |        22 |          17 |
| ALI-ATT-08  | 不可信 payment server → NotTrustedPaymentServer       | ✅   |        14 |           5 |

### TAMPER

| #              | 测试内容                                              | 通过 | 总时间(ms) | 验证时间(ms) | Gas (gas units) |
|----------------|-------------------------------------------------------|:----:|----------:|------------:|----------------:|
| ALI-TAMPER-01  | 商家改汇率后旧单 proof 仍可通过                                 | ✅   |        55 |          48 |          472389 |
| ALI-TAMPER-02  | proof 使用错误 rateVersion → OrderBindingHashMismatch  | ✅   |        11 |           2 |               — |
| ALI-TAMPER-03  | 改 buyer/payee 绑定 → OrderBindingHashMismatch        | ✅   |         6 |           2 |               — |
| ALI-TAMPER-04  | FIAT WAITING 订单 cancel → OrderCancellationDisabled  | ✅   |         4 |           1 |               — |
| ALI-TAMPER-05  | 非买家取消 PENDING 订单 → OrderCancellationDisabled       | ✅   |         4 |           1 |               — |
| ALI-TAMPER-06  | 非商家提交 FIAT 证明 → WrongId                            | ✅   |         5 |           1 |               — |
| ALI-TAMPER-07  | 订单完成后重复提交 proof → OrderNotFound / NotPending       | ✅   |        83 |           4 |               — |
| ALI-TAMPER-08  | 商家更新支付哈希后复用旧 proof 仍可通过                             | ✅   |        39 |          33 |          472401 |
| ALI-TAMPER-09  | 非营业时段下单 → MerchantClosed                           | ✅   |         4 |           2 |               — |
| ALI-TAMPER-10  | 改支付哈希后用新哈希签旧订单 → OrderBindingHashMismatch          | ✅   |         8 |           2 |               — |

---

## Integration (V4) — 11/11 ✅

| #      | 测试内容                                                             | 通过 | 总时间(ms) |
|--------|----------------------------------------------------------------------|:----:|----------:|
| INT-01 | CRYPTO end-to-end — placeOrder → pay → claim bond                    | ✅   |       119 |
| INT-02 | FIAT end-to-end — placeOrder → receiveCrypto → claim bond            | ✅   |       116 |
| INT-03 | CRYPTO timeout — cleanupExpired → merchant claimable increases       | ✅   |        86 |
| INT-04 | FIAT timeout — principal + bond claimable by buyer via BondVault     | ✅   |        86 |
| INT-05 | multi-platform parallel orders (Wise CRYPTO + Alipay FIAT)           | ✅   |       141 |
| INT-06 | high-risk buyer pays larger bond                                     | ✅   |       101 |
| INT-07 | FIAT timeout reduces merchant collateral, records timeout in riskManager | ✅ |      89 |
| INT-08 | cancelOrder disabled — revert OrderCancellationDisabled              | ✅   |        95 |
| INT-09 | double settle via completed order — OrderBondAlreadySettled          | ✅   |       114 |
| INT-10 | cross-platform sessionId reuse rejected — SessionAlreadyUsed         | ✅   |       148 |
| INT-11 | bond claim — ERC20 actually transferred to claimant                  | ✅   |       131 |

---

## TLSNVerifier — 30/30 ✅

### Admin transfer

| # | 测试内容                                      | 通过 |
|---|-----------------------------------------------|:----:|
| — | should propose and accept admin               | ✅   |
| — | should revert proposeAdmin from non-admin     | ✅   |
| — | should revert acceptAdmin from non-pending    | ✅   |
| — | should revert proposeAdmin with zero address  | ✅   |

### Trusted verifier management

| # | 测试内容                                         | 通过 |
|---|--------------------------------------------------|:----:|
| — | should add trusted verifier                      | ✅   |
| — | should remove trusted verifier                   | ✅   |
| — | should revert addTrustedVerifier from non-admin  | ✅   |

### KYB server management

| # | 测试内容                         | 通过 |
|---|----------------------------------|:----:|
| — | should add and remove KYB server | ✅   |

### Authorized caller

| # | 测试内容                                        | 通过 |
|---|-------------------------------------------------|:----:|
| — | should allow admin to set authorized caller     | ✅   |
| — | should revert verifyProof from unauthorized caller | ✅ |

### Proof verification

| # | 测试内容                                        | 通过 |
|---|-------------------------------------------------|:----:|
| — | should verify a valid proof                     | ✅   |
| — | should revert on wrong chainId                  | ✅   |
| — | should revert on duplicate sessionId            | ✅   |
| — | should revert on tampered commitment opening    | ✅   |
| — | should revert on tampered commitmentsHash       | ✅   |
| — | should revert on untrusted verifier signature   | ✅   |

### KYB verification

| # | 测试内容                                        | 通过 |
|---|-------------------------------------------------|:----:|
| — | should verify valid KYB proof                   | ✅   |
| — | should revert when KYC status is not 'verified' | ✅   |
| — | should revert when serverName is not trusted KYB | ✅  |
| — | should revert when revealedItems is empty       | ✅   |

### verifyAndDelegate

| # | 测试内容                                                 | 通过 |
|---|----------------------------------------------------------|:----:|
| — | should verify Wise buyer payment via verifyAndDelegate   | ✅   |
| — | should verify Wise merchant sent via verifyAndDelegate   | ✅   |
| — | should revert when platform is not registered            | ✅   |
| — | should revert when proof serverName is not trusted       | ✅   |
| — | should revert on Wise payment amount mismatch via delegate | ✅ |
| — | should revert on Wise currency mismatch via delegate     | ✅   |
| — | should revert when Wise transfer proof is missing required fields | ✅ |
| — | should verify Alipay buyer payment via verifyAndDelegate | ✅   |

### e2e-sig-format

| # | 测试内容                                                               | 通过 |
|---|------------------------------------------------------------------------|:----:|
| — | e2e-sig-format — real verifier 5-item format passes contract verification | ✅ |
| — | e2e-sig-format — old 4-item signature is rejected with UntrustedVerifier | ✅  |

---

## Rate — 9/9 ✅

| #       | 测试内容                                                      | 通过 |
|---------|---------------------------------------------------------------|:----:|
| RATE-01 | placeOrder before publishRate → RateNotPublished              | ✅   |
| RATE-02 | first publishRate → version == 1                              | ✅   |
| RATE-03 | second publishRate → version == 2                             | ✅   |
| RATE-04 | placeOrder snapshots rateVersion in Order struct              | ✅   |
| RATE-05 | placeOrder after second publishRate snapshots version 2       | ✅   |
| RATE-06 | publishRate after placeOrder does not affect existing order proof | ✅ |
| RATE-07 | proof built with new rateVersion fails for old order → OrderBindingHashMismatch | ✅ |
| RATE-08 | expired rate at placeOrder time → RateExpired                 | ✅   |
| RATE-09 | expiresAt == 0 means no expiry → placeOrder succeeds          | ✅   |

---

## Cap — 6/6 ✅

| #      | 测试内容                                                      | 通过 |
|--------|---------------------------------------------------------------|:----:|
| CAP-01 | amount == maxOrderAmount (1000 USDT) → placeOrder succeeds    | ✅   |
| CAP-02 | amount < maxOrderAmount (999 USDT) → placeOrder succeeds      | ✅   |
| CAP-03 | amount > maxOrderAmount (1001 USDT) → ExceedsUsdCap           | ✅   |
| CAP-04 | admin lowers maxOrderAmount to 500 USDT → 600 USDT → ExceedsUsdCap | ✅ |
| CAP-05 | FIAT product — amount > maxOrderAmount → ExceedsUsdCap        | ✅   |
| CAP-06 | cap is per-order, not cumulative                              | ✅   |

---

## BusinessHours — 14/14 ✅

| #     | 测试内容                                                             | 通过 |
|-------|----------------------------------------------------------------------|:----:|
| BH-01 | default (no setBusinessHours, no openNow) → isMerchantOpen = false  | ✅   |
| BH-02 | placeOrder when closed → MerchantClosed                             | ✅   |
| BH-03 | openNow → isMerchantOpen = true, placeOrder succeeds                | ✅   |
| BH-04 | closeNow → isMerchantOpen = false even after openNow                | ✅   |
| BH-05 | clearManualOverride after openNow → falls back to schedule (closed) | ✅   |
| BH-06 | setBusinessHours with openNow override → isMerchantOpen = true      | ✅   |
| BH-07 | setBusinessHours, clearManualOverride, timestamp within window → open | ✅  |
| BH-08 | inactive weekday (activeDays=0) → isMerchantOpen = false            | ✅   |
| BH-09 | all days active (activeDays=0x7F), window 00:00–23:59 → always open | ✅   |
| BH-10 | cross-midnight schedule (22:00–06:00, all days), daySecond=23:00 → open | ✅ |
| BH-11 | cross-midnight schedule (22:00–06:00, all days), daySecond=12:00 → closed | ✅ |
| BH-12 | placeOrder respects manualOverride=2 (closeNow) → MerchantClosed   | ✅   |
| BH-13 | placeOrder with allDays, 00:00–23:59 schedule → succeeds            | ✅   |
| BH-14 | different productId has independent business hours                  | ✅   |

---

## Bond (V4) — 22/22 ✅

| #        | 测试内容                                                             | 通过 | 总时间(ms) |
|----------|----------------------------------------------------------------------|:----:|----------:|
| BOND-01  | cancelOrder → revert OrderCancellationDisabled                       | ✅   |        70 |
| BOND-02  | managers 未设置时下单 → revert ManagersNotSet                           | ✅   |        58 |
| BOND-03  | 黑名单用户下单 → revert UserBlacklisted (CRYPTO)                        | ✅   |        70 |
| BOND-03b | 黑名单买家下 FIAT 单 → revert UserBlacklisted                            | ✅   |        77 |
| BOND-03c | 黑名单商家 CRYPTO 产品不可下单 → revert UserBlacklisted                    | ✅   |        64 |
| BOND-03d | 冻结商家 CRYPTO 产品不可下单 → revert UserTemporarilyFrozen               | ✅   |        84 |
| BOND-04  | 冻结用户下单 → revert UserTemporarilyFrozen                             | ✅   |       258 |
| BOND-05  | CRYPTO merchant collateral 不足 → revert InsufficientAvailable        | ✅   |        70 |
| BOND-06  | FIAT 订单金额超过 collateral → revert InsufficientAvailable             | ✅   |        74 |
| BOND-07  | CRYPTO 买家完成证明 → 买家 claim 回 bondAmount                           | ✅   |       140 |
| BOND-08  | CRYPTO 买家超时 → 商家 claimableBalance 增加 bondAmount                  | ✅   |        78 |
| BOND-09  | FIAT 商家完成证明 → 商家 claim 回 bondAmount                             | ✅   |       125 |
| BOND-10  | FIAT 商家超时 → 买家 claimable = 本金 + bond；商家 claimable = stake      | ✅   |        89 |
| BOND-11  | 重复 settle → revert OrderBondAlreadySettled                          | ✅   |       131 |
| BOND-12  | 连续超时 3 次 → riskLevel 上升，requiredBondBps 上升                       | ✅   |       107 |
| BOND-13  | 超时后完成 2 笔 → consecutiveTimeouts 不清零                              | ✅   |       132 |
| BOND-14  | 超时后完成 3 笔 → consecutiveTimeouts 清零                               | ✅   |       287 |
| BOND-15  | 累计超时 15 次 → temporarilyFrozen = true                              | ✅   |       105 |
| BOND-16  | 冻结期满 → requiredBondBps 正常返回                                      | ✅   |        92 |
| BOND-17  | _applyDecay 写入存储 → onTimeout riskLevel 基于衰减后值                   | ✅   |        91 |
| BOND-18  | 快进 90 天 → requiredBondBps 下降                                      | ✅   |        99 |
| BOND-19  | admin 设置极大 stepBps → requiredBondBps 返回 maxBondBps，不 panic       | ✅   |        86 |

---

## Bug Fix Note

**Root cause of C2CEscrow failure (now fixed):**  
Hardhat 3's `getGlobalEdrContext()` has a race condition in its singleton initialization — it assigns `_globalEdrContext = new EdrContext()` synchronously before awaiting factory registrations. When multiple async `describe` bodies call `network.getOrCreate()` concurrently (as Node ESM modules are loaded), a second caller can receive the half-initialized context and fail with `Provider for provided chain type does not exist`.

**Fix applied to [test/C2CEscrow.ts](test/C2CEscrow.ts):**  
Changed `describe("C2CEscrow (V4)", async function () { ... })` to a synchronous describe body, moving `network.getOrCreate()` and `viem.getTestClient()` into the `before` hook. This ensures network initialization only runs during test execution (after all describe blocks are registered), eliminating the race.
