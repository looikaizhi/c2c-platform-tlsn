# 责任追溯 & 争议处理闭环方案

> 基于代码分析（2026-04-21）针对第三项《责任可追溯/争议处理》的完整实施计划。
> **原则：只改必要文件，不引入与目标无关的改动。**

---

## 代码现状速查

| 文件 | 关键位置 | 现状 |
|------|---------|------|
| `C2CTypes.sol` | L13–19 | `OrderStatus` 无 `DISPUTED` |
| `C2CTypes.sol` | L39–48（`Order` struct 在 Escrow 内） | 无 `platformTxId` 字段 |
| `C2CEscrow.sol` | L558, L630 | `verifyAndDelegate()` 返回值被丢弃 |
| `C2CEscrow.sol` | L652–673 | 超时后直接赔付，无商家抗辩窗口 |
| `C2CEscrow.sol` | L767–782 | `_claimCompensation` 直接 ×2 转账 |
| `TLSNVerifier.sol` | L73 | 已有 `PlatformPaymentVerified` 事件（含 txId） |
| `ContractSubmit.tsx` | L81, L97 | PATCH body 只传 `txHash`，缺 `chainId` |
| `main.rs` | L520–523 | `PatchTxBody.chain_id` 已定义为 `Option<i64>` |
| `schema.sql` | L19 | `chain_id` 列已存在 |
| `integration_test.rs` | L988–1024 | 只测 404 路径，无成功路径 HTTP 覆盖 |

---

## 阶段划分

```
P0 → 堵资金安全漏洞（超时赔付竞争攻击）
P1 → 补争议状态机（DISPUTED + 仲裁流）
P2 → 订单级 proof 直连索引（platformTxId 落链）
P3 → 前端补 chainId（一行修复）
P4 → 测试闭环（集成测试补成功路径）
```

---

## P0：堵住超时赔付竞争攻击

### 背景

当前 `claimRefundAfterTimeout` 在 `block.timestamp > deadline` 时**立即执行** ×2 赔付，没有给商家任何提交已付款证明的窗口。若商家已在 deadline 前付款但因网络延迟未上链，买家抢先调用即可获得双倍赔付，属于资金安全 P0 漏洞。

### 需要改动的文件

1. `packages/contracts/contracts/C2CTypes.sol`
2. `packages/contracts/contracts/C2CEscrow.sol`

### TODO List

#### C2CTypes.sol

- [ ] **T-P0-1** 在 `OrderStatus` 枚举中增加 `DISPUTED` 值（插在 `WAITING` 之后）

  ```solidity
  enum OrderStatus {
      PENDING,
      CANCELLED,
      EXPIRED,
      COMPLETED,
      WAITING,
      DISPUTED   // ← 新增
  }
  ```

- [ ] **T-P0-2** 在 Custom Errors 块增加以下错误定义

  ```solidity
  error OrderInDispute();
  error DisputeWindowNotExpired();
  error NotDisputedOrder();
  error AlreadyDisputed();
  ```

#### C2CEscrow.sol

- [ ] **T-P0-3** 在合约常量区（L88–90 附近）增加争议窗口常量

  ```solidity
  uint256 private constant DISPUTE_WINDOW = 24 hours;
  ```

- [ ] **T-P0-4** 在 `Order` struct（L39–48）中增加 `disputeDeadline` 字段

  ```solidity
  struct Order {
      address buyer;
      uint256 amount;
      uint256 rate;
      uint32  rateVersion;
      uint256 deadline;
      OrderStatus status;
      bytes32 merchantNameHash;
      bytes32 merchantIdHash;
      uint256 disputeDeadline;   // ← 新增：dispute 期截止时间，0 表示未进入争议
  }
  ```

- [ ] **T-P0-5** 在 Events 块（L94 附近）增加争议相关事件

  ```solidity
  event DisputeOpened(
      address indexed buyer,
      address indexed merchant,
      uint256 indexed orderId,
      uint256 productId,
      uint256 disputeDeadline
  );
  event DisputeResolvedByMerchant(
      address indexed buyer,
      address indexed merchant,
      uint256 indexed orderId,
      uint256 productId,
      bytes32 platformTxId
  );
  event DisputeFinalizedAsExpired(
      address indexed buyer,
      address indexed merchant,
      uint256 indexed orderId,
      uint256 productId,
      uint256 compensationAmount
  );
  ```

