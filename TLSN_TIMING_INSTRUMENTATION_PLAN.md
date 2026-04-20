# TLSN 协议耗时埋点方案（修订版）

> 生成日期：2026-03-24 | 修订日期：2026-03-24
> 目标分支：`test-pr242`
>
> **修订说明**：修复原方案中 8 处已知问题（E1-E8），合并 Step 2/Step 3 消除歧义，
> 统一 Step 4 全链路字段命名，重写完整参考代码。

---

## 1. 目标定义与时间分段

### 1.1 完整调用链与计时边界

```
SessionManager.onProve()                ← t_total 起点
│
├─ ProveManager.createProver()          ← [A] connectionMs 起点
│   ├─ createSession()                     WebSocket /session 握手，获取 sessionId
│   ├─ new Prover(config)                  WASM Prover 实例化
│   └─ prover.setup(verifierUrl)           MPC 协议建立 + TLS 握手（最耗时）
│                                       ← [A] connectionMs 终点
│
├─ prover.send_request()                ← [B] requestMs 起点
│   └─ 通过 MPC-TLS 发出 HTTP 请求，录制 transcript
│                                       ← [B] requestMs 终点
│
├─ prover.transcript()                  本地操作（不计时）
├─ processHandlers()                    本地 CPU（不计时）
├─ sendRevealConfig()                   网络发送，近乎即时（不计时）
│
├─ prover.reveal()                      ← [C] proofGenerationMs 起点
│   └─ MPC reveal 协议，生成 commitment/proof
│                                       ← [C] proofGenerationMs 终点
│
└─ ProveManager.getResponse()           ← [D] verificationMs 起点
    └─ 等待 Verifier (Rust) 完成验证并返回结果
                                        ← [D] verificationMs 终点 = t_total 终点

runTranscriptCommitmentRuntimeTest()    不计入（用户明确排除）
```

### 1.2 五个计时指标

| 字段 | 单位 | 含义 | 起止点 |
|---|---|---|---|
| `connectionMs` | ms | MPC-TLS 连接耗时 | `createProver()` 调用前 → 返回后 |
| `requestMs` | ms | HTTP 录制耗时 | `send_request()` 调用前 → 返回后 |
| `proofGenerationMs` | ms | 证明生成耗时 | `reveal()` 调用前 → 返回后 |
| `verificationMs` | ms | 等待 Verifier 响应的耗时（客户端视角） | `getResponse()` 调用前 → 返回后 |
| `totalProtocolMs` | ms | TLSN 协议总耗时 | `onProve` 入口 → `getResponse()` 返回后 |
| `verifierServerMs` *(Step 3 可选)* | ms | Verifier 服务器内部纯计算时间 | Rust 侧：`verifier()` 调用前 → 返回后 |

> **`verificationMs` 语义说明**：该值计量的是客户端等待 WebSocket 消息的时长，
> 包含 Verifier 计算时间 + 网络 RTT。由于 `getResponse()` 是回调驱动（非轮询阻塞），
> 1s 的轮询间隔在实践中不影响精度（消息一到达立即被回调置 `responseReceived = true`）。
> 若需要纯服务端计算时间，需启用 Step 3（Rust 侧打点）。

---

## 2. 需要修改的文件

```
packages/
├── plugin-sdk/src/
│   └── types.ts                        ← Step 1：新增 ProveTiming 类型，扩展 ProveResponse
│
└── extension/src/offscreen/
    ├── SessionManager.ts               ← Step 2：主要埋点，所有计时逻辑集中于此
    └── ProveManager/index.ts           ← Step 3（可选）：接收 Rust 服务端计时数据
```

Verifier (Rust) 侧修改在 Step 3 中描述，与 ProveManager 配套使用。

> **设计决策**：不修改 `ProveManager.createProver()` 的返回类型。所有计时打点
> 集中在 `SessionManager`，通过 `performance.now()` 包裹各 `await` 调用实现。
> 这避免了原方案中 Step 2/Step 3 混用导致的 TypeScript 类型连锁报错（E1/E2/E5）。

