# TLSN Commitment Verification — 测试方案与链上验证重构

## 目标

验证以下命题：

> **`keccak256(plaintext || blinder) == commitment.hashHex`**

其中：
- `plaintext` = TLS transcript 中被披露的字节（来自 Verifier 返回的 `verifierTranscript`）
- `blinder` = MPC 协议生成的随机盲因子（来自 WASM Prover 的 `transcriptCommitOpenings`）
- `commitment.hashHex` = Verifier 在 MPC 协议执行中产生的承诺哈希（来自 Verifier 返回的 `transcriptCommitments`）

验证通过，意味着：**Verifier 返回的披露字段值确实来自 TLS transcript，没有被篡改。**

---

## 承诺算法原理

### Keccak256 承诺的构造

TLSNotary 使用哈希承诺方案（Hash Commitment Scheme）：

```
C = Keccak256(plaintext_bytes || blinder_bytes)
```

**注意字节顺序：明文在前，blinder 在后。**（与以太坊 EIP-712 的惯例相反，这里是 TLSNotary 内部约定）

### 各方掌握的数据

```
          Prover (浏览器 WASM)          Verifier (服务器)
          ────────────────────────      ────────────────────────
MPC 前    transcript bytes (私有)       不知道 transcript 明文
MPC 中    联合贡献随机熵派生 blinder      共同计算
MPC 后    完整 blinder (私有)           承诺哈希 C (但不知道 blinder)
reveal()  明文字节发送给 Verifier        收到明文，验证 C 正确性
```

### 为什么需要 blinder

若不加 blinder，攻击者可以：

```
已知 commitment = Keccak256("OUTGOING_PAYMENT_SENT")
暴力枚举常见 state 值 → 反推出原始内容
```

blinder 是 256 位随机数，使承诺具有**隐藏性（Hiding）**——即使明文空间有限，也无法被暴力破解。

### 关键安全属性

| 属性 | 意义 |
|------|------|
| 绑定性 (Binding) | Keccak256 碰撞抗性保证 C 只能对应唯一的 (plaintext, blinder) 对 |
| 隐藏性 (Hiding) | 不知道 blinder 无法从 C 推导出 plaintext |
| MPC 保证 | blinder 由双方联合生成，Verifier 无法伪造 C |

---

## 现有实现（已存在，无需重写）

### `transcriptCommitment.runtimeTest.ts`

文件位置：[packages/extension/src/offscreen/transcriptCommitment.runtimeTest.ts](packages/extension/src/offscreen/transcriptCommitment.runtimeTest.ts)

该文件已经实现：
- 完整的纯 TypeScript Keccak256（F1600 permutation，无外部依赖）
- `runTranscriptCommitmentRuntimeTest(proveResponse)` 函数，逐个验证所有 commitment
- 每步都有 `console.log('[TranscriptCommitmentTest] ...')` 输出

核心验证逻辑（第 311-314 行）：

```typescript
const blinder = hexToBytes(opening.blinderHex);
const recomputed = bytesToHex(keccak256(concatBytes([plaintext, blinder])));
const expected = normalizeHex(commitment.hashHex);
const isMatch = recomputed === expected;
```

### `SessionManager.ts` 已自动调用

[packages/extension/src/offscreen/SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts) 第 263-265 行：

```typescript
proveResponse.commitmentSelfCheck = runSelfCheck
  ? runTranscriptCommitmentRuntimeTest(proveResponse)
  : skippedSelfCheck('Runtime self-check is disabled by transcriptCommitDebug');
```

只需在 prove() 选项中打开 `runSelfCheck: true`，验证就会**自动运行**。

---

## 启用方式

### 在 `wise.plugin.ts` 中添加 debug flags

需要同时开启三个 flags，缺一不可：

```typescript
// contacts proof
const contactsProof = await prove(requestOptions, {
  verifierUrl: VERIFIER_URL,
  proxyUrl: PROXY_URL_BASE + HOST,
  maxRecvData: 20000,
  maxSentData: 12000,
  transcriptCommitHashAlg: 'Keccak256',   // ← 必须：指定算法
  handlers: CONTACTS_HANDLERS,
  transcriptCommitDebug: {
    exposeOpenings: true,            // ← 必须：让 WASM 返回 blinder
    includeVerifierTranscript: true, // ← 必须：让 Verifier 返回明文字节
    runSelfCheck: true,              // ← 必须：自动触发验证
  },
});
```

**这三个 flags 的作用：**

