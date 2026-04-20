# TLSNotary 技术深度解析

> 基于当前代码库（`packages/verifier`、`packages/tlsn-wasm-pkg`、`packages/plugin-sdk`、`packages/extension`）的深度技术文档。

---

## 目录

1. [协议全景：Prover 与 Verifier 是什么](#1-协议全景prover-与-verifier-是什么)
2. [服务器交互流程与架构](#2-服务器交互流程与架构)
3. [Prover 如何生成证明（含数学原理）](#3-prover-如何生成证明含数学原理)
4. [Verifier 如何验证证明（含数学原理）](#4-verifier-如何验证证明含数学原理)
5. [Verifier 只验证披露字段吗？](#5-verifier-只验证披露字段吗)
6. [链上验证方案设计](#6-链上验证方案设计)
7. [Quicksilver 在 TLSNotary 中的真实作用（新增）](#7-quicksilver-在-tlsnotary-中的真实作用新增)

---

## 1. 协议全景：Prover 与 Verifier 是什么

### 1.1 核心问题与动机

标准 HTTPS/TLS 的根本问题在于：**客户端独占会话密钥**。

当用户在 Twitter 登录后访问 `api.x.com/account/settings.json`，返回的数据只有用户自己知道。任何第三方无法区分：
- (a) 用户真的拿到了某个 API 响应
- (b) 用户自己伪造了一段 JSON 字符串

TLSNotary 通过 **两方安全计算（2-Party Computation, 2PC）** 解决这个问题。核心思想是：

> **让 Verifier 参与 TLS 会话密钥的派生过程，使得 Prover 无法单独伪造服务器的响应。**

### 1.2 角色定义

| 角色 | 位置 | 职责 |
|------|------|------|
| **Prover** | 浏览器 WebAssembly (`packages/tlsn-wasm-pkg`) | 发起真实 HTTPS 请求，与 Verifier 联合派生 TLS 密钥 |
| **Verifier** | 本地/远程服务器 (`packages/verifier`) | 联合派生密钥的另一方，验证 TLS 会话真实性 |
| **Application Server** | 目标网站（如 `api.x.com`) | 正常的 HTTPS 服务器，对 MPC 过程完全无感知 |
| **Proxy** | Verifier 服务器的 `/proxy` 端点 | 将 WebSocket 桥接到 TCP，让 WASM Prover 能连接 TLS 服务器 |

---

## 2. 服务器交互流程与架构

### 2.1 三条 WebSocket 通道

Verifier 服务器（`packages/verifier/src/main.rs:60-67`）暴露三个关键端点：

```
ws://verifier:7047/session   ← 客户端与 Verifier 的控制通道
ws://verifier:7047/verifier  ← Prover WASM 与 Verifier 的 MPC 通道
ws://verifier:7047/proxy     ← Prover WASM 到目标 HTTPS 服务器的代理通道
```

### 2.2 完整交互时序图

```
Extension（浏览器）                Verifier Server（Rust）            Application Server
      │                                    │                               │
      │  WS /session                       │                               │
      │──────────────────────────────────►│                               │
      │  {type:"register",                 │                               │
      │   maxRecvData:16384,               │  生成 sessionId (UUID)         │
      │   maxSentData:4096}                │  spawn verifier_task           │
      │◄──────────────────────────────────│                               │
      │  {type:"session_registered",       │                               │
      │   sessionId:"abc-123"}             │                               │
      │                                    │                               │
      │  [WASM Prover setup()]             │                               │
      │  WS /verifier?sessionId=abc-123    │                               │
      │──────────────────────────────────►│                               │
      │                                    │  verifier_task 收到 socket     │
      │                                    │  开始 MPC 协议 (tlsn commit)   │
      │◄─────────────────────────────────►│                               │
      │     MPC 握手（多轮交互）              │                               │
      │                                    │                               │
      │  [WASM Prover send_request()]      │                               │
      │  WS /proxy?token=api.x.com         │                               │
      │──────────────────────────────────►│  TCP 连接 api.x.com:443        │
      │                                    │──────────────────────────────►│
      │◄─────────────────────────────────►│◄─────────────────────────────►│
      │  TLS 数据通过 proxy 双向转发         │                               │
      │  （Prover 通过 MPC 派生的密钥        │                               │
      │   加密/解密 TLS 流量）               │                               │
      │                                    │                               │
      │  [WASM Prover reveal()]            │                               │
      │  MPC 揭示阶段                       │                               │
      │◄─────────────────────────────────►│                               │
      │                                    │                               │
      │  [控制通道] reveal_config           │                               │
      │  {type:"reveal_config",            │                               │
      │   sent:[{start,end,handler}],      │                               │
      │   recv:[{start,end,handler}]}      │                               │
      │──────────────────────────────────►│                               │
      │                                    │  verify_reveal_config()        │
      │                                    │  process_ranges()              │
      │◄──────────────────────────────────│                               │
      │  {type:"session_completed",        │                               │
      │   results:[{handler,value}],       │                               │
      │   transcriptCommitments:[...]}     │                               │
      │                                    │                               │
```

### 2.3 关键代码路径

**步骤 1：建立 Session（Extension → Verifier）**

见 [packages/extension/src/offscreen/ProveManager/index.ts](packages/extension/src/offscreen/ProveManager/index.ts) 的 `createSession()`：

```typescript
// 发送 register 消息
const registerMsg = { type: 'register', maxRecvData, maxSentData, sessionData };
ws.send(JSON.stringify(registerMsg));

// 等待 session_registered
// → 获得 sessionId，后续 Prover WASM 将以此 sessionId 连接
```

**步骤 2：Prover WASM Setup（连接 MPC 通道）**

```typescript
// WASM Prover 连接 /verifier?sessionId=abc-123
// 在这个 WebSocket 上执行 MPC 握手
await prover.setup(`ws://verifier:7047/verifier?sessionId=${sessionId}`);
```

**步骤 3：通过 Proxy 发送 HTTP 请求**

```typescript
// WASM Prover 通过 WebSocket → TCP 代理连接 TLS 服务器
const response = await prover.send_request(
  `wss://verifier:7047/proxy?token=api.x.com`,
  { uri, method, headers, body }
);
```

**步骤 4：获取明文转录（Transcript）**

```typescript
const transcript = prover.transcript();
// transcript.sent: number[]  ← 完整 HTTP 请求字节
// transcript.recv: number[]  ← 完整 HTTP 响应字节
```

**步骤 5：解析范围、发送 reveal_config、调用 reveal()**

见 [packages/extension/src/offscreen/SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts) 的 `onProve()`：

```typescript
// Parser 从 transcript 中提取字节范围
const { sentRanges, recvRanges } = processHandlers(handlers, sentParser, recvParser);

// 先发 reveal_config 到控制通道
await sendRevealConfig(sessionId, sentRangesWithHandlers, recvRangesWithHandlers);

// 再调用 WASM reveal()，触发 MPC reveal 阶段
await prover.reveal({ sent: sentRanges, recv: recvRanges, server_identity: true });
```

**步骤 6：Verifier 验证并返回结果**

见 [packages/verifier/src/main.rs:979-1011](packages/verifier/src/main.rs#L979)：

```rust
// 验证范围在已认证转录范围内
verify_reveal_config(&reveal_config, &transcript)?;

// 从字节中提取明文
process_ranges(&reveal_config.sent, &sent_bytes, ...);
process_ranges(&reveal_config.recv, &recv_bytes, ...);

// 通过控制通道返回结果
result_tx.send(VerificationResult { results, transcript_commitments, ... });
```

---

## 3. Prover 如何生成证明（含数学原理）

### 3.1 核心协议：MPC-TLS（DEAP）

TLSNotary 使用 **DEAP（Dual Execution with Asymmetric Privacy）** 协议实现 2PC TLS。这是一种特殊设计的安全两方计算协议。

#### 3.1.1 TLS 1.3 密钥派生回顾

标准 TLS 1.3 使用 HKDF（HMAC-Based Key Derivation Function）派生会话密钥：

```
HKDF-Extract(salt, IKM) = HMAC-Hash(salt, IKM)

密钥计划：
  Early Secret    = HKDF-Extract(0, PSK 或 0)
  Handshake Secret = HKDF-Extract(ECDHE_shared_secret, Early Secret)
  Master Secret   = HKDF-Extract(0, Handshake Secret)

  client_write_key = HKDF-Expand-Label(Master Secret, "key", ...)
  server_write_key = HKDF-Expand-Label(Master Secret, "key", ...)
```

问题：**client_write_key 和 server_write_key 都由客户端（Prover）单独持有**，客户端可以用 server_write_key 伪造任意服务器响应。

#### 3.1.2 MPC-TLS 的解决方案：秘密共享

MPC-TLS 将密钥计算分成两方进行，使得：

```
server_write_key = Key_Prover XOR Key_Verifier
```

具体来说，通过**混淆电路（Garbled Circuits）** 联合计算 HMAC/PRF：

```
设 K = HMAC(master_secret, label || seed)

MPC 计算：
  Prover  持有 s_P（master_secret 的一个加法秘密份额）
  Verifier 持有 s_V（另一个份额），s_P + s_V = master_secret

  通过 Garbled Circuit 计算：
  GC.Evaluate(K_GC, HMAC_circuit, input_P, input_V) → K_output_share

  Prover  得到 output_P
  Verifier 得到 output_V
  K = output_P XOR output_V
```

这样 **双方都不知道完整的 server_write_key**，因此 Prover 无法单独伪造服务器响应。

#### 3.1.3 DEAP 协议的关键步骤

从 [packages/verifier/src/verifier.rs:97-100](packages/verifier/src/verifier.rs#L97) 可以看到：

```rust
// 执行 commitment 协议（MPC 主体）
let verifier = verifier.commit().await?;
// 检查配置
let TlsCommitProtocolConfig::Mpc(mpc_config) = request.protocol() else { ... };
// 接受并运行
let verifier = verifier.accept().await?.run().await?;
// 验证
let verifier = verifier.verify().await?;
```

对应的 DEAP 协议步骤：

**Phase 1: Setup（在 `setup()` 调用时）**

```
Prover                              Verifier
  │  ── OT Extension Seed ──────►  │
  │  ◄── OT Extension Seed ───────  │
  │                                  │
  │  协商 MPC 参数（max_sent_data,    │
  │  max_recv_data, network 设置）   │
```

**Phase 2: TLS 握手（MPC 执行阶段）**

```
Prover(P)                           Verifier(V)
  │                                   │
  │  [通过 /proxy 连接 api.x.com]      │
  │  TLS ClientHello ─────────────►  api.x.com
  │  ◄───────────── TLS ServerHello  │
  │                                   │
  │  ECDHE 计算（Prover 端）           │
  │  ECDHE_P = scalar_P * G           │
  │                                   │
  │  ← 混淆电路交互 ─────────────────► │
  │  联合计算 HKDF/HMAC：              │
  │  PRF_output = GC_eval(circuit,   │
  │               Prover_inputs,      │
  │               Verifier_inputs)   │
  │                                   │
  │  Prover 完成 TLS 握手              │
  │  此时：                           │
  │  - Prover 持有 server_write_key  │
  │  - Verifier 持有认证材料           │
```

**Phase 3: HTTP 请求/响应（Prover 端单独执行）**

```
一旦 TLS 握手通过 MPC 完成，Prover 持有完整的会话密钥：
- 发送加密的 HTTP GET 请求
- 接收加密的 HTTP 响应
- 解密得到明文 transcript
```

### 3.2 Transcript Commitment（转录承诺）

获得明文 transcript 后，Prover 使用哈希承诺对特定字节范围进行承诺：

#### 3.2.1 数学定义

设 `T` 为完整的 transcript（字节数组），`[s, e)` 为一个字节范围。

```
Hash Commitment:
  C = Hash(blinder || T[s..e])

  其中：
  - Hash ∈ {SHA-256, Blake3, Keccak-256}
  - blinder 是一个随机秘密值（128 位或更长）
  - || 表示字节拼接
```

这是一个**加盐哈希承诺（Salted Hash Commitment）**，满足：
- **隐藏性（Hiding）**：不知道 blinder 则无法从 C 反推 `T[s..e]`
- **绑定性（Binding）**：在计算意义下不可能找到另一个 `(blinder', data')` 使得 `Hash(blinder' || data') == C`

#### 3.2.2 实际生成流程

见 WASM API（[packages/tlsn-wasm-pkg/tlsn_wasm.d.ts:56-65](packages/tlsn-wasm-pkg/tlsn_wasm.d.ts#L56)）：

```typescript
// Prover 调用 reveal()，同时携带 transcript_commit 配置
const output = await prover.reveal({
  sent: [{ start: 0, end: 45 }],         // 揭示请求的某部分
  recv: [{ start: 100, end: 250 }],       // 揭示响应的某部分
  server_identity: true,                   // 揭示服务器域名
  transcript_commit: {
    hash_alg: "Keccak256",               // 承诺哈希算法
    expose_openings: false,              // 是否暴露 blinder
  }
});

// output.transcriptCommitOpenings 包含：
// { kind: "Hash", direction: "SENT"/"RECV",
//   hashAlg: "Keccak256",
//   ranges: [{ start, end }],
//   blinderHex: "0xabcd..." }  ← blinder 值（opening）
```

#### 3.2.3 MPC 中的承诺生成（DEAP 关键属性）

DEAP 协议的关键在于：**承诺的生成本身也通过 MPC 完成**，确保 Prover 无法伪造。

```
MPC Commit Protocol:

  设 T_P 和 T_V 是 Prover/Verifier 分别持有的转录份额
  真实转录 T = T_P XOR T_V（加密流）

  通过 GC 联合计算：
  blinder = PRF(Verifier_seed, session_id, range)  ← Verifier 控制 blinder
  commitment = Hash(blinder || T[range])

  Prover 得到 commitment（用于披露）
  Verifier 持有 blinder 的份额（用于后续验证）
```

这意味着：
- Prover **不能自选 blinder**（由 MPC 中的 Verifier 随机性控制）
- Prover **不能对未发生的数据生成有效承诺**（因为 T 的真实性由 MPC 保证）

### 3.3 选择性披露（Handler 系统）

见 [packages/extension/src/offscreen/SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts) 和 [packages/plugin-sdk/src/index.ts](packages/plugin-sdk/src/index.ts)。

**Handler 定义了要披露的 HTTP 字段**：

```typescript
handlers: [
  // 披露请求的起始行（GET /1.1/account/settings.json HTTP/1.1）
  { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },

  // 披露响应中 JSON body 的 screen_name 字段
  { type: 'RECV', part: 'BODY', action: 'REVEAL',
    params: { type: 'json', path: 'screen_name', hideKey: true } },
]
```

**Parser 将 Handler 映射到字节范围**：

```typescript
// packages/plugin-sdk/src/index.ts 中的 Parser
const sentParser = new Parser(Buffer.from(sentTranscript));
const recvParser = new Parser(Buffer.from(recvTranscript));

// 对于 JSON 字段，Parser 找到字段在 transcript 字节中的起始/结束位置
// 例如 screen_name 字段值 "john_doe" 位于字节 [145, 153)
const ranges = recvParser.ranges.body('screen_name', { type: 'json', hideKey: true });
// → [{ start: 145, end: 153 }]
```

**完整的证明生成流程总结**：

```
1. [MPC Setup]  Prover + Verifier 联合派生 TLS 密钥份额
2. [TLS 请求]   Prover 通过 /proxy 向目标服务器发送 HTTPS 请求
3. [获取转录]   prover.transcript() 返回明文 sent/recv 字节数组
4. [范围提取]   Parser 将 Handler 描述的字段映射到 (start, end) 字节范围
5. [MPC Reveal] prover.reveal() 通过 MPC 揭示指定范围给 Verifier
                同时生成 Hash Commitment 到所有揭示的范围
6. [承诺输出]   Prover 获得 transcriptCommitOpenings（blinder + commitment）
```

---

## 4. Verifier 如何验证证明（含数学原理）

### 4.1 验证的两个层次

TLSNotary 的验证分为两个根本不同的层次：

| 层次 | 验证内容 | 执行位置 | 代码位置 |
|------|---------|---------|---------|
| **Layer 1: MPC-TLS 协议验证** | TLS 会话的真实性、服务器身份 | `verifier.rs` 的 `verifier()` 函数 | WASM + Rust |
| **Layer 2: 范围合规性验证** | 披露的字节范围确实在已认证的转录中 | `main.rs` 的 `verify_reveal_config()` | Rust |

### 4.2 Layer 1：MPC-TLS 协议验证（数学原理）

见 [packages/verifier/src/verifier.rs:67-207](packages/verifier/src/verifier.rs#L67)。

#### 4.2.1 Verifier 在 MPC 中的角色

Verifier 在 MPC-TLS 协议中是**GC Generator（混淆电路生成方）**：

```
Prover（GC Evaluator）               Verifier（GC Generator）
  │                                    │
  │  ← Garbled Circuit GC ──────────  │  GC = Garble(HMAC_circuit, K_GC)
  │                                    │
  │  ← Input Labels (OT) ───────────  │  通过 OT 发送对应 Prover 输入的 labels
  │                                    │
  │  GC.Evaluate(GC, labels) → output │
  │                                    │
  │  ─ output_share_P ──────────────► │  接收 Prover 的输出份额
  │  ◄── output_share_V ────────────  │  发送自己的输出份额
  │                                    │
  │  K_P = output_share_P XOR output_share_V  ← Prover 重建 key
```

**DEAP 的双执行验证**：

DEAP 在 MPC 的基础上增加了一个验证轮次，防止恶意 Prover：

```
Dual Execution Round:
  Prover 和 Verifier 交换角色，重新执行一次计算：

  Round 1: V 生成 GC，P 评估 → P 得到 output_P
  Round 2: P 生成 GC，V 评估 → V 得到 output_V

  验证：output_P == output_V
  （如果 Prover 在 Round 1 作弊，Round 2 会检测到不一致）
```

#### 4.2.2 TLS 证书与服务器身份验证

见 [packages/verifier/src/verifier.rs:85-88](packages/verifier/src/verifier.rs#L85)：

```rust
let verifier_config = VerifierConfig::builder()
    .root_store(RootCertStore::mozilla())  // 使用 Mozilla 根证书库
    .build()?;
```

Verifier 使用 **Mozilla 根证书** 验证 TLS 证书链：

```
验证链：
  server_cert → intermediate_CA → root_CA（Mozilla 信任库中）

  验证内容：
  1. 证书签名有效（RSA/ECDSA 签名验证）
  2. 证书未过期（validity period）
  3. 证书域名匹配（server_name 与 SAN/CN 匹配）
  4. 证书链完整（intermediate CA 可追溯到根 CA）
```

#### 4.2.3 MPC-TLS 协议执行（代码流程）

```rust
// 1. 创建 MPC 会话
let session = Session::new(socket.compat());
let (driver, mut handle) = session.split();
tokio::spawn(driver);  // 后台运行驱动

// 2. 执行 commit 协议（MPC TLS 握手 + 密钥派生）
let verifier = handle.new_verifier(verifier_config)?;
let verifier = verifier.commit().await?;

// 3. 检查 MPC 配置（max_sent_data, max_recv_data）
let TlsCommitProtocolConfig::Mpc(mpc_config) = request.protocol() else { error };
// 确认数据限制不超过注册时的限制
if mpc_config.max_sent_data() > max_sent_data { return Err(...) }

// 4. 接受并运行（MPC TLS 握手期间双方协作）
let verifier = verifier.accept().await?.run().await?;

// 5. 执行 verify()（MPC reveal 阶段验证）
let verifier = verifier.verify().await?;

// 6. 获取验证输出
let (VerifierOutput { server_name, transcript, transcript_commitments }, verifier)
    = verifier.accept().await?;
```

**`verify()` 阶段发生什么**？

```
Prover                              Verifier
  │  reveal({sent_ranges, recv_ranges}) │
  │─────────────────────────────────►  │
  │                                     │
  │  对于每个 revealed range [s, e):    │
  │    发送 T[s..e] 的明文              │
  │    发送 authentication tag          │
  │                                     │
  │                              验证：│
  │                    HMAC(key, T[s..e]) == tag │
  │                    key 由 MPC 派生，双方共持  │
  │                                     │
  │  transcript_commitments:            │
  │    {hash, alg, ranges, direction}  │
  │─────────────────────────────────►  │
  │                                     │
  │                    验证承诺：        │
  │                    Hash(blinder || T[range]) == hash │
```

#### 4.2.4 Transcript Commitment 的数学验证

从 [packages/verifier/src/verifier.rs:231-260](packages/verifier/src/verifier.rs#L231)：

```rust
TranscriptCommitment::Hash(hash_commitment) => {
    // 检查这个承诺的 ranges 是否被揭示（在 authed 集合内）
    let revealed = match hash_commitment.direction {
        Direction::Sent => hash_commitment.idx.is_subset(transcript.sent_authed()),
        Direction::Received => hash_commitment.idx.is_subset(transcript.received_authed()),
    };
    // 记录 hash 值、算法、范围、是否已揭示
}
```

**数学验证过程**：

```
设承诺为：C = Hash(blinder || T[s₁..e₁] || T[s₂..e₂] || ...)

Prover 提供 opening：(blinder, T[s₁..e₁], T[s₂..e₂], ...)
Verifier 验证：
  1. Hash(blinder || T[s₁..e₁] || ...) == C  ← 承诺绑定性验证
  2. ∀i, [sᵢ, eᵢ) ⊆ authed_ranges           ← 范围合规性验证
  3. server_name ∈ trusted_certs             ← 服务器身份验证
```

**`sent_authed()` 和 `received_authed()` 的含义**：

```
authed_ranges 是在 MPC 协议中被双方联合认证的字节范围。
只有被 MPC 认证的字节才能生成有效的 commitment。

这意味着：Prover 无法对未经过 MPC TLS 认证的数据生成有效证明。
```

### 4.3 Layer 2：范围合规性验证

见 [packages/verifier/src/main.rs:1092-1118](packages/verifier/src/main.rs#L1092)：

```rust
fn verify_reveal_config(
    reveal_config: &RevealConfig,
    transcript: &PartialTranscript,
) -> Result<(), (String, usize, usize)> {
    // 验证 sent 方向的所有披露范围
    for range in &reveal_config.sent {
        if !(range.start..range.end).all(|i| auth_set.contains(&i)) {
            return Err(("sent", range.start, range.end));
        }
    }
    // 验证 recv 方向的所有披露范围
    // ...
}
```

**数学保证**：

```
∀ range ∈ reveal_config.sent:
    range ⊆ transcript.sent_authed()

∀ range ∈ reveal_config.recv:
    range ⊆ transcript.received_authed()
```

如果任何一个要求披露的字节范围超出了 MPC 认证的范围，验证立即失败。

---

## 5. Verifier 只验证披露字段的证明吗？

**答案：不是。Verifier 验证的远比披露字段多得多。**

### 5.1 验证的完整内容

Verifier 实际上执行了以下全部验证：

```
验证层级（从底层到高层）：

┌────────────────────────────────────────────────────────────────┐
│  Level 0: TLS 证书链验证                                         │
│  - 服务器证书由 Mozilla 信任的 CA 签发                             │
│  - 证书域名与目标服务器匹配（e.g. api.x.com）                      │
│  - 证书在有效期内                                                  │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  Level 1: MPC-TLS 协议完整性验证                                  │
│  - 双方的 MPC 计算结果一致（DEAP 双执行验证）                       │
│  - TLS 会话密钥的派生过程是诚实的                                   │
│  - Prover 没有使用伪造的密钥                                       │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  Level 2: 转录认证范围验证                                         │
│  - transcript.sent_authed() 记录了被 MPC 认证的请求字节范围        │
│  - transcript.received_authed() 记录了被 MPC 认证的响应字节范围   │
│  - 这些范围的数据确实来自与目标服务器的真实 TLS 会话                 │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  Level 3: Transcript Commitment 验证                             │
│  - 每个 commitment 覆盖的范围确实在 authed 范围内                  │
│  - Hash(blinder || data) == commitment                           │
│  - blinder 由 MPC 随机性保证（Prover 无法自选）                    │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  Level 4: 披露字段验证                                            │
│  - 披露的字节范围 ⊆ authed_ranges                                │
│  - 从字节中提取的明文值                                            │
│  - 与 handler 描述的语义字段对应                                   │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 "只验证披露字段"的误区

如果 Verifier 只验证披露字段，会有什么问题？

**攻击场景**：Prover 伪造 transcript

```
恶意 Prover：
  1. 不真正发送请求到 api.x.com
  2. 本地构造一个假的 transcript：
     recv = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n
             {\"screen_name\":\"elonmusk\"}"
  3. 调用 reveal()，披露 screen_name 字段

若 Verifier 只验证 Hash(blinder || "elonmusk") == commitment：
  → 验证通过！但数据完全是伪造的。
```

正是因为 **Level 0-3 的验证**，这种攻击是不可能的：
- MPC-TLS 确保了 recv_authed() 中的字节来自真实的 TLS 服务器响应
- Prover 无法为自己构造的数据生成有效的 authed 标记
- Commitment 覆盖的范围必须在 authed 范围内

### 5.3 当前实现的一个设计选择

值得注意的是，当前 Verifier 的**控制通道**（`/session` WebSocket）和 **MPC 通道**（`/verifier` WebSocket）是分离的：

- `reveal_config`（包含 handler 信息和字节范围）是通过**控制通道**发送的
- 实际的 MPC reveal 是通过 **MPC 通道**进行的（WASM `prover.reveal()` 调用）

这意味着：

```
prover.reveal({ sent: [...ranges] })  → MPC 通道（密码学保证）
reveal_config { sent: [{start, end, handler}] } → 控制通道（HTTP-level 约定）
```

Verifier 在收到两者后，**先执行 MPC 验证**（通过 WASM/tlsn 库确保密码学正确性），**再用 reveal_config 提取明文值**。控制通道传递的 handler 信息本质上是告诉 Verifier"如何解读"这些字节（属于请求头、响应体的哪个字段），而不影响密码学安全性。

---

## 6. 链上验证方案设计

### 6.1 当前架构的链上验证挑战

当前系统是**可信 Verifier 模型**：

```
Prover → (MPC-TLS) → Verifier → 返回 { results, transcriptCommitments }
```

问题：
1. Verifier 是一个可信第三方，链上无法直接验证 MPC-TLS 协议
2. `transcriptCommitments` 包含 `Hash(blinder || data)` 承诺，但 blinder 由 MPC 双方联合生成

### 6.2 方案一：Verifier 签名 + 链上签名验证（最实用）

这是**最直接可行**的方案，改动最小。

#### 设计

```
Verifier 在返回结果时，对结果哈希进行 ECDSA 签名：

result_hash = Keccak256(
  server_name || session_id ||
  encode(handler_results) ||
  encode(transcript_commitments)
)

signature = ECDSA.sign(verifier_private_key, result_hash)
```

#### 链上合约

```solidity
contract TLSNotaryVerifier {
    address public trustedVerifier;  // Verifier 的 ECDSA 公钥地址
    mapping(bytes32 => bool) public usedProofs;  // 防重放

    struct ProofResult {
        string serverName;
        string sessionId;
        HandlerResult[] results;
        TranscriptCommitment[] commitments;
    }

    function verify(
        ProofResult calldata proof,
        bytes calldata signature
    ) external returns (bool) {
        bytes32 proofHash = keccak256(abi.encode(proof));

        // 防重放
        require(!usedProofs[proofHash], "Proof already used");
        usedProofs[proofHash] = true;

        // 验证 Verifier 签名
        address signer = ECDSA.recover(proofHash, signature);
        require(signer == trustedVerifier, "Invalid verifier signature");

        // 提取并验证特定字段
        for (uint i = 0; i < proof.results.length; i++) {
            if (keccak256(bytes(proof.results[i].handlerPart)) == keccak256("BODY")) {
                // 处理 screen_name 等字段
            }
        }

        return true;
    }
}
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| 实现简单，Gas 成本低 | 需要信任 Verifier 节点 |
| 与现有架构兼容 | 中心化风险 |
| 可快速部署 | Verifier 密钥管理问题 |

### 6.3 方案二：ZK-SNARK 证明 Commitment Opening（推荐方向）

这是**去信任化**的核心方案。利用当前代码中已有的 `transcriptCommitOpenings`（blinder + data）。

#### 核心思路

当前代码中，当 `exposeOpenings: true` 时，Prover 可以获得：

```typescript
// TranscriptCommitOpening（来自 tlsn_wasm.d.ts）
{
  kind: "Hash",
  direction: "RECV",
  hashAlg: "Keccak256",
  ranges: [{ start: 145, end: 153 }],
  blinderHex: "0x1a2b3c..."  // ← blinder 值
}
```

有了这些，可以构造 ZK 证明：

#### ZK 电路设计

```
ZK Circuit（使用 Groth16 或 PLONK）：

Public Inputs:
  - commitment: bytes32   // Hash(blinder || data)
  - fieldValue: string    // 声明的字段值（如 "john_doe"）
  - serverName: string    // 服务器域名
  - rangeStart: uint      // 字节范围起始
  - rangeEnd: uint        // 字节范围结束

Private Witnesses（Prover 知道但不公开）:
  - blinder: bytes        // MPC 生成的 blinder
  - fullTranscript: bytes // 完整 transcript（该范围）
  - contextBytes: bytes   // fieldValue 在 transcript 中的上下文

Constraints（约束）:
  1. Keccak256(blinder || fullTranscript[rangeStart..rangeEnd]) == commitment
  2. fullTranscript 包含 fieldValue（如 JSON 解析约束）
  3. fullTranscript[rangeStart..rangeEnd] 是有效的 HTTP 响应格式
```

#### 电路实现建议（Circom/Halo2）

```circom
// Circom 示例（概念性）
template KeccakCommitmentVerify() {
    signal input commitment[32];      // public
    signal input fieldValue[64];      // public（claimed value）
    signal input blinder[32];         // private
    signal input transcript[MAX_LEN]; // private
    signal input rangeStart;          // public
    signal input rangeEnd;            // public

    // Constraint 1: commitment = Keccak256(blinder || transcript[start..end])
    component keccak = Keccak256(32 + MAX_LEN);
    for (var i = 0; i < 32; i++) {
        keccak.in[i] <== blinder[i];
    }
    for (var i = rangeStart; i < rangeEnd; i++) {
        keccak.in[32 + i - rangeStart] <== transcript[i];
    }
    for (var i = 0; i < 32; i++) {
        commitment[i] === keccak.out[i];
    }

    // Constraint 2: fieldValue 出现在 transcript 的正确位置
    component jsonParser = JSONFieldExtract(MAX_LEN, 64);
    jsonParser.data <== transcript;
    jsonParser.fieldName <== "screen_name";
    for (var i = 0; i < 64; i++) {
        fieldValue[i] === jsonParser.value[i];
    }
}
```

#### 链上 ZK 验证合约

```solidity
contract TLSNotaryZKVerifier {
    IGroth16Verifier public zkVerifier;  // ZK proof verifier 合约

    // 存储已知的有效 commitments（由可信 Verifier 或去中心化方式生成）
    mapping(bytes32 => CommitmentInfo) public validCommitments;

    struct CommitmentInfo {
        string serverName;
        uint rangeStart;
        uint rangeEnd;
        bool isValid;
    }

    function verifyFieldProof(
        bytes32 commitment,      // transcript commitment
        string calldata fieldValue,  // 声明的字段值
        uint[8] calldata zkProof    // ZK proof
    ) external view returns (bool) {
        CommitmentInfo memory info = validCommitments[commitment];
        require(info.isValid, "Unknown commitment");

        // 构造 ZK 验证输入
        uint[] memory publicInputs = new uint[](4);
        publicInputs[0] = uint(commitment);
        publicInputs[1] = uint(keccak256(bytes(fieldValue)));
        publicInputs[2] = info.rangeStart;
        publicInputs[3] = info.rangeEnd;

        // 验证 ZK 证明
        return zkVerifier.verifyProof(zkProof, publicInputs);
    }
}
```

#### 优缺点

| 优点 | 缺点 |
|------|------|
| 去信任化，无需信任 Verifier | ZK 电路开发复杂（Keccak256 电路代价高） |
| 链上完全可验证 | 证明生成时间较长 |
| 隐私保护（blinder 不公开） | 需要可信的 commitment 注册机制 |

### 6.4 方案三：TEE + 链上证明（实用折中）

使用 **Trusted Execution Environment（TEE）** 运行 Verifier：

```
                    ┌─────────────────────────────────────┐
                    │  TEE（如 Intel SGX / AWS Nitro）     │
                    │                                      │
                    │  Verifier 运行在受信任的隔离环境中    │
                    │  生成 Remote Attestation 报告         │
                    │                                      │
                    │  证明：                               │
                    │  1. 代码完整性（代码哈希）             │
                    │  2. 硬件签名（由 Intel/AMD 背书）      │
                    │  3. 执行结果签名                      │
                    └─────────────────────────────────────┘
                                    ↓
                    TEE Attestation + Result → 链上合约
```

链上合约验证 TEE attestation，无需信任特定 Verifier 运营商。

### 6.5 方案四：基于 Keccak256 Commitment 的最小化链上验证

**利用当前代码已有的 Keccak256 commitment 支持**（`transcriptCommitHashAlg: 'Keccak256'`）。

这是最小改动量的实现路径：

#### 步骤 1：修改 Verifier，添加结果签名

```rust
// 在 verifier/src/main.rs 中
// 增加 Verifier 的 ECDSA 私钥配置
// 在返回 session_completed 时附加签名

let result_json = serde_json::to_string(&result)?;
let result_hash = keccak256(result_json.as_bytes());
let signature = verifier_key.sign(&result_hash);
```

#### 步骤 2：链上合约存储 commitment

```solidity
// 链上存储 transcript commitments（由 Verifier 签名认证）
function registerCommitment(
    bytes32 commitmentHash,
    string calldata serverName,
    uint rangeStart,
    uint rangeEnd,
    bytes calldata verifierSignature
) external {
    // 验证 Verifier 签名
    bytes32 msgHash = keccak256(abi.encode(
        commitmentHash, serverName, rangeStart, rangeEnd
    ));
    require(ECDSA.recover(msgHash, verifierSignature) == trustedVerifier);

    // 存储承诺
    commitments[commitmentHash] = CommitmentRecord({
        serverName: serverName,
        rangeStart: rangeStart,
        rangeEnd: rangeEnd,
        verified: true
    });
}
```

#### 步骤 3：用户提交字段证明

```solidity
// 用户声称某 commitment 打开为特定字段值
function claimFieldValue(
    bytes32 commitment,
    bytes calldata blinder,
    bytes calldata fieldData,
    string calldata claimedValue
) external view returns (bool) {
    // 验证 commitment 已注册
    require(commitments[commitment].verified);

    // 链上验证 commitment opening
    bytes32 recomputed = keccak256(abi.encodePacked(blinder, fieldData));
    require(recomputed == commitment, "Invalid commitment opening");

    // 验证 fieldData 包含 claimedValue
    require(contains(fieldData, bytes(claimedValue)), "Field not found");

    return true;
}
```

### 6.6 推荐的实施路线图

```
Phase 1（短期，1-2 个月）：
  ✦ 实现方案一：Verifier ECDSA 签名
  ✦ 部署链上签名验证合约
  ✦ 验证 screen_name / transfer amount 等字段
  → 可用但有中心化风险

Phase 2（中期，3-6 个月）：
  ✦ 选择 transcriptCommitHashAlg: 'Keccak256'（已支持）
  ✦ 在 Prover 端生成 blinder（expose_openings: true）
  ✦ 开发 Keccak256 ZK 电路（使用 Halo2 或 PLONK）
  ✦ 部署 ZK verifier 合约
  → 去信任化的字段验证

Phase 3（长期，6-12 个月）：
  ✦ 完整 MPC-TLS ZK 证明（TLSNotary 主项目方向）
  ✦ 可参考 tlsn-project 的 zk-proof roadmap
  → 完全去信任化的 TLS 内容证明
```

### 6.7 当前代码中可直接利用的关键数据

```typescript
// 当前 ProveResponse 已包含链上验证所需的所有数据：

interface ProveResponse {
  results: HandlerResult[];                      // 披露的字段值
  transcriptCommitments: TranscriptCommitmentSummary[];  // commitments（hash + 范围）
  transcriptCommitOpenings?: TranscriptCommitOpeningSummary[];  // blinder 值
  verifierTranscript?: VerifierTranscriptSummary;  // 完整转录（debug 用）
}

// TranscriptCommitmentSummary:
{
  kind: "Hash",
  direction: "SENT" | "RECV",
  hashAlg: "Sha256" | "Blake3" | "Keccak256",  // ← 选 Keccak256 最适合链上
  ranges: [{ start, end }],
  hashHex: "0xabcd...",  // ← 这就是链上 commitment
  hashLen: 32,
  revealed: true
}

// TranscriptCommitOpening（当 exposeOpenings: true 时）:
{
  kind: "Hash",
  direction: "RECV",
  hashAlg: "Keccak256",
  ranges: [{ start: 145, end: 153 }],
  blinderHex: "0x1a2b..."  // ← 链上验证 commitment opening 需要此值
}
```

---

## 7. Quicksilver 在 TLSNotary 中的真实作用（新增）

> 本章基于当前代码版本（`tlsn v0.1.0-alpha.14`）补充 Quicksilver 相关机制，回答两个核心问题：
> 1) Prover 是否“通过 Quicksilver 生成证明”
> 2) `transcript_commitment.hash` 是否与 Quicksilver 直接等价

### 7.1 一句话结论

- **结论 A（关于 Prover）**：是的，当前实现中 Prover 在 `reveal/prove` 阶段会通过 `mpz_zk` 执行 Quicksilver 型 ZK 一致性检查；但这是 **DEAP + MPC-TLS 流程中的内部证明子系统**，不是单独导出的 SNARK 证明文件。
- **结论 B（关于 transcript_commitment.hash）**：`hash` 不是 Quicksilver proof 本体。它是 transcript 字节范围的哈希承诺值；Quicksilver 的作用是让这类 VM/MPC 计算过程可验证、不可随意伪造。

### 7.2 代码级证据：Quicksilver 确实被接入

#### 7.2.1 依赖层（Cargo）

在 `packages/verifier/Cargo.lock` 可以看到 `mpz-zk` 与 `mpz-zk-core`：

- [packages/verifier/Cargo.lock](packages/verifier/Cargo.lock) 中 `mpz-zk`（`name = "mpz-zk"`）
- [packages/verifier/Cargo.lock](packages/verifier/Cargo.lock) 中 `mpz-zk-core`（`name = "mpz-zk-core"`）

且来源为：

```
git+https://github.com/privacy-ethereum/mpz?tag=v0.1.0-alpha.5#2974a83...
```

#### 7.2.2 协议实现层（tlsn）

在 [packages/tlsn-wasm/tlsn/crates/tlsn/src/mpz.rs](packages/tlsn-wasm/tlsn/crates/tlsn/src/mpz.rs)：

```rust
use mpz_zk::{Prover, Verifier};

pub(crate) type ProverZk = Prover<...>;
pub(crate) type VerifierZk = Verifier<...>;

// DEAP VM = MPC backend + ZK backend
pub(crate) vm: Arc<Mutex<Deap<ProverMpc, ProverZk>>>
pub(crate) vm: Arc<Mutex<Deap<VerifierMpc, VerifierZk>>>
```

这说明 tlsn 运行时把 `mpz_zk` 作为 ZK 后端嵌入 DEAP 虚拟机。

#### 7.2.3 Quicksilver 明示证据（mpz-zk-core）

对应依赖源码（本机 cargo checkout）中：

- [C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk-core\src\lib.rs](C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk-core\src\lib.rs) 首行注释：`QuickSilver zk protocol https://eprint.iacr.org/2021/076`
- [C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk-core\src\check.rs](C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk-core\src\check.rs) 首行注释：`QuickSilver consistency check`

并且在 `mpz-zk` 的 prover/verifier 执行中可见 `check(...)` 调用（包含 sVOLE 相关材料）：

- [C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk\src\prover.rs](C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk\src\prover.rs)
- [C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk\src\verifier.rs](C:\Users\looik\.cargo\git\checkouts\mpz-ff613164c8c25a96\2974a83\crates\zk\src\verifier.rs)

### 7.3 Prover 是否通过 Quicksilver 生成证明？

#### 7.3.1 调用链（从 Extension 到 tlsn）

1. Extension 组织 `revealPayload`，可选带 `transcript_commit`：  
   [packages/extension/src/offscreen/SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts)
2. 调用 WASM `prover.reveal(...)`：  
   [packages/tlsn-wasm-pkg/tlsn_wasm.d.ts](packages/tlsn-wasm-pkg/tlsn_wasm.d.ts)
3. WASM 侧 `reveal()` 构建 `ProveConfig`，再调用 `prover.prove(&config)`：  
   [packages/tlsn-wasm/tlsn/crates/wasm/src/prover/mod.rs](packages/tlsn-wasm/tlsn/crates/wasm/src/prover/mod.rs)
4. `prove()` 内部执行 `prove_plaintext` / `prove_hash` 后，统一 `vm.execute_all(ctx)`：  
   [packages/tlsn-wasm/tlsn/crates/tlsn/src/prover/prove.rs](packages/tlsn-wasm/tlsn/crates/tlsn/src/prover/prove.rs)

由于该 VM 的 ZK 后端是 `mpz_zk::Prover`（上节证据），所以这一步会走 Quicksilver 一致性检查路径。

#### 7.3.2 准确表述

“Prover 通过 Quicksilver 生成证明”在工程语义上是**对的，但不完整**。更完整应写成：

> Prover 在 DEAP/MPC-TLS 协议中，通过 `mpz_zk`（Quicksilver 实现）完成内部 ZK 一致性证明与校验；最终对外暴露的是 reveal 结果与 commitments，而非独立 SNARK 证明对象。

### 7.4 `transcript_commitment.hash` 与 Quicksilver 的关系

#### 7.4.1 hash 的直接定义（当前代码）

在 [packages/tlsn-wasm/tlsn/crates/core/src/transcript/hash.rs](packages/tlsn-wasm/tlsn/crates/core/src/transcript/hash.rs) 明确写了：

```rust
/// By convention, plaintext is hashed as `H(msg | blinder)`.
```

在 [packages/tlsn-wasm/tlsn/crates/tlsn/src/transcript_internal/commit/hash.rs](packages/tlsn-wasm/tlsn/crates/tlsn/src/transcript_internal/commit/hash.rs) 的实现顺序也是：

1. `hasher.update(plaintext ranges...)`
2. `hasher.update(blinder)`
3. `finalize()`

即：

```
commitment = Hash(plaintext || blinder)
```

#### 7.4.2 与 Quicksilver 的“直接/间接”关系

- **直接语义**：`transcript_commitment.hash` 是哈希承诺值（SHA256/BLAKE3/KECCAK256），不是 Quicksilver proof。
- **间接语义**：该承诺在同一 VM 执行图中被生成/验证，而 VM 的 ZK 一致性层由 Quicksilver 实现，因此它受 Quicksilver 保障流程影响。

可以理解为：

```
Quicksilver: 证明“你在 VM/MPC 中按规则算了这些值”
commitment hash: 被算出来并对外发布的“值本身”
```

### 7.5 Verifier 侧如何消费这些结果

Verifier 侧 `verify()` 后拿到：

- `transcript`
- `transcript_commitments`

代码在：

- [packages/verifier/src/verifier.rs](packages/verifier/src/verifier.rs)

随后服务端再执行：

1. `verify_reveal_config()`：确认请求披露范围都在 `sent_authed/received_authed`  
   [packages/verifier/src/main.rs](packages/verifier/src/main.rs)
2. `process_ranges()`：从认证 transcript 中抽取字段值
3. 返回 `results + transcriptCommitments`

所以，业务层拿到的是“可消费的数据结构”，不是 Quicksilver 原始证明对象。

### 7.6 对链上验证设计的影响

这对链上设计有两个现实含义：

1. 当前返回的 `transcriptCommitments[].hashHex` 适合做链上 commitment（尤其 Keccak256）。
2. 但链上不会直接“验证 Quicksilver 协议 transcript”；链上通常验证的是：
   - 可信 Verifier 签名（工程最快路径）
   - 或用户提交 opening / ZK 电路证明（去信任化路径）

### 7.7 勘误与补充（针对本文前文）

为避免歧义，这里补充两点与当前代码一致的事实：

1. **承诺拼接顺序**（当前版本）  
   不是 `Hash(blinder || plaintext)`，而是 `Hash(plaintext || blinder)`。  
   依据见：
   - [packages/tlsn-wasm/tlsn/crates/core/src/transcript/hash.rs](packages/tlsn-wasm/tlsn/crates/core/src/transcript/hash.rs)
   - [packages/tlsn-wasm/tlsn/crates/tlsn/src/transcript_internal/commit/hash.rs](packages/tlsn-wasm/tlsn/crates/tlsn/src/transcript_internal/commit/hash.rs)

2. **blinder 生成方**（当前版本）  
   `prove_hash()` 中由 Prover 侧随机生成并 `commit` 到 VM，不是“Verifier 单方决定的常量接口”。  
   依据见：
   - [packages/tlsn-wasm/tlsn/crates/tlsn/src/transcript_internal/commit/hash.rs](packages/tlsn-wasm/tlsn/crates/tlsn/src/transcript_internal/commit/hash.rs)

---

## 附录：关键文件索引

| 功能 | 文件 |
|------|------|
| MPC-TLS Verifier 核心 | [packages/verifier/src/verifier.rs](packages/verifier/src/verifier.rs) |
| 会话管理与范围验证 | [packages/verifier/src/main.rs](packages/verifier/src/main.rs) |
| WASM Prover/Verifier API | [packages/tlsn-wasm-pkg/tlsn_wasm.d.ts](packages/tlsn-wasm-pkg/tlsn_wasm.d.ts) |
| Prove 流程编排 | [packages/extension/src/offscreen/SessionManager.ts](packages/extension/src/offscreen/SessionManager.ts) |
| ProveManager（WebSocket管理）| [packages/extension/src/offscreen/ProveManager/index.ts](packages/extension/src/offscreen/ProveManager/index.ts) |
| Plugin SDK（Host + Parser）| [packages/plugin-sdk/src/index.ts](packages/plugin-sdk/src/index.ts) |
| 类型定义（Handler/Proof）| [packages/plugin-sdk/src/types.ts](packages/plugin-sdk/src/types.ts) |
| Twitter 插件示例 | [packages/demo/plugins/twitter.plugin.ts](packages/demo/plugins/twitter.plugin.ts) |

---

*文档生成日期：2026-03-18。基于 tlsn v0.1.0-alpha.14。*