- [ ] **T-P0-6** 将现有 `claimRefundAfterTimeout` 函数**改造**为 `requestRefund`：不再直接赔付，而是将订单置为 `DISPUTED` 并设定 `disputeDeadline`

  ```solidity
  /// @notice 买家在超时后申请退款，进入争议窗口而非立即赔付。
  ///         商家有 DISPUTE_WINDOW 时间提交支付证明。
  function requestRefund(
      address _merchant,
      uint256 _productId,
      uint256 _orderId
  ) external {
      Product storage p = _getProduct(_merchant, _productId, AssetType.FIAT);
      Order storage o = p.orders[_orderId];
      if (msg.sender != o.buyer) revert BuyerMismatch();
      _requireBuyerWaiting(o);
      if (block.timestamp <= o.deadline) revert NotYetExpired();
      if (o.disputeDeadline != 0) revert AlreadyDisputed();

      o.status = OrderStatus.DISPUTED;
      o.disputeDeadline = block.timestamp + DISPUTE_WINDOW;

      emit DisputeOpened(o.buyer, _merchant, _orderId, _productId, o.disputeDeadline);
      emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.DISPUTED, o.deadline);
  }
  ```

- [ ] **T-P0-7** 新增 `resolveDisputeByMerchant`：商家在 `disputeDeadline` 前提交支付证明，验证通过则完成结算

  ```solidity
  /// @notice 商家在争议窗口内提交 TLSN 支付证明，验证通过后完成结算。
  function resolveDisputeByMerchant(
      uint256 _productId,
      uint256 _orderId,
      TLSNProof[] calldata proofs
  ) external {
      address _merchant = msg.sender;
      Product storage p = _getProduct(_merchant, _productId, AssetType.FIAT);
      Order storage o = p.orders[_orderId];
      if (o.status != OrderStatus.DISPUTED) revert NotDisputedOrder();
      if (block.timestamp > o.disputeDeadline) revert OutOfDeadline();

      BuyerPaymentInfo storage buyerInfo = buyerOrderPaymentInfo[_merchant][_productId][_orderId];
      if (!buyerInfo.isSet) revert BuyerPaymentInfoNotSet();

      uint256 fiatAmountX1000 = Math.mulDiv(o.amount, o.rate * 10, 1e18);
      string memory targetCurrency = adminContract.getSupportFiatInfo(p.fiatID).fiatName;

      bytes32 expectedBinding = _computeOrderBindingHash(
          _merchant, o.buyer, _productId, _orderId,
          AssetType.FIAT, o.amount, o.rate, o.rateVersion, o.deadline,
          o.merchantNameHash, o.merchantIdHash,
          buyerInfo.nameHash, buyerInfo.idHash
      );
      for (uint256 i = 0; i < proofs.length; i++) {
          _requireOrderBinding(proofs[i], expectedBinding);
      }

      bytes memory paramsData = abi.encode(
          fiatAmountX1000,
          targetCurrency,
          o.deadline,
          o.deadline - ORDER_TIMEOUT
      );

      bytes32 txId = verifier.verifyAndDelegate(p.platformId, true, proofs, paramsData);

      // 释放托管 crypto 给商家
      address tokenAddress = _getTokenAddress(p.cryptoID);
      IERC20(tokenAddress).safeTransfer(_merchant, o.amount);

      p.pendingAmount -= o.amount;
      p.buyerEscrowedAmount -= o.amount;
      p.activeOrderCount--;
      o.status = OrderStatus.COMPLETED;

      delete buyerOrderPaymentInfo[_merchant][_productId][_orderId];

      emit DisputeResolvedByMerchant(o.buyer, _merchant, _orderId, _productId, txId);
      emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.COMPLETED, o.deadline);
      emit ProductCollateralChanged(
          _merchant, p.productID, AssetType.FIAT,
          0, p.collateralAmount, p.pendingAmount, p.buyerEscrowedAmount
      );
      _releaseActive(o.buyer, _merchant, p.assetType, _productId);
      _cleanupExpired(p, _merchant);
  }
  ```