---

## 3. Step 1：修改 `types.ts`

**文件**：[packages/plugin-sdk/src/types.ts](packages/plugin-sdk/src/types.ts)

### 3.1 插入 `ProveTiming` 接口

**位置**：在 `CommitmentSelfCheckSummary` 接口定义之后、`HandlerResult` 之前插入：

```typescript
// ─── Timing ──────────────────────────────────────────────────────────────────

/**
 * Per-phase timing breakdown for one prove() call.
 * All values are integer milliseconds measured via performance.now().
 *
 * Phases:
 *   connectionMs      – createProver(): session WS setup + WASM Prover init + setup()
 *   requestMs         – send_request(): HTTP sent through the MPC-TLS channel
 *   proofGenerationMs – reveal(): MPC reveal protocol + commitment generation
 *   verificationMs    – getResponse(): elapsed until Verifier's session_completed arrives
 *                       (includes Verifier computation + network RTT, callback-driven)
 *   totalProtocolMs   – wall-clock from onProve entry to getResponse() completion
 *                       (excludes commitmentSelfCheck and all post-processing)
 *   verifierServerMs  – (optional) pure Verifier computation time reported by the
 *                       Rust server; only present when Step 3 server-side timing is enabled
 */
export interface ProveTiming {
  connectionMs: number;
  requestMs: number;
  proofGenerationMs: number;
  verificationMs: number;
  totalProtocolMs: number;
  /** Verifier 服务器内部纯计算耗时 (ms)，仅 Step 3 启用时有值 */
  verifierServerMs?: number;
}
```

### 3.2 扩展 `ProveResponse` 接口

**位置**：找到 `ProveResponse` 接口，添加 `timing` 字段：

```typescript
// 修改前
export interface ProveResponse {
  results: HandlerResult[];
  transcriptCommitments: TranscriptCommitmentSummary[];
  verifierTranscript?: VerifierTranscriptSummary;
  transcriptCommitOpenings?: TranscriptCommitOpeningSummary[];
  commitmentSelfCheck?: CommitmentSelfCheckSummary;
}

// 修改后
export interface ProveResponse {
  results: HandlerResult[];
  transcriptCommitments: TranscriptCommitmentSummary[];
  verifierTranscript?: VerifierTranscriptSummary;
  transcriptCommitOpenings?: TranscriptCommitOpeningSummary[];
  commitmentSelfCheck?: CommitmentSelfCheckSummary;
  /** TLSN 协议各阶段耗时；prove() 成功时填充，失败时不存在 */
  timing?: ProveTiming;
}
```

---

## 4. Step 2：修改 `SessionManager.ts`（核心）

**文件**：[packages/extension/src/offscreen/SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts)

所有计时打点集中于 `onProve` 回调内部，**不修改 `ProveManager` 的方法签名**。

### 4.1 需要插入的计时行（精确位置）

以下按代码执行顺序列出每一处插入，对应原文件行号（以当前 `SessionManager.ts` 为准）：

---

**插入点 A — `onProve` 回调入口（第 136 行附近，`let url;` 之前）**

插入总计时起点：

```typescript
// ── Timing: 协议总起点，在所有逻辑之前 ─────────────────────
const t_total = performance.now();
```

---

**插入点 B — `createProver` 调用前后（第 178 行附近）**

原代码：
```typescript
const proverId = await this.proveManager.createProver(
  url.hostname,
  proverOptions.verifierUrl,
  proverOptions.maxRecvData,
  proverOptions.maxSentData,
  sessionData,
);
```

修改后（仅在原代码前后各加一行，返回值类型不变，仍是 `string`）：
```typescript
const t_conn = performance.now();
const proverId = await this.proveManager.createProver(
  url.hostname,
  proverOptions.verifierUrl,
  proverOptions.maxRecvData,
  proverOptions.maxSentData,
  sessionData,
);
const connectionMs = Math.round(performance.now() - t_conn);
logger.debug('[Timing] connection:', connectionMs, 'ms');
```