| Flag | 来源 | 作用 | 缺少时的结果 |
|------|------|------|------------|
| `transcriptCommitHashAlg: 'Keccak256'` | `prove()` 顶层 | 指定承诺哈希算法 | 无 commitment 生成，测试跳过 |
| `exposeOpenings: true` | `transcriptCommitDebug` | 让 WASM prover.reveal() 返回 blinder | `transcriptCommitOpenings` 为空，测试跳过 |
| `includeVerifierTranscript: true` | `transcriptCommitDebug` | 让 Verifier 在 session_completed 中附带明文字节 | `verifierTranscript` 为空，测试跳过 |
| `runSelfCheck: true` | `transcriptCommitDebug` | 在 SessionManager 中自动调用 runTranscriptCommitmentRuntimeTest | commitmentSelfCheck 为 skipped |

**已更新的 `wise.plugin.ts` 同时在 `combinedProof` 中输出：**

```typescript
const combinedProof = {
  results: [...],
  transcriptCommitments: [...],
  transcriptCommitOpenings: [...],   // ← blinder 数据
  commitmentSelfCheck: {
    contacts: contactsProof?.commitmentSelfCheck,  // ← 验证结果
    transfer: transferProof?.commitmentSelfCheck,
  },
};
```

---

## Terminal 输出方案

### 方案 A：Chrome DevTools（无需新文件，推荐用于日常调试）

Chrome 扩展的 offscreen document 中运行的 `console.log` 不输出到系统 terminal，但可以在 Chrome DevTools 中查看：

```
1. 打开 chrome://extensions/
2. 找到 TLSN 扩展，点击 "service worker" 或 "offscreen" 链接
3. 在 DevTools Console 中切换到 offscreen 页面上下文
4. 运行 Wise 插件
5. 看到如下输出：

[TranscriptCommitmentTest] commitment[0] step {
  direction: 'RECV',
  ranges: [{start: 145, end: 151}],
  plaintextLen: 6,
  plaintextHexPreview: '3130302e3530...',
  blinderHexPreview: 'a3f7c2...',
  recomputed: '8a9f3b...',
  expected:   '8a9f3b...',
  match: true           ← 关键：true 表示验证通过
}

[TranscriptCommitmentTest] summary {
  status: 'passed',
  total: 8,
  matched: 8,
  mismatched: 0
}
```

### 方案 B：standalone `test.ts`（真正的 terminal 输出）

文件位置：[packages/extension/src/offscreen/test.ts](packages/extension/src/offscreen/test.ts)

**运行方式：**

```bash
# 使用默认 fixture 路径
npx tsx packages/extension/src/offscreen/test.ts

# 指定 fixture 文件
npx tsx packages/extension/src/offscreen/test.ts ./my_prove_response.json
```

**如何获取 fixture 数据：**

```
Step 1: 确认 wise.plugin.ts 已开启 transcriptCommitDebug flags（已完成）
Step 2: 运行 Chrome 扩展，执行 Wise 插件
Step 3: 打开 offscreen DevTools Console
Step 4: 找到 done() 前的 combinedProof JSON 数据
        （或临时在 wise.plugin.ts done() 前加一行：
          console.log('[fixture]', JSON.stringify(combinedProof, null, 2))）
Step 5: 复制完整 JSON
Step 6: 保存到 packages/extension/src/offscreen/fixtures/wise_prove_response.json
Step 7: npx tsx packages/extension/src/offscreen/test.ts
```

**Terminal 输出示例：**

```
============================================================
  TLSN Commitment Keccak256 Verification — Terminal Test
============================================================

[Step 1] Loading fixture from: .../fixtures/wise_prove_response.json
[Step 1] OK — loaded ProveResponse
         transcriptCommitments : 8
         transcriptCommitOpenings: 8
         verifierTranscript.sent  : 450 bytes
         verifierTranscript.recv  : 14230 bytes

[Step 2] Validating required fields...
[Step 2] OK — all required fields present

[Step 3] Commitment overview:
  [0] direction=SENT hashAlg=Keccak256
       ranges=[{"start":0,"end":50}]
       hashHex=8a9f3b2c...
       revealed=true
  ...

[Step 4] Blinder (transcriptCommitOpenings) overview:
  [0] direction=SENT hashAlg=Keccak256
       ranges=[{"start":0,"end":50}]
       blinderHex=a3f7c291...
  ...

[Step 5] Running keccak256(plaintext || blinder) verification...

[TranscriptCommitmentTest] commitment[0] step {
  direction: 'SENT', ranges: [...], match: true
}
[TranscriptCommitmentTest] commitment[1] step {
  direction: 'RECV', ranges: [...], match: true
}
...
[TranscriptCommitmentTest] summary { status: 'passed', matched: 8 }

============================================================
  FINAL RESULT
============================================================
  status    : passed
  total     : 8
  matched   : 8
  mismatched: 0
  message   : All checked commitments matched
============================================================

PASS: All commitment openings verified. keccak256(plaintext || blinder) matches.
      This confirms the Verifier commitment data is authentic and unmodified.
```

---

## 流程能否成功？

### 结论：YES，在以下条件均满足时