- [ ] **T-P0-8** 新增 `finalizeExpiredDispute`：争议窗口期满且商家未证明，任何人可调用执行赔付

  ```solidity
  /// @notice 争议窗口到期且商家未提供证明，执行 ×2 赔付并关闭订单。
  function finalizeExpiredDispute(
      address _merchant,
      uint256 _productId,
      uint256 _orderId
  ) external {
      Product storage p = _getProduct(_merchant, _productId, AssetType.FIAT);
      Order storage o = p.orders[_orderId];
      if (o.status != OrderStatus.DISPUTED) revert NotDisputedOrder();
      if (block.timestamp <= o.disputeDeadline) revert DisputeWindowNotExpired();

      _claimCompensation(p, o, _merchant, _orderId);

      o.status = OrderStatus.EXPIRED;
      p.pendingAmount -= o.amount;
      p.activeOrderCount--;

      delete buyerOrderPaymentInfo[_merchant][_productId][_orderId];

      emit DisputeFinalizedAsExpired(o.buyer, _merchant, _orderId, _productId, o.amount * 2);
      emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.EXPIRED, o.deadline);
      _releaseActive(o.buyer, _merchant, p.assetType, _productId);
      _cleanupExpired(p, _merchant);
  }
  ```

- [ ] **T-P0-9** 在 `payOrderByPlatform`（CRYPTO 结算，L525）和 `receiveCryptoWithPlatformPayment`（FIAT 结算，L594）的入口处各增加争议状态门卫

  在各自函数的状态检查处增加：
  ```solidity
  if (o.status == OrderStatus.DISPUTED) revert OrderInDispute();
  ```

- [ ] **T-P0-10** 删除原 `claimRefundAfterTimeout` 函数（已被 `requestRefund` + `finalizeExpiredDispute` 替代）

  > ⚠️ 检查测试文件 `C2CEscrow.ts` 中所有引用 `claimRefundAfterTimeout` 的地方，同步更新为新函数名。

---

## P1：补全争议状态机（仲裁角色预留）

> P0 已完成状态机主体，P1 补充 admin 仲裁强制裁决能力。

### TODO List

#### C2CEscrow.sol

- [ ] **T-P1-1** 新增 `adminForceSettle`：admin 可在任意争议订单上强制裁决（释放给商家或赔付给买家）

  ```solidity
  /// @notice Admin 强制裁决争议订单。
  /// @param settleToMerchant true = 释放给商家；false = 赔付给买家（×2）
  function adminForceSettle(
      address _merchant,
      uint256 _productId,
      uint256 _orderId,
      bool settleToMerchant
  ) external {
      if (msg.sender != address(adminContract) &&
          !adminContract.isAdmin(msg.sender)) revert OnlyAdmin();

      Product storage p = _getProduct(_merchant, _productId, AssetType.FIAT);
      Order storage o = p.orders[_orderId];
      if (o.status != OrderStatus.DISPUTED) revert NotDisputedOrder();

      if (settleToMerchant) {
          address tokenAddress = _getTokenAddress(p.cryptoID);
          IERC20(tokenAddress).safeTransfer(_merchant, o.amount);
          p.buyerEscrowedAmount -= o.amount;
          o.status = OrderStatus.COMPLETED;
          emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.COMPLETED, o.deadline);
      } else {
          _claimCompensation(p, o, _merchant, _orderId);
          o.status = OrderStatus.EXPIRED;
          emit DisputeFinalizedAsExpired(o.buyer, _merchant, _orderId, _productId, o.amount * 2);
          emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.EXPIRED, o.deadline);
      }

      p.pendingAmount -= o.amount;
      p.activeOrderCount--;
      delete buyerOrderPaymentInfo[_merchant][_productId][_orderId];
      _releaseActive(o.buyer, _merchant, p.assetType, _productId);
      _cleanupExpired(p, _merchant);
  }
  ```

  > 注：`adminContract.isAdmin(address)` 是否已存在需检查 `C2CAdmin.sol`；若不存在，改为直接对比 `adminContract.admin()` 返回值。

- [ ] **T-P1-2** 在 `_cleanupExpired` 内部（L740 附近）对 `DISPUTED` 状态的订单**不自动清理**（`DISPUTED` 须等人工干预或 `finalizeExpiredDispute` 后才能关闭）

  在 `_cleanupExpired` 的订单状态判断处，增加对 `DISPUTED` 的跳过逻辑：
  ```solidity
  // 仅清理 PENDING / WAITING / EXPIRED 的过期订单，DISPUTED 需人工介入
  if (o.status == OrderStatus.DISPUTED) {
      p.pendingOrderIds.dequeue();
      steps++;
      continue;
  }
  ```