---

**插入点 C — `send_request` 调用前后（第 198 行附近，`try {` 内）**

原代码：
```typescript
await prover.send_request(proverOptions.proxyUrl, {
  uri: requestOptions.url,
  method: requestOptions.method as Method,
  headers: headerMap,
  body: requestOptions.body,
});
```

修改后：
```typescript
const t_req = performance.now();
await prover.send_request(proverOptions.proxyUrl, {
  uri: requestOptions.url,
  method: requestOptions.method as Method,
  headers: headerMap,
  body: requestOptions.body,
});
const requestMs = Math.round(performance.now() - t_req);
logger.debug('[Timing] send_request:', requestMs, 'ms');
```

---

**插入点 D — `prover.reveal` 调用前后（第 245 行附近）**

原代码：
```typescript
const revealResult = (await prover.reveal(revealPayload)) as any;
```

修改后：
```typescript
const t_proof = performance.now();
const revealResult = (await prover.reveal(revealPayload)) as any;
const proofGenerationMs = Math.round(performance.now() - t_proof);
logger.debug('[Timing] reveal (proof generation):', proofGenerationMs, 'ms');
```

---

**插入点 E — `getResponse` 调用前后（第 254 行附近）**

原代码：
```typescript
const response = await this.proveManager.getResponse(proverId);
```

修改后：
```typescript
const t_verify = performance.now();
const response = await this.proveManager.getResponse(proverId);
const verificationMs = Math.round(performance.now() - t_verify);
logger.debug('[Timing] getResponse (verification):', verificationMs, 'ms');
```

---

**插入点 F — 构建 `proveResponse` 时（第 256 行附近）**

原代码：
```typescript
const proveResponse: ProveResponse = {
  results: response?.results ?? [],
  transcriptCommitments: response?.transcriptCommitments ?? [],
  verifierTranscript: response?.verifierTranscript,
  transcriptCommitOpenings,
};
```

修改后（在对象内添加 `timing` 字段，并在赋值前计算总耗时）：
```typescript
const totalProtocolMs = Math.round(performance.now() - t_total);
logger.debug('[Timing] TLSN protocol total:', totalProtocolMs, 'ms', {
  connectionMs,
  requestMs,
  proofGenerationMs,
  verificationMs,
  totalProtocolMs,
});

const proveResponse: ProveResponse = {
  results: response?.results ?? [],
  transcriptCommitments: response?.transcriptCommitments ?? [],
  verifierTranscript: response?.verifierTranscript,
  transcriptCommitOpenings,
  timing: {
    connectionMs,
    requestMs,
    proofGenerationMs,
    verificationMs,
    totalProtocolMs,
  },
};
```

### 4.2 完整修改后的 `onProve` 回调（可运行参考视图）

以下为修改完成后 `onProve` 的完整内容，包含所有原有逻辑，可直接与原文件对比。

