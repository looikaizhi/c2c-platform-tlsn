# 可信证明机制闭环方案

> 文档生成日期：2026-04-21  
> 分支：`test-pr242`  
> 状态：待实施

---

## 问题概要

当前"可信证明机制"主链路已搭起骨架，但存在**一个核心断点和三个辅助漏洞**，导致真实 verifier 产物无法通过合约验证。

### 核心断点：签名域不一致（verifier v2 vs contract v1）

| 层 | 文件 | 签名包含的字段 |
|----|------|--------------|
| **Verifier (Rust)** | `packages/verifier/src/main.rs:1979-1988` | `chainId(8) \|\| keccak256(sessionId)(32) \|\| commitmentsHash(32) \|\| orderBindingHash(32) \|\| policyVersionHash(32)` = **136 bytes** |
| **Contract (Solidity)** | `packages/contracts/contracts/TLSNVerifier.sol:273-276` | `chainId \|\| keccak256(sessionId) \|\| commitmentsHash \|\| orderBindingHash` = **4 项，无 policyVersionHash** |
| **Test Helpers (TS)** | `proofBuilder.ts:74-79` + `buildTLSNProof.ts:123-132` | 同合约，4 项 |

**后果**：测试全绿（helper 和合约自洽），但把真实 verifier 签名提交上链会触发 `UntrustedVerifier` 错误。

### 辅助漏洞

| # | 位置 | 问题 |
|---|------|------|
| A | `plugin-sdk/src/types.ts:312-327` | `VerifierSignatureSummary` 无 `policyVersion` 字段，Rust 端的值在 TypeScript 层被静默丢弃 |
| B | `main.rs:1469` + `main.rs:569-575` | 无私钥时只 warn + 跳过，生产环境应 fail-closed |
| C | `main.rs:1769-1780` + `main.rs:563-576` | `patch_tx_hash` 双层静默失败（DB 层 `.ok()` + HTTP 层 `.ok()`），永远返回 200 |

---

## 修复架构

修复由 3 个优先级构成，P0 必须原子落地。

```
P0 ── 核心签名统一（5文件 + 集成测试）
P1 ── 生产安全约束（签名硬校验 + PATCH 语义修复 + TS 类型补全）
P2 ── 平滑迁移（sigVersion 版本字节）
```

---

## P0：核心签名统一（必须原子落地）

> **警告**：以下 5 个文件必须在同一 PR 内修改完毕。任何单独部分落地都会导致测试/运行时不一致。

### 签名规范（v2，所有层统一采用）

```
preimage (136 bytes) =
    chainId          (uint64, 8 bytes, big-endian)
 || keccak256(sessionId as UTF-8)   (32 bytes)
 || commitmentsHash                 (32 bytes)
 || orderBindingHash                (32 bytes, 全零表示无订单绑定)
 || policyVersionHash               (32 bytes, 全零表示无版本)

messageHash    = keccak256(preimage)
ethSignedHash  = keccak256("\x19Ethereum Signed Message:\n32" || messageHash)
signature      = ecdsa_sign(ethSignedHash)   →  r(32) || s(32) || v(1)
```

`policyVersionHash` 计算规则：
- 有值（非 `"unspecified"`）：`keccak256(policyVersion as UTF-8)`
- 无值或值为 `"unspecified"`：`bytes32(0)` 全零

---

### TODO P0-1：更新 Solidity struct（C2CTypes.sol）

**文件**：`packages/contracts/contracts/C2CTypes.sol`

- [ ] 在 `TLSNProof` struct（第 57 行）中，在 `orderBindingHash` 字段**之后**增加字段：
  ```solidity
  /// @dev keccak256(policyVersion as UTF-8), or bytes32(0) if absent
  bytes32 policyVersionHash;
  ```