---

## P2：订单级 proof 直连索引

### 背景

`TLSNVerifier.verifyAndDelegate()` 返回 `bytes32 txId`（平台侧交易ID），目前两个结算函数均丢弃该返回值。
虽然 `TLSNVerifier` 已发出 `PlatformPaymentVerified(platformId, isMerchantSent, txId)` 事件，但 `C2CEscrow` 的 `OrderStatusChanged` 没有携带 `txId`，导致审计时必须跨事件关联（同 tx 内的两个事件）。

### TODO List

#### C2CTypes.sol（或 C2CEscrow.sol 内的 Order struct）

- [ ] **T-P2-1** 在 `Order` struct（`C2CEscrow.sol` L39）中增加 `platformTxId` 字段

  ```solidity
  struct Order {
      address buyer;
      uint256 amount;
      uint256 rate;
      uint32  rateVersion;
      uint256 deadline;
      OrderStatus status;
      bytes32 merchantNameHash;
      bytes32 merchantIdHash;
      uint256 disputeDeadline;   // 来自 P0
      bytes32 platformTxId;      // ← 新增：平台侧交易 ID，结算后写入
  }
  ```

#### C2CEscrow.sol

- [ ] **T-P2-2** 在 Events 块增加 `OrderProofLinked` 事件

  ```solidity
  event OrderProofLinked(
      address indexed buyer,
      address indexed merchant,
      uint256 indexed orderId,
      uint256 productId,
      bytes32 platformTxId,
      string  sessionId        // TLSN session ID，用于链下 GET /proof/:sessionId
  );
  ```

- [ ] **T-P2-3** 修改 `payOrderByPlatform`（CRYPTO 结算，L558）：捕获 `txId` 并写入订单，发出 `OrderProofLinked`

  将：
  ```solidity
  verifier.verifyAndDelegate(p.platformId, false, proofs, paramsData);
  ```
  改为：
  ```solidity
  bytes32 txId = verifier.verifyAndDelegate(p.platformId, false, proofs, paramsData);
  o.platformTxId = txId;
  // 取第一个 proof 的 sessionId 作为代表（通常只有一个，或取主证明）
  emit OrderProofLinked(o.buyer, _merchant, _orderId, _productId, txId, proofs[0].sessionId);
  ```

- [ ] **T-P2-4** 修改 `receiveCryptoWithPlatformPayment`（FIAT 结算，L630）：同上

  将：
  ```solidity
  verifier.verifyAndDelegate(p.platformId, true, proofs, paramsData);
  ```
  改为：
  ```solidity
  bytes32 txId = verifier.verifyAndDelegate(p.platformId, true, proofs, paramsData);
  o.platformTxId = txId;
  emit OrderProofLinked(o.buyer, _merchant, _orderId, _productId, txId, proofs[0].sessionId);
  ```

- [ ] **T-P2-5** 修改 `resolveDisputeByMerchant`（P0 新增函数）中对 `txId` 的处理：已在 P0 中捕获，需同步发出 `OrderProofLinked`

  在 `resolveDisputeByMerchant` 的 `verifyAndDelegate` 调用之后增加：
  ```solidity
  o.platformTxId = txId;
  emit OrderProofLinked(o.buyer, _merchant, _orderId, _productId, txId, proofs[0].sessionId);
  ```

- [ ] **T-P2-6** 在 `getOrder` view 函数（L686）返回值中增加 `platformTxId`

  ```solidity
  function getOrder(...) external view returns (
      address buyer,
      uint256 amount,
      uint256 rate,
      uint256 deadline,
      uint8 status,
      uint32 rateVersion,
      bytes32 platformTxId   // ← 新增
  ) {
      ...
      return (o.buyer, o.amount, o.rate, o.deadline, uint8(o.status), o.rateVersion, o.platformTxId);
  }
  ```

---

## P3：前端补 chainId（一行修复）

### 背景

`packages/verifier/src/main.rs` 的 `PatchTxBody.chain_id` 已是 `Option<i64>`，`schema.sql` 已有 `chain_id` 列，后端**零改动**。
`ContractSubmit.tsx` 两处 PATCH 调用均未传 `chainId`，导致数据库中该列留 NULL，跨链审计时无法直接区分。