```typescript
onProve: async (
  requestOptions: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
  proverOptions: ProveOptions,
): Promise<ProveResponse> => {
  // ── Timing: 协议总起点 ──────────────────────────────────
  const t_total = performance.now();

  let url;
  try {
    url = new URL(requestOptions.url);
  } catch (error) {
    throw new Error('Invalid URL');
  }

  validateProvePermission(requestOptions, proverOptions, this.currentConfig);

  const transcriptCommitHashAlg = proverOptions.transcriptCommitHashAlg;
  if (
    transcriptCommitHashAlg !== undefined &&
    !isTranscriptCommitHashAlg(transcriptCommitHashAlg)
  ) {
    throw new Error(
      `Invalid transcriptCommitHashAlg: ${String(transcriptCommitHashAlg)}. ` +
        `Expected one of: ${SUPPORTED_TRANSCRIPT_HASH_ALGS.join(', ')}`,
    );
  }

  const transcriptCommitDebug = proverOptions.transcriptCommitDebug;
  const exposeOpenings = Boolean(transcriptCommitDebug?.exposeOpenings);
  const runSelfCheck = transcriptCommitDebug?.runSelfCheck !== false;
  const includeVerifierTranscript = Boolean(
    transcriptCommitDebug?.includeVerifierTranscript,
  );

  const sessionData: Record<string, string> = {
    ...proverOptions.sessionData,
  };
  if (includeVerifierTranscript) {
    sessionData[VERIFIER_TRANSCRIPT_SESSION_FLAG] = 'true';
  }

  // ── Phase A: MPC-TLS 连接 ──────────────────────────────
  const t_conn = performance.now();
  const proverId = await this.proveManager.createProver(
    url.hostname,
    proverOptions.verifierUrl,
    proverOptions.maxRecvData,
    proverOptions.maxSentData,
    sessionData,
  );
  const connectionMs = Math.round(performance.now() - t_conn);
  logger.debug('[Timing] connection:', connectionMs, 'ms');

  try {
    const prover = await this.proveManager.getProver(proverId);

    const headerMap: Map<string, number[]> = new Map();
    Object.entries(requestOptions.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        headerMap.set(key, Buffer.from(String(value)).toJSON().data);
      }
    });

    // ── Phase B: HTTP 请求（TLS 录制）───────────────────
    const t_req = performance.now();
    await prover.send_request(proverOptions.proxyUrl, {
      uri: requestOptions.url,
      method: requestOptions.method as Method,
      headers: headerMap,
      body: requestOptions.body,
    });
    const requestMs = Math.round(performance.now() - t_req);
    logger.debug('[Timing] send_request:', requestMs, 'ms');

    const { sent, recv } = await prover.transcript();

    const parsedSent = new Parser(Buffer.from(sent));
    const parsedRecv = new Parser(Buffer.from(recv));

    logger.debug('parsedSent', parsedSent.json());
    logger.debug('parsedRecv', parsedRecv.json());

    const {
      sentRanges,
      recvRanges,
      sentRangesWithHandlers,
      recvRangesWithHandlers,
    } = processHandlers(proverOptions.handlers, parsedSent, parsedRecv);

    logger.debug('sentRanges', sentRanges);
    logger.debug('recvRanges', recvRanges);

    await this.proveManager.sendRevealConfig(proverId, {
      sent: sentRangesWithHandlers,
      recv: recvRangesWithHandlers,
    });

    const revealPayload: any = {
      sent: sentRanges,
      recv: recvRanges,
      server_identity: true,
    };

    if (transcriptCommitHashAlg) {
      revealPayload.transcript_commit = {
        hash_alg: transcriptCommitHashAlg,
        expose_openings: exposeOpenings,
      };
    }

    // ── Phase C: 证明生成 ────────────────────────────────
    const t_proof = performance.now();
    const revealResult = (await prover.reveal(revealPayload)) as any;
    const proofGenerationMs = Math.round(performance.now() - t_proof);
    logger.debug('[Timing] reveal (proof generation):', proofGenerationMs, 'ms');

    const transcriptCommitOpenings = exposeOpenings
      ? normalizeTranscriptCommitOpenings(
          revealResult?.transcriptCommitOpenings ??
            revealResult?.transcript_commit_openings,
        )
      : [];

    // ── Phase D: Verifier 验证 ───────────────────────────
    const t_verify = performance.now();
    const response = await this.proveManager.getResponse(proverId);
    const verificationMs = Math.round(performance.now() - t_verify);
    logger.debug('[Timing] getResponse (verification):', verificationMs, 'ms');

    // ── 汇总 timing ─────────────────────────────────────
    const totalProtocolMs = Math.round(performance.now() - t_total);
    logger.debug('[Timing] TLSN protocol total:', totalProtocolMs, 'ms', {
      connectionMs,
      requestMs,
      proofGenerationMs,
      verificationMs,
      totalProtocolMs,
    });

    const proveResponse: ProveResponse = {
      results: response?.results ?? [],
      transcriptCommitments: response?.transcriptCommitments ?? [],
      verifierTranscript: response?.verifierTranscript,
      transcriptCommitOpenings,
      timing: {
        connectionMs,
        requestMs,
        proofGenerationMs,
        verificationMs,
        totalProtocolMs,
      },
    };

    proveResponse.commitmentSelfCheck = runSelfCheck
      ? runTranscriptCommitmentRuntimeTest(proveResponse)
      : skippedSelfCheck('Runtime self-check is disabled by transcriptCommitDebug');

    return proveResponse;
  } finally {
    this.proveManager.cleanupProver(proverId);
  }
},
```