- [ ] 最终 struct 字段顺序：
  ```solidity
  struct TLSNProof {
      uint64 chainId;
      string sessionId;
      bytes32 commitmentsHash;
      bytes32 orderBindingHash;
      bytes32 policyVersionHash;    // ← 新增
      bytes verifierSignature;
      TLSNRevealedItem[] revealedItems;
      TLSNCommitmentOpening[] commitmentOpenings;
      TLSNCommitment[] commitments;
      string serverName;
  }
  ```

---

### TODO P0-2：更新合约签名验证（TLSNVerifier.sol）

**文件**：`packages/contracts/contracts/TLSNVerifier.sol`

- [ ] 修改 `_recoverVerifierSigner` 函数（第 273-280 行），从 4 项改为 5 项 preimage：
  ```solidity
  function _recoverVerifierSigner(TLSNProof calldata proof) internal pure returns (address) {
      bytes32 sessionIdHash = keccak256(bytes(proof.sessionId));
      bytes32 messageHash = keccak256(
          abi.encodePacked(
              proof.chainId,
              sessionIdHash,
              proof.commitmentsHash,
              proof.orderBindingHash,
              proof.policyVersionHash      // ← 新增，136-byte preimage
          )
      );
      bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
      return ECDSA.recover(ethSignedHash, proof.verifierSignature);
  }
  ```

---

### TODO P0-3：更新 proofBuilder.ts

**文件**：`packages/contracts/test/helpers/proofBuilder.ts`

- [ ] 给 `TLSNProof` interface 加字段（第 42-52 行）：
  ```typescript
  export interface TLSNProof {
    chainId:             bigint;
    sessionId:           string;
    commitmentsHash:     `0x${string}`;
    orderBindingHash:    `0x${string}`;
    policyVersionHash:   `0x${string}`;    // ← 新增
    verifierSignature:   `0x${string}`;
    revealedItems:       TLSNRevealedItem[];
    commitmentOpenings:  TLSNCommitmentOpening[];
    commitments:         TLSNCommitment[];
    serverName:          string;
  }
  ```

- [ ] 修改 `signVerifier` 函数签名（第 67-85 行），加入 `policyVersionHash` 参数：
  ```typescript
  async function signVerifier(
    wallet: WalletClient,
    chainId: bigint,
    sessionId: string,
    commitmentsHash: `0x${string}`,
    orderBindingHash: `0x${string}`,
    policyVersionHash: `0x${string}`,     // ← 新增
  ): Promise<`0x${string}`> {
    const sessionIdHash = keccak256(toHex(toBytes(sessionId)));
    const messageHash = keccak256(
      encodePacked(
        ["uint64", "bytes32", "bytes32", "bytes32", "bytes32"],
        [chainId, sessionIdHash, commitmentsHash, orderBindingHash, policyVersionHash],
      ),
    );
    return wallet.signMessage({
      account: wallet.account!,
      message: { raw: toBytes(messageHash) },
    }) as Promise<`0x${string}`>;
  }
  ```

- [ ] 修改 `assembleProof` 函数，加入可选 `policyVersionHash` 参数（默认全零）并透传给 `signVerifier`：
  ```typescript
  async function assembleProof(params: {
    // ... 原有参数 ...
    policyVersionHash?: `0x${string}`;    // ← 新增，默认 bytes32(0)
  }): Promise<TLSNProof> {
    const policyVersionHash = params.policyVersionHash
      ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
    // ...
    const signature = params.overrideSignature ??
      await signVerifier(
        params.verifierWallet,
        params.chainId,
        params.sessionId,
        commitmentsHash,
        params.orderBindingHash,
        policyVersionHash,               // ← 传入
      );
    return {
      // ...
      policyVersionHash,                 // ← 加入返回值
    };
  }
  ```

- [ ] 修改 `buildKYBProof` 中的内联 `signVerifier` 调用（第 197-207 行），加入 `policyVersionHash` 全零：
  ```typescript
  const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  const messageHash = keccak256(
    encodePacked(
      ["uint64", "bytes32", "bytes32", "bytes32", "bytes32"],
      [p.chainId, sessionIdHash, commitmentsHash, orderBindingHash, ZERO_HASH],
    ),
  );
  // 并在返回值加：policyVersionHash: ZERO_HASH
  ```