### TODO List

#### `packages/demo/src/components/ContractSubmit.tsx`

- [ ] **T-P3-1** 第一处 PATCH（L78–82，Wise 转账证明回写）：补充 `chainId`

  在 `submitProofToContract` 完成后，通过 `provider` 获取当前 chainId：
  ```ts
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  ```
  将 PATCH body 改为：
  ```ts
  body: JSON.stringify({ txHash: hash, chainId }),
  ```

- [ ] **T-P3-2** 第二处 PATCH（L94–98，单证明回写）：同上补充 `chainId`

  > 注：两处 PATCH 在同一函数内，可在函数顶部一次性获取 `chainId`，两处复用同一变量。

---

## P4：集成测试补成功路径

### 背景

`integration_test.rs` 中 `test_proof_store_api`（L988）注释明确写明只测 404，成功路径依赖 `unit_test.rs` 的内存 DB 函数测试。
目标：通过 HTTP 层端到端验证 PATCH 200 和 GET 200 两条成功路径。

### TODO List

#### `packages/verifier/src/tests/integration_test.rs`

- [ ] **T-P4-1** 在 `start_verifier_server` 中**新增一个测试专用路由**（仅在 `#[cfg(test)]` 下编译）用于预填 DB 记录

  在 `main.rs` 中增加 test-only handler：
  ```rust
  #[cfg(test)]
  pub(crate) async fn test_seed_proof_handler(
      State(state): State<Arc<AppState>>,
      Json(record): Json<ProofExportRecord>,
  ) -> impl IntoResponse {
      let result = tokio::task::spawn_blocking(move || {
          let conn = state.db.lock().unwrap();
          crate::insert_proof_record(&conn, &record);
      })
      .await;
      match result {
          Ok(_) => StatusCode::CREATED,
          Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
      }
  }
  ```

  在 `start_verifier_server` 的路由注册处（`integration_test.rs` L187–197），增加：
  ```rust
  #[cfg(test)]
  let app = app.route("/test/seed", axum::routing::post(crate::test_seed_proof_handler));
  ```

- [ ] **T-P4-2** 新增集成测试函数 `test_proof_store_api_success_paths`，覆盖以下场景：

  ```rust
  #[tokio::test]
  async fn test_proof_store_api_success_paths() {
      // 1. 启动 verifier server（使用不与其他测试冲突的端口）
      // 2. POST /test/seed 写入一条测试记录（含 session_id、commitments_hash 等必填字段）
      // 3. 断言 GET /proof/:session_id 返回 200 且 body.session_id 一致
      // 4. 断言 GET /proof/:session_id 中 tx_hash 为 null（尚未回写）
      // 5. PATCH /proof/:session_id/tx 带 { txHash: "0xabc", chainId: 11155111 } 返回 200
      // 6. 断言 GET /proof/:session_id 中 tx_hash == "0xabc"，chain_id == 11155111
      // 7. 断言 GET /proof?txHash=0xabc 返回 200 且 body.session_id 一致
      // 8. 断言 PATCH /proof/nonexistent/tx 返回 404
  }
  ```

---

## P5：合约测试同步更新

> P0–P2 改动了合约接口，测试文件必须同步，否则 CI 会失败。

### TODO List

#### `packages/contracts/test/TLSNVerifier.ts`

- [ ] **T-P5-1** 检查并更新任何涉及 `OrderStatus` 枚举值数字映射的测试用例（新增 `DISPUTED = 5`）

#### `packages/contracts/test/C2CEscrow.ts`

- [ ] **T-P5-2** 搜索所有调用 `claimRefundAfterTimeout` 的测试，改为调用新的 `requestRefund` + `finalizeExpiredDispute` 两步流程