---

## 5. Step 3（可选）：Verifier 服务端计时

为获取 Verifier 纯计算时间（排除网络传输），需要修改 Rust 服务端和 TypeScript 客户端。
以下四个子步骤**必须全部完成**，单独完成任意一个都不能工作。

### 5.1 修改 `ServerMessage` 类型（`ProveManager/index.ts`）

**文件**：[packages/extension/src/offscreen/ProveManager/index.ts](packages/extension/src/offscreen/ProveManager/index.ts)

找到 `ServerMessage` 类型定义，在 `session_completed` 分支中添加 `verifierServerMs` 字段：

```typescript
// 修改前
type ServerMessage =
  | { type: 'session_registered'; sessionId: string }
  | {
      type: 'session_completed';
      results: HandlerResult[];
      transcriptCommitments?: TranscriptCommitmentSummary[];
      verifierTranscript?: VerifierTranscriptSummary;
    }
  | { type: 'error'; message: string };

// 修改后
type ServerMessage =
  | { type: 'session_registered'; sessionId: string }
  | {
      type: 'session_completed';
      results: HandlerResult[];
      transcriptCommitments?: TranscriptCommitmentSummary[];
      verifierTranscript?: VerifierTranscriptSummary;
      /** Verifier 服务端纯计算耗时 (ms)，与 Rust 序列化字段名一致 */
      verifierServerMs?: number;
    }
  | { type: 'error'; message: string };
```

### 5.2 修改 `SessionState` 接口，存储服务端计时（`ProveManager/index.ts`）

找到 `SessionState` 接口，添加 `verifierServerMs` 字段：

```typescript
// 修改前
interface SessionState {
  sessionId: string;
  webSocket: WebSocket;
  response: ProveResponse | null;
  responseReceived: boolean;
}

// 修改后
interface SessionState {
  sessionId: string;
  webSocket: WebSocket;
  response: ProveResponse | null;
  responseReceived: boolean;
  /** Verifier 服务端纯计算耗时 (ms)，由 session_completed 消息携带 */
  verifierServerMs?: number;
}
```

### 5.3 在 `session_completed` 处理中存储计时值（`ProveManager/index.ts`）

找到 `case 'session_completed':` 处理代码（约第 149 行），添加一行存储：

```typescript
case 'session_completed': {
  const session = this.sessions.get(proverId);
  if (session) {
    session.response = {
      results: data.results ?? [],
      transcriptCommitments: data.transcriptCommitments ?? [],
      verifierTranscript: data.verifierTranscript,
      transcriptCommitOpenings: [],
    };
    session.responseReceived = true;
    // 存储服务端计时（独立于 response，不污染 ProveResponse 类型）
    session.verifierServerMs = data.verifierServerMs;
  }
  break;
}
```

### 5.4 在 `ProveManager` 中暴露读取方法（`ProveManager/index.ts`）

在 `getResponse` 方法之后添加新方法：

```typescript
/**
 * 获取 Verifier 服务端纯计算耗时（毫秒）。
 * 仅在 Rust Verifier 支持服务端计时且 session_completed 消息已到达时有值。
 */
getVerifierServerMs(proverId: string): number | undefined {
  return this.sessions.get(proverId)?.verifierServerMs;
}
```

### 5.5 在 `SessionManager.ts` 中读取并填入 timing

在 Step 2 的插入点 E（`getResponse` 之后）补充一行读取，并在 timing 对象中填入：