- [ ] 同样修改 `buildKYBProofBadStatus` 内联签名（第 263-272 行），补齐同样的 `ZERO_HASH` 第 5 项

- [ ] 所有调用 `assembleProof` 的 builder 函数（`buildAlipayProof`, `buildWiseTransferProof`, `buildWiseContactsProof` 等）的返回值中加 `policyVersionHash` 字段

---

### TODO P0-4：更新 buildTLSNProof.ts

**文件**：`packages/contracts/test/helpers/buildTLSNProof.ts`

- [ ] 在第 123-132 行的签名逻辑中，将 4 项 `encodePacked` 改为 5 项：
  ```typescript
  const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const messageHash = keccak256(
    encodePacked(
      ["uint64", "bytes32", "bytes32", "bytes32", "bytes32"],
      [chainId, sessionIdHash, commitmentsHash, orderBindingHash, ZERO_HASH],
    ),
  );
  ```
- [ ] 在构建并返回的 proof 对象中加入 `policyVersionHash: ZERO_HASH`

---

### TODO P0-5：更新 VerifierSignatureSummary 类型（plugin-sdk/types.ts）

**文件**：`packages/plugin-sdk/src/types.ts`

- [ ] 在 `VerifierSignatureSummary` interface（第 312-327 行）中补充字段：
  ```typescript
  export interface VerifierSignatureSummary {
    chainId: number;
    sessionId: string;
    commitmentsHash: string;
    orderBindingHash?: string;
    signature: string;
    verifierAddress: string;
    /** Policy version locked into this signature (R.15). Present when the plugin passed a version. */
    policyVersion?: string;              // ← 新增
    /** keccak256(policyVersion UTF-8) or bytes32(0), hex without 0x. For on-chain submission. */
    policyVersionHash?: string;          // ← 新增（供链上提交使用）
  }
  ```

- [ ] 验证 `ProveManager/index.ts` 中从 verifier WebSocket 消息解析 `verifierSignature` 的地方（第 181 行），确认 `data.verifierSignature` 中的 `policy_version` 字段能被自动映射（JSON snake_case → camelCase 需要注意，若 verifier 返回 `policy_version` 则需显式映射）

---

### TODO P0-6：补端到端集成测试

**文件**：新建 `packages/contracts/test/TLSNVerifier.e2e.test.ts`（或在现有测试文件中新增 describe block）

- [ ] 实现一个 `buildE2EProof` 辅助函数，使用**与 verifier 完全相同的签名计算逻辑**（136-byte preimage）手动构建 proof，模拟真实 verifier 产物
- [ ] 编写测试：`e2e-sig-format — real verifier format passes contract verification`
  - 用 `buildE2EProof` 构建包含 `policyVersionHash` 的真实格式 proof
  - 调用合约的验证路径（KYB 或 payment proof）
  - 断言验证通过，不 revert
- [ ] 编写反向测试：`e2e-sig-format — old 4-item signature is rejected`
  - 用旧的 4 项签名（不含 policyVersionHash）构建 proof
  - 断言合约返回 `UntrustedVerifier`

---

## P1：生产安全约束

> 这些是生产硬约束，不影响开发调试，但上线前必须完成。

### TODO P1-1：签名 fail-closed（main.rs）

**文件**：`packages/verifier/src/main.rs`

- [ ] 在 `VERIFIER_PRIVATE_KEY` 未设置的分支（第 1466-1469 行），检查当前 session 是否包含 `__tlsn_order_binding_hash`：
  - 如果有（说明是生产链上流程）→ 发送 WebSocket error 消息并关闭连接，**不**生成无签名 proof
  - 如果没有（纯开发/测试场景）→ 保持现有 warn + 继续逻辑
  
  实现参考：
  ```rust
  Err(_) => {
      let needs_signature = order_binding_hash_bytes.is_some();
      if needs_signature {
          error!("[{}] ❌ VERIFIER_PRIVATE_KEY not set but orderBindingHash present — refusing to produce unsigned proof for on-chain flow", session_id);
          // 发送错误给客户端并 return Err(...)
          return Err(eyre::eyre!("VERIFIER_PRIVATE_KEY required for on-chain proof"));
      } else {
          warn!("[{}] VERIFIER_PRIVATE_KEY not set, skipping signature (dev/test mode)", session_id);
          None
      }
  }
  ```