- [ ] **T-P5-3** 新增争议流完整测试套件（建议在现有 `describe` 块末尾追加）：

  ```
  describe("Dispute Flow", () => {
    it("T-DISPUTE-1: 买家在超时后调用 requestRefund，订单进入 DISPUTED 状态")
    it("T-DISPUTE-2: DISPUTED 期间 payOrderByPlatform 调用 revert OrderInDispute")
    it("T-DISPUTE-3: DISPUTED 期间 receiveCryptoWithPlatformPayment 调用 revert OrderInDispute")
    it("T-DISPUTE-4: 商家在 disputeDeadline 前调用 resolveDisputeByMerchant，验证通过后 crypto 释放给商家，状态变 COMPLETED")
    it("T-DISPUTE-5: 商家在 disputeDeadline 后调用 resolveDisputeByMerchant，revert OutOfDeadline")
    it("T-DISPUTE-6: disputeDeadline 到期后任何人可调用 finalizeExpiredDispute，触发 ×2 赔付，状态变 EXPIRED")
    it("T-DISPUTE-7: finalizeExpiredDispute 在窗口期内调用 revert DisputeWindowNotExpired")
    it("T-DISPUTE-8: admin 可通过 adminForceSettle 强制释放给商家")
    it("T-DISPUTE-9: admin 可通过 adminForceSettle 强制赔付给买家")
    it("T-DISPUTE-10: _cleanupExpired 不自动清理 DISPUTED 订单")
  })
  ```

- [ ] **T-P5-4** 新增 `OrderProofLinked` 事件断言测试：在正常结算测试中增加对 `OrderProofLinked` 事件的 emit 断言，验证 `platformTxId` 和 `sessionId` 字段。

- [ ] **T-P5-5** 更新 `getOrder` 调用的解构，新增对 `platformTxId` 返回值的断言。

---

## 实施顺序建议

```
1. C2CTypes.sol         ← T-P0-1, T-P0-2（枚举 + 错误，其他阶段依赖）
2. C2CEscrow.sol        ← T-P0-3 ~ T-P0-10, T-P1-1, T-P1-2（主合约逻辑）
3. C2CEscrow.sol        ← T-P2-1 ~ T-P2-6（proof 索引，依赖 P0 的 Order struct）
4. ContractSubmit.tsx   ← T-P3-1, T-P3-2（前端，独立）
5. main.rs              ← T-P4-1（测试 seed 路由，独立）
6. integration_test.rs  ← T-P4-2（依赖 T-P4-1）
7. C2CEscrow.ts (test)  ← T-P5-2 ~ T-P5-5（依赖合约改动完成）
8. TLSNVerifier.ts      ← T-P5-1（独立检查）
```

---

## 验收标准

| 阶段 | 验收标准 |
|------|---------|
| P0 | `claimRefundAfterTimeout` 不存在；`requestRefund` 置 `DISPUTED`；`resolveDisputeByMerchant` 验证通过后结算；`finalizeExpiredDispute` 窗口期满后触发赔付 |
| P1 | `adminForceSettle` 可分别裁决两种方向；`_cleanupExpired` 跳过 `DISPUTED` 订单 |
| P2 | 结算函数调用后 `o.platformTxId != bytes32(0)`；`OrderProofLinked` 事件被 emit |
| P3 | PATCH body 携带 `chainId`；DB 记录 `chain_id` 列非 NULL |
| P4 | `test_proof_store_api_success_paths` 所有断言通过（GET 200、PATCH 200、反查 GET 200、未知 PATCH 404） |
| P5 | `npx hardhat test` 全绿；争议流 10 个测试全部通过；无 `claimRefundAfterTimeout` 残留引用 |

---

## 注意事项

1. **不修改 `TLSNVerifier.sol`**：已有 `PlatformPaymentVerified` 事件，接口不变，`verifyAndDelegate` 返回值只在 Escrow 侧消费。
2. **`_claimCompensation` 逻辑不变**：仍执行 ×2 赔付，只是调用时机从"超时后立即"改为"争议窗口期满后"。
3. **`adminContract.isAdmin(address)` 检查**：实施 T-P1-1 前先确认 `C2CAdmin.sol` 是否暴露了 admin 查询接口，若无则改用 `adminContract.admin() == msg.sender`。
4. **`proofs[0].sessionId` 的使用**：Wise 平台传入两个 proof（contacts + transfer），`sessionId` 取第一个仅作索引用途，链下可通过 `GET /proof` 逐个查询。若需精确，可考虑将主证明（transfer proof）固定为 `proofs[proofs.length - 1]`，但需与 plugin 实现保持一致。
5. **Gas 成本**：`Order` struct 新增两个 `bytes32` 字段（`disputeDeadline` 从 uint256 改回来注意类型对齐）。`disputeDeadline` 建议用 `uint64`（足够表示时间戳）而非 `uint256`，可与 `rateVersion(uint32)` 打包进同一 slot 节省 gas。