| 条件 | 检查 |
|------|------|
| `transcriptCommitHashAlg: 'Keccak256'` 已设置 | ✓ 已在 wise.plugin.ts 中设置 |
| `exposeOpenings: true` | ✓ 已在 wise.plugin.ts 中添加 |
| `includeVerifierTranscript: true` | ✓ 已在 wise.plugin.ts 中添加 |
| Verifier 服务器运行正常 | 需要确认 |
| WASM 版本支持 `expose_openings` | ✓ tlsn_wasm.d.ts 中已定义 |

### 可能的失败原因

```
情形 1: commitmentSelfCheck.status == 'skipped'
  原因: 某个 flag 未设置，或 transcriptCommitments 为空
  排查: 检查三个 flag 是否都正确传入

情形 2: commitmentSelfCheck.status == 'unsupported_alg'
  原因: 承诺使用了 Sha256/Blake3，但测试只支持 Keccak256
  排查: 确认 transcriptCommitHashAlg: 'Keccak256'

情形 3: commitmentSelfCheck.status == 'failed'
  原因: keccak256(plaintext || blinder) != commitment.hashHex
  排查: 可能是字节顺序错误，或 Verifier 篡改了数据（极端情况）

情形 4: transcriptCommitOpenings 为空数组
  原因: WASM prover.reveal() 未返回 openings
  排查: 检查 expose_openings 是否正确传给 WASM（SessionManager 第 241 行）
```

### 数据流完整路径

```
wise.plugin.ts
  prove({ transcriptCommitDebug: { exposeOpenings: true, ... } })
    │
    ▼
SessionManager.ts (onProve)
  prover.reveal({ transcript_commit: { hash_alg: 'Keccak256', expose_openings: true } })
    │
    ├── WASM 返回 → RevealOutput.transcriptCommitOpenings[]
    │              （包含 blinderHex）
    │
    └── Verifier WebSocket 返回 → session_completed
                                   transcriptCommitments[]  (hashHex)
                                   verifierTranscript        (sent/recv bytes)
    │
    ▼
runTranscriptCommitmentRuntimeTest(proveResponse)
  对每个 commitment:
    plaintext = verifierTranscript[direction][ranges]
    blinder   = transcriptCommitOpenings[matching].blinderHex
    recomputed = keccak256(concat(plaintext, blinder))
    match = (recomputed == commitment.hashHex)
    │
    ▼
ProveResponse.commitmentSelfCheck → done(JSON.stringify(combinedProof))
```

---

## 链上验证重构方案（基于 commitment opening）

### 现有方案的问题回顾

之前 `TLSN_IMPLEMENT_VERIFY_ONCHAIN.md` 的方案中，Verifier 对结构化字段签名：

```
sign(keccak256(abi.encode(serverName, sessionId, timestamp, state, amount, ...)))
```

这依赖对 Verifier **运行正确代码**的信任。若 Verifier 恶意篡改 `state` 或 `amount` 再签名，链上无法检测。

### 基于 commitment opening 的增强方案

链上额外验证：**提交的字段值确实对应 MPC 承诺**。

```solidity
// 链上验证：commitment opening
function verifyFieldCommitment(
    bytes32 commitment,          // transcriptCommitments[i].hashHex
    bytes calldata fieldBytes,   // 字段的原始字节，如 "100.50"
    bytes32 blinder              // transcriptCommitOpenings[i].blinderHex
) internal pure returns (bool) {
    return keccak256(abi.encodePacked(fieldBytes, blinder)) == commitment;
    //              ↑ 注意：明文在前，blinder 在后（与 TLSNotary 一致）
}
```

### 三层安全模型

```
Layer 1: Verifier ECDSA 签名
  → 证明 Verifier 服务器认证了这次 MPC 会话
  → 防止伪造会话

Layer 2: Commitment opening 验证（本文档重点）
  → 证明 fieldValue 确实来自 TLS transcript 的特定字节范围
  → 防止 Verifier 篡改字段值后签名

Layer 3: TEE (可选，未来规划)
  → 证明 Verifier 运行的是正确的 TLSNotary 代码
  → 防止 Verifier 替换二进制后从 MPC 层面作恶
```

### 链上提交的数据结构

```solidity
struct WiseProof {
    // === Layer 1: Verifier 签名相关 ===
    string serverName;           // "wise.com"
    string sessionId;            // MPC 会话 UUID
    uint64 verifierTimestamp;    // 签名时间戳

    // === 结构化字段（Verifier 解析后签名）===
    string transferId;
    string profileId;
    string state;                // "OUTGOING_PAYMENT_SENT"
    string targetAmount;         // "100.50"
    string targetCurrency;       // "USD"
    string transferDate;
    string recipientTitle;
    string recipientSubtitle;

    bytes verifierSignature;     // ECDSA over abi.encode(above fields)

    // === Layer 2: Commitment opening（可选，用于无信任验证）===
    bytes32[] commitmentHashes;  // transcriptCommitments[i].hashHex
    bytes[]   fieldPlaintexts;   // 各字段的原始字节
    bytes32[] blinderValues;     // transcriptCommitOpenings[i].blinderHex
}
```