```typescript
// ── Phase D: Verifier 验证 ───────────────────────────
const t_verify = performance.now();
const response = await this.proveManager.getResponse(proverId);
const verificationMs = Math.round(performance.now() - t_verify);
// 读取 Verifier 服务端纯计算时间（Step 3 启用时有值，否则 undefined）
const verifierServerMs = this.proveManager.getVerifierServerMs(proverId);
logger.debug('[Timing] getResponse (verification):', verificationMs, 'ms');
if (verifierServerMs !== undefined) {
  logger.debug('[Timing] verifier server computation:', verifierServerMs, 'ms');
}
```

然后在 `timing` 对象中补充该字段：

```typescript
timing: {
  connectionMs,
  requestMs,
  proofGenerationMs,
  verificationMs,
  totalProtocolMs,
  verifierServerMs,   // undefined 时会被 JSON.stringify 忽略
},
```

### 5.6 修改 Rust Verifier（`packages/verifier/src/main.rs`）

**子步骤 5.6.1**：在 `ServerMessage::SessionCompleted` 枚举中添加字段（约第 256 行）：

```rust
// 修改前
SessionCompleted {
    results: Vec<HandlerResult>,
    #[serde(rename = "transcriptCommitments")]
    transcript_commitments: Vec<TranscriptCommitmentSummary>,
    #[serde(rename = "verifierTranscript", skip_serializing_if = "Option::is_none")]
    verifier_transcript: Option<VerifierTranscriptSummary>,
    #[serde(rename = "verifierSignature", skip_serializing_if = "Option::is_none")]
    verifier_signature: Option<VerifierSignature>,
},

// 修改后（字段名 verifier_server_ms 序列化为 verifierServerMs，与 TS 类型一致）
SessionCompleted {
    results: Vec<HandlerResult>,
    #[serde(rename = "transcriptCommitments")]
    transcript_commitments: Vec<TranscriptCommitmentSummary>,
    #[serde(rename = "verifierTranscript", skip_serializing_if = "Option::is_none")]
    verifier_transcript: Option<VerifierTranscriptSummary>,
    #[serde(rename = "verifierSignature", skip_serializing_if = "Option::is_none")]
    verifier_signature: Option<VerifierSignature>,
    /// Verifier 内部纯计算耗时（毫秒），不含网络传输
    #[serde(rename = "verifierServerMs", skip_serializing_if = "Option::is_none")]
    verifier_server_ms: Option<u64>,
},
```

**子步骤 5.6.2**：在调用 `verifier()` 函数的位置打点（在 `verifier_ws_handler` 函数体内）：

```rust
// 修改前
let result = verifier(socket, max_sent_data, max_recv_data).await;

// 修改后
let t_verifier = std::time::Instant::now();
let result = verifier(socket, max_sent_data, max_recv_data).await;
let verifier_server_ms = Some(t_verifier.elapsed().as_millis() as u64);
```

**子步骤 5.6.3**：在构建 `ServerMessage::SessionCompleted` 时传入计时值：

```rust
// 找到构建 SessionCompleted 的代码，添加 verifier_server_ms 字段
let msg = ServerMessage::SessionCompleted {
    results: verification_result.results,
    transcript_commitments: verification_result.transcript_commitments,
    verifier_transcript: verification_result.verifier_transcript,
    verifier_signature: verification_result.verifier_signature,
    verifier_server_ms,   // 新增
};
```

---

## 6. 如何使用 timing 数据

### 6.1 在插件中读取（Wise 插件示例）

`prove()` 返回值已包含 `timing`，无需额外调用：

```typescript
const contactsProof = await prove(requestOptions, proverOptions);

if (contactsProof?.timing) {
  console.log('[wise] contacts proof timing (ms):', {
    connection:       contactsProof.timing.connectionMs,
    request:          contactsProof.timing.requestMs,
    proofGeneration:  contactsProof.timing.proofGenerationMs,
    verification:     contactsProof.timing.verificationMs,
    totalProtocol:    contactsProof.timing.totalProtocolMs,
    verifierServer:   contactsProof.timing.verifierServerMs, // Step 3 可选
  });
}
```