- [ ] 确保错误通过 WebSocket 正确返回给扩展端（而不是静默断开），让扩展能显示有意义的错误信息

---

### TODO P1-2：PATCH 回写语义修复（main.rs）

**文件**：`packages/verifier/src/main.rs`

- [ ] 修改 `patch_tx_hash` 函数（第 1769-1780 行），**返回影响行数**而非吞掉错误：
  ```rust
  pub(crate) fn patch_tx_hash(
      conn: &rusqlite::Connection,
      session_id: &str,
      tx_hash: &str,
      chain_id: Option<i64>,
  ) -> Result<usize, rusqlite::Error> {   // ← 返回受影响行数
      conn.execute(
          "UPDATE proof_store SET tx_hash = ?1, chain_id = ?2 WHERE session_id = ?3",
          rusqlite::params![tx_hash, chain_id, session_id],
      )
  }
  ```
  注意：同时修复 `_chain_id` 参数（去掉下划线前缀，实际写入 DB）

- [ ] 修改 `patch_proof_tx_handler`（第 563-576 行），根据返回的行数决定 HTTP 状态码：
  ```rust
  pub(crate) async fn patch_proof_tx_handler(...) -> impl IntoResponse {
      let result = tokio::task::spawn_blocking(move || {
          let conn = state.db.lock().unwrap();
          patch_tx_hash(&conn, &session_id, &body.tx_hash, body.chain_id)
      })
      .await;
      
      match result {
          Ok(Ok(rows_affected)) if rows_affected > 0 => StatusCode::OK,
          Ok(Ok(_))  => StatusCode::NOT_FOUND,   // session 不存在
          Ok(Err(e)) => {
              error!("patch_tx_hash DB error: {}", e);
              StatusCode::INTERNAL_SERVER_ERROR
          }
          Err(e) => {
              error!("patch_tx_hash spawn error: {}", e);
              StatusCode::INTERNAL_SERVER_ERROR
          }
      }
  }
  ```

- [ ] 同步更新 `API_SPEC.md` 中 `PATCH /proof/:session_id/tx` 的返回码说明：
  - `200 OK`：写入成功
  - `404 Not Found`：session_id 不存在
  - `500 Internal Server Error`：DB 故障

---

### TODO P1-3：unit_test.rs 同步更新

**文件**：`packages/verifier/src/tests/unit_test.rs`

- [ ] 找到测试 `patch_tx_hash` 的用例，更新为期望 `Result<usize>` 返回值
- [ ] 新增测试：`patch_tx_hash_unknown_session_returns_zero_rows`
  - 对不存在的 session_id 调用 `patch_tx_hash`
  - 断言返回 `Ok(0)`
- [ ] 新增测试：`patch_proof_tx_handler_unknown_session_returns_404`
  - 用 axum test client 调用 `PATCH /proof/nonexistent-session/tx`
  - 断言返回 `404`

---

## P2：规范版本化（平滑迁移，可延后）

> 该步骤在 P0/P1 稳定后实施，目的是支持未来签名格式升级而不破坏旧部署。

### TODO P2-1：在 preimage 头部加 sigVersion 字节

**文件**：`packages/verifier/src/main.rs`（`sign_commitments` 函数）

- [ ] 将 preimage 从 136 bytes 改为 137 bytes，首字节为 `0x02`（表示 v2 格式）：
  ```
  preimage[0]      = 0x02               (1 byte, sigVersion)
  preimage[1..9]   = chainId BE         (8 bytes)
  preimage[9..41]  = keccak256(sessionId)
  preimage[41..73] = commitmentsHash
  preimage[73..105]= orderBindingHash
  preimage[105..137]= policyVersionHash
  ```