### 链上验证逻辑

```solidity
function verifyWiseTransfer(WiseProof calldata proof) external {

    // Layer 1: 验证 Verifier 签名
    bytes32 payloadHash = keccak256(abi.encode(
        keccak256(bytes(proof.serverName)),
        keccak256(bytes(proof.sessionId)),
        proof.verifierTimestamp,
        keccak256(bytes(proof.state)),
        keccak256(bytes(proof.targetAmount)),
        keccak256(bytes(proof.targetCurrency)),
        keccak256(bytes(proof.transferId)),
        keccak256(bytes(proof.transferDate)),
        keccak256(bytes(proof.recipientTitle)),
        keccak256(bytes(proof.recipientSubtitle))
    ));
    address signer = ECDSA.recover(
        MessageHashUtils.toEthSignedMessageHash(payloadHash),
        proof.verifierSignature
    );
    require(signer == trustedVerifier, "Invalid verifier signature");

    // Layer 2: 验证 commitment openings（若提交）
    if (proof.commitmentHashes.length > 0) {
        require(
            proof.commitmentHashes.length == proof.fieldPlaintexts.length &&
            proof.commitmentHashes.length == proof.blinderValues.length,
            "Commitment arrays length mismatch"
        );

        for (uint i = 0; i < proof.commitmentHashes.length; i++) {
            // keccak256(plaintext || blinder) == commitment
            bytes32 recomputed = keccak256(
                abi.encodePacked(proof.fieldPlaintexts[i], proof.blinderValues[i])
            );
            require(
                recomputed == proof.commitmentHashes[i],
                "Commitment opening verification failed"
            );
        }
    }

    // 业务逻辑验证
    require(
        keccak256(bytes(proof.state)) ==
        keccak256(bytes("OUTGOING_PAYMENT_SENT")),
        "Transfer not completed"
    );

    // 防重放
    bytes32 transferKey = keccak256(abi.encode(
        proof.serverName, proof.sessionId, proof.transferId
    ));
    require(!usedProofs[transferKey], "Proof already used");
    usedProofs[transferKey] = true;

    emit TransferVerified(proof.transferId, proof.targetAmount, proof.targetCurrency);
}
```

### 关于 blinder 提交到链上的隐私考虑

**提交 blinder 会暴露什么：**

- **不会**暴露未披露字段的内容（每个字段有独立的 blinder）
- **会**让这组 `(plaintext, blinder, commitment)` 变成永久可查的公开记录
- 任何人都可以用这个 blinder 在其他场景中证明同样的事情（proof 可搬运）

**推荐做法：**

```
最小化方案（仅 Layer 1）：
  → 只提交 Verifier 签名，不提交 blinder
  → 信任 Verifier 运行正确代码
  → Gas 成本最低

增强方案（Layer 1 + Layer 2）：
  → 提交关键字段的 commitment opening（如 state, targetAmount）
  → 可验证 Verifier 没有篡改这些字段
  → blinder 一旦提交到链上即永久公开

TEE 方案（Layer 1 + Layer 3）：
  → 不需要链上 commitment 验证
  → 改为验证 Verifier 的 TEE Remote Attestation 证书
  → 更强的安全保证，无隐私问题
```

---

## 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| [transcriptCommitment.runtimeTest.ts](packages/extension/src/offscreen/transcriptCommitment.runtimeTest.ts) | 已存在 | Keccak256 实现 + 验证函数 |
| [SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts) | 已存在 | 自动调用验证，第 263 行 |
| [wise.plugin.ts](packages/demo/plugins/wise.plugin.ts) | 已更新 | 添加了三个 debug flags |
| [test.ts](packages/extension/src/offscreen/test.ts) | 新建 | Standalone terminal 测试脚本 |
| [TLSN_IMPLEMENT_VERIFY_ONCHAIN.md](TLSN_IMPLEMENT_VERIFY_ONCHAIN.md) | 参考 | 原链上验证方案（v2.0） |

---

## 快速开始

```bash
# 1. 启动开发服务器
npm run dev

# 2. 在 Chrome 加载扩展，运行 Wise 插件
#    → 检查 offscreen DevTools Console 中的 [TranscriptCommitmentTest] 日志

# 3. 保存 ProveResponse JSON 到 fixture 文件
mkdir -p packages/extension/src/offscreen/fixtures
# 将从 DevTools 复制的 JSON 粘贴到 wise_prove_response.json

# 4. 在 terminal 运行验证
npx tsx packages/extension/src/offscreen/test.ts
```