### 6.2 在 `combinedProof` 中聚合（Wise 双 endpoint）

```typescript
const combinedProof = {
  results: [...(contactsProof?.results ?? []), ...(transferProof?.results ?? [])],
  transcriptCommitments: [...],
  transcriptCommitOpenings: [...],
  commitmentSelfCheck: { contacts: ..., transfer: ... },
  timing: {
    contacts: contactsProof?.timing,
    transfer: transferProof?.timing,
  },
};
done(JSON.stringify(combinedProof));
```

### 6.3 Offscreen DevTools 控制台输出示例

```
[Timing] connection: 3241 ms
[Timing] send_request: 892 ms
[Timing] reveal (proof generation): 1573 ms
[Timing] getResponse (verification): 214 ms
[Timing] verifier server computation: 198 ms   ← 仅 Step 3 启用时出现
[Timing] TLSN protocol total: 5934 ms {
  connectionMs: 3241,
  requestMs: 892,
  proofGenerationMs: 1573,
  verificationMs: 214,
  totalProtocolMs: 5934,
  verifierServerMs: 198
}
```

---

## 7. 实施顺序与验证

### 7.1 最小可行实现（Step 1 + Step 2）

```
Step 1  修改 types.ts（新增 ProveTiming，扩展 ProveResponse）
  │     约 5 分钟，无副作用，不改变任何运行时行为
  ▼
Step 2  修改 SessionManager.ts（插入 6 处计时行）
  │     约 15 分钟，仅在原代码中插入 performance.now() 打点
  ▼
验证    运行 Wise 插件 E2E
        在 chrome://extensions → Offscreen 页面 DevTools 控制台
        确认每次 prove() 输出 [Timing] 日志
```

### 7.2 可选扩展（Step 3）

仅在需要 Verifier 纯计算时间时执行，**5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 顺序完成**：

```
Step 3.1  ProveManager：更新 ServerMessage 类型（添加 verifierServerMs 字段）
Step 3.2  ProveManager：SessionState 接口添加 verifierServerMs 字段
Step 3.3  ProveManager：session_completed 处理中存储计时值
Step 3.4  ProveManager：添加 getVerifierServerMs() 方法
Step 3.5  SessionManager：读取 verifierServerMs，填入 timing 对象
Step 3.6  Rust main.rs：ServerMessage、打点、构建处 三处修改 + cargo build
```

> Step 3 的 6 个子步骤必须全部完成，单独完成任意子步骤都无法工作（数据流不通）。

---

## 8. 注意事项

| 事项 | 说明 |
|---|---|
| `performance` 可用性 | `tsconfig.json` 已配置 `"lib": ["dom", "dom.iterable", "esnext"]`，`performance` 在 Offscreen Document 环境中完全可用，无需额外声明 |
| `Math.round()` | 所有耗时统一取整为整数毫秒，避免浮点噪声，便于日志阅读和数值比较 |
| `timing` 字段为可选 | `ProveResponse.timing?: ProveTiming` 为可选，prove() 失败时不存在，不影响现有代码对 ProveResponse 的所有处理 |
| `totalProtocolMs` 与分段之和 | 两者存在轻微差异（差值来自 `transcript()`、`processHandlers()`、`sendRevealConfig()` 等本地操作），属于正常，约为 10-50ms |
| `ProveManager` 返回类型不变 | `createProver()` 仍返回 `string`（proverId），所有现有调用无需修改 |
| `verifierServerMs` 全链路命名统一 | Rust 字段 `verifier_server_ms` → serde 序列化为 `verifierServerMs` → TS `ServerMessage` 类型字段 `verifierServerMs` → `SessionState.verifierServerMs` → `ProveTiming.verifierServerMs`，全链路同名，无歧义 |
| Step 3 子步骤依赖关系 | 5.4 的 `getVerifierServerMs()` 方法依赖 5.2 的 `SessionState` 字段；5.5 的 SessionManager 调用依赖 5.4 的方法；不可乱序 |