**文件**：`packages/contracts/contracts/C2CTypes.sol`

- [ ] 在 `TLSNProof` struct 加入 `uint8 sigVersion` 字段

**文件**：`packages/contracts/contracts/TLSNVerifier.sol`

- [ ] `_recoverVerifierSigner` 根据 `proof.sigVersion` 选择 preimage 构建方式：
  - `sigVersion == 1`：旧 4 项格式（兼容旧合约，迁移窗口期使用）
  - `sigVersion == 2`：新 5 项 + version 前缀格式

- [ ] 设定迁移窗口结束后，关闭对 `sigVersion == 1` 的支持

**文件**：所有 test helpers 和 integration tests

- [ ] 统一传 `sigVersion: 2`

---

## 实施顺序与检查点

```
Step 1: P0-1 → P0-2 → P0-3 → P0-4 （合约侧 + helper 侧，在一个 commit）
         ↓ 运行 `npm run test`（contracts package）→ 必须全绿

Step 2: P0-5 （TypeScript 类型层补全）
         ↓ 运行 `npm run build`（plugin-sdk package）→ 无类型错误

Step 3: P0-6 （端到端集成测试）
         ↓ 运行 `npm run test`（contracts package）→ e2e 测试通过

Step 4: P1-1 → P1-2 → P1-3 （verifier 安全约束）
         ↓ 运行 `cargo test`（verifier package）→ 全绿
         ↓ 手动测试：不带私钥启动 verifier + 发 orderBindingHash → 应得到 error 响应

Step 5: 完整回归
         ↓ 运行 `npm run test`（所有 packages）
         ↓ 运行 `cargo test`（verifier）
         ↓ 目视检查：Demo 插件 prove() 流程端到端验证

Step 6: P2 （可选，独立 PR）
```

---

## 关键文件速查表

| 文件 | 变更内容 | 优先级 |
|------|---------|-------|
| `packages/contracts/contracts/C2CTypes.sol` | TLSNProof struct 加 policyVersionHash | P0 |
| `packages/contracts/contracts/TLSNVerifier.sol` | _recoverVerifierSigner 改 5 项 | P0 |
| `packages/contracts/test/helpers/proofBuilder.ts` | signVerifier 加 policyVersionHash，所有 builder 同步 | P0 |
| `packages/contracts/test/helpers/buildTLSNProof.ts` | 签名改 5 项 | P0 |
| `packages/plugin-sdk/src/types.ts` | VerifierSignatureSummary 加 policyVersion + policyVersionHash | P0 |
| `packages/contracts/test/TLSNVerifier.e2e.test.ts` | 新建端到端集成测试 | P0 |
| `packages/verifier/src/main.rs` | fail-closed 签名 + PATCH 404 语义 | P1 |
| `packages/verifier/src/tests/unit_test.rs` | 更新 + 新增 patch 测试 | P1 |
| `packages/verifier/API_SPEC.md` | PATCH 返回码文档更新 | P1 |

---

## 验收标准

全部实施完成后，以下条件必须全部满足：

- [ ] `npm run test`（contracts）全绿，**包含** e2e 测试用真实 5-item 签名格式通过合约验证
- [ ] `npm run test`（contracts）中，旧 4-item 签名格式的测试用例被**反向测试**（断言 revert）覆盖
- [ ] `cargo test`（verifier）全绿，包含 patch_tx_hash 的 0-row 和 404 用例
- [ ] `npm run build`（plugin-sdk）无类型错误
- [ ] 手动测试：verifier 不配置 `VERIFIER_PRIVATE_KEY`，发含 `__tlsn_order_binding_hash` 的请求 → 返回 error，不生成无签名 proof
- [ ] 手动测试：PATCH `/proof/nonexistent/tx` → 返回 404
