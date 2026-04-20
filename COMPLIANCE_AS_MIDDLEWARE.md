# zkTLS 中间件合规方案

**版本：** v1.1  
**日期：** 2026-04-20  
**定位：** 面向交易所集成的 zkTLS 证明中间件合规设计  
**适用论文：** 《基于 zkTLS 的半去中心化 C2C 兑换协议设计与实现》

---

## 一、先把问题想清楚：我们是谁

### 1.1 中间件 vs VASP，责任边界完全不同

FATF 40 条建议的规制对象是**持牌金融机构和 VASP**，不是技术服务提供商本身。本系统作为 zkTLS 中间件，在合规框架里的定位是：

```
[用户] ──付款──▶ [Wise / Alipay / 支付平台]
                        │ TLS 连接
                        ▼
              [zkTLS 中间件（本系统）]
              证明事实，不接触资金
                        │ 签名证明包
                        ▼
              [交易所 / VASP] ◀── 合规主体
              负责 KYC、制裁筛查、SAR 申报
                        │ 链上结算
                        ▼
                   [智能合约]
```

**中间件的核心价值：** 把"某笔付款确实发生了"这一事实，从不可信的截图变成密码学上不可伪造的证明，供交易所合规系统使用。

**中间件不做的事（交易所负责）：**
- KYC/CDD（客户身份核验）
- 制裁名单筛查（OFAC、UN 等）
- 可疑交易报告（SAR）
- 监管申报
- 持牌/注册

---

## 二、FATF 条款过滤：哪些条款与中间件有关

FATF 40 条建议中，与技术基础设施提供商直接相关的只有以下几条：

| 条款 | 名称 | 与中间件的关系 | 谁来满足 |
|---|---|---|---|
| **R.11** | 记录保存 | 中间件产出的证明包必须支持被 VASP 留存 5 年 | **中间件负责"可检索"，交易所负责"实际存档"** |
| **R.15** | 新技术风险 | 中间件必须有版本化的策略，确保行为可预测、可审计 | **中间件负责** |
| **R.16** | 旅行规则 | 中间件的证明必须覆盖旅行规则所需的账户归属事实 | **中间件负责"事实证明"，交易所负责"PII 传输"** |
| R.10 | 客户尽调 | `accountChecks` 验证账户归属，辅助交易所 KYC 核实 | 交易所负责，中间件提供辅助验证手段 |
| R.26/28 | VASP 监管 | 与中间件无关，是交易所的持牌义务 | 交易所负责 |

**结论：** 中间件需要关注的 FATF 条款只有三条：**R.11（记录保存）、R.15（新技术治理）、R.16（旅行规则事实覆盖）**。

---

## 三、旅行规则（R.16）深度分析：中间件能做什么

### 3.1 旅行规则要求传输的数据

R.16 要求在转账时，发起方机构向接收方机构传递以下信息：

**金额 ≥ USD 1,000 时（完整信息）：**
| 字段 | 发起方（Originator） | 受益方（Beneficiary） |
|---|---|---|
| 姓名 | 必须 | 必须 |
| 账户号码 / 钱包地址 | 必须 | 必须 |
| 实际地址 | 必须 | — |
| 国家身份证号 或 出生日期+地点 | 二选一 | — |

**金额 < USD 1,000 时（简化信息）：**
- 仅需双方姓名和账户号码 / 钱包地址

**2025 年 R.16 修订新增：**
- 强调跨境转账的「收款确认（Confirmation of Payee）」机制
- 要求技术工具支持实时名称匹配核验

### 3.2 中间件覆盖的是哪一层

旅行规则分两层：

1. **PII 传输层**：实际姓名/地址数据在机构间传递（交易所对交易所，用 TRISA / OpenVASP / Notabene 等协议）
2. **事实验证层**：密码学地证明"付款人就是他们声称的那个账户持有人"

**中间件精确解决第 2 层：**

| 旅行规则需求 | 中间件如何覆盖 |
|---|---|
| 发起方账户真实存在 | zkTLS 证明来自支付平台真实 TLS 响应，不可伪造 |
| 发起方账户归属于某人 | `accountChecks`：transcript 字段哈希与链上 KYC 注册哈希一致 |
| 付款金额准确 | `handlers` BODY/JSON reveal：证明金额字段值 |
| 付款目标账户正确 | `accountChecks` 受益方字段：证明收款方 ID 匹配 |
| 事件不可否认 | `verifierSignature`：ECDSA 签名，链上可验证 |
| 时间戳可信 | TLS 握手时间戳，协议层保证 |

**交易所仍需负责：** 把上述哈希反查为明文 PII，通过 TRISA 等协议传输给对手方交易所。中间件提供"密码学背书的事实"，而非明文 PII。

---

## 四、当前代码库状态：已有什么、缺什么

### 4.1 已经实现的（不需要改动）

| 功能 | 代码位置 | 满足哪个 FATF 需求 |
|---|---|---|
| TLS 证明生成（不可伪造） | `packages/extension/src/offscreen/ProveManager/` | R.16 事实真实性 |
| 选择性披露（handlers） | `packages/verifier/src/main.rs` → `RevealConfig` | R.16 最小披露 |
| 账户哈希校验（accountChecks） | `packages/verifier/src/main.rs` → `AccountCheck` | R.16 账户归属验证 |
| ECDSA 验证者签名 | `packages/verifier/src/main.rs` → `VerifierSignature` | R.16 不可否认性 |
| 承诺哈希（commitmentsHash） | `VerifierSignature.commitments_hash` | R.11 证据完整性 |
| 脱敏 transcript（redactedTranscript） | `packages/verifier/src/main.rs` → `RedactedTranscript` | R.11 深度审计材料 |
| Webhook 推送机制 | `packages/verifier/src/main.rs` → `send_webhook()` | R.11 实时通知骨架 |
| sessionId 追踪 | `packages/verifier/src/main.rs` → UUID session | R.11 证据标识 |
| 链上订单绑定（orderBindingHash） | `VerifierSignature.order_binding_hash` | R.16 支付链路完整性 |

### 4.2 缺少的（需要新增）

| 缺口 | 影响条款 | 严重程度 |
|---|---|---|
| 没有版本化策略声明（policyVersion） | R.15 | 高 |
| 没有证明检索 API（只有单次 webhook 推送） | R.11 | 高 |
| 没有标准化证明导出格式（ProofExportV1） | R.11 | 高 |
| 旅行规则字段无语义标签，交易所无法直接解析 | R.16 | 高 |
| Webhook 推送无来源认证，可被伪造 | R.11 安全性 | 中 |
| Webhook 推送含大量数据（脱敏 transcript），超出实时需求 | 数据最小化 | 中 |
| 没有版本化 API 规范 | R.15 | 中 |

---

## 五、完整合规方案

### 5.0 核心设计原则：按需分层

本方案围绕一个核心原则展开：**实时通知轻量化，完整证据按需取**。

```
                      ┌──────────────────────────────────────────┐
                      │           Verifier Server                │
                      │                                          │
Plugin SDK ─────────▶│  zkTLS 证明 + 选择性披露 + ECDSA 签名    │
(policyVersion,       │                                          │
 handler labels)      │  ① 持久化完整证明到 SQLite               │
                      │     (ProofExportV1，含脱敏 transcript)   │
                      │                                          │
                      │  ② 推送瘦 webhook 给交易所               │
                      │     (仅旅行规则字段 + accountChecks结果  │
                      │      + verifierSignature + HMAC)         │
                      └──────────┬───────────────┬──────────────┘
                                 │ 瘦 webhook     │ GET /proof/{id}
                                 ▼               ▼（按需，审计时）
                      ┌──────────────────┐  ┌────────────────────┐
                      │  交易所合规系统   │  │  Proof Store       │
                      │  实时决策        │  │  完整证明存档       │
                      │  TRISA PII 传输  │  │  5 年检索          │
                      └──────────────────┘  └────────────────────┘
                               │
                    链上确认后 PATCH /proof/{id}/tx
```

**分层逻辑：**
- **瘦 webhook**：交易所实时合规判断只需旅行规则事实字段和验证结果，不需要 transcript 原文
- **ProofExportV1（GET /proof）**：完整证明包含脱敏 transcript，仅在审计、存档、争议时才需要
- **HMAC**：认证瘦 webhook 的来源，防止攻击者伪造"证明已通过"通知

---

### 改动一：policyVersion 透传链（解决 R.15）

**目标：** 每个 attestation 都带有策略版本声明，交易所和监管方可核实"当时用的是哪个版本的规则"。

**`packages/plugin-sdk/src/types.ts`** — `PluginConfig` 增加必填字段：
```typescript
policyVersion: string;   // 必填，格式 "v{major}.{minor}.{patch}"，例如 "v1.0.0"
```

`ProveOptions` 增加可选字段（用于动态覆盖）：
```typescript
policyVersion?: string;
```

**各 plugin 文件**（`wise.plugin.ts`、`alipay.plugin.ts` 等）— `config` 对象加：
```javascript
policyVersion: 'v1.0.0',
```

**`packages/extension/src/offscreen/SessionManager.ts`** — 构造 sessionData 时：
```typescript
sessionData['__tlsn_policy_version'] =
  proverOptions.policyVersion ?? pluginConfig.policyVersion;
```

**`packages/verifier/src/main.rs`** — `VerifierSignature` struct 加字段，并在签名前从 `session_data` 读取：
```rust
pub(crate) policy_version: Option<String>,
```

**R.15 满足逻辑：** `policyVersion` 进入 ECDSA 签名内容，策略版本被密码学锁定在每个 attestation 中。任何策略变更需升级版本号，历史证明与新策略证明不可混淆，行为版本化可追溯。

---

### 改动二：证明持久化 API（解决 R.11）

**目标：** verifier 内置持久化层，交易所随时可检索历史证明，满足 5 年记录保存要求。

**当前问题：** verifier 无状态，session 完成后清理，webhook 只推送一次，无后续检索能力。

**`packages/verifier/Cargo.toml`** — 新增依赖：
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

**`packages/verifier/src/main.rs`** — 新增 SQLite 持久化层和三个 HTTP 端点。

数据库表（在服务启动时创建）：
```sql
CREATE TABLE IF NOT EXISTS proof_store (
    session_id         TEXT PRIMARY KEY,
    server_name        TEXT NOT NULL,
    policy_version     TEXT,
    order_binding_hash TEXT,
    commitments_hash   TEXT NOT NULL,
    verifier_signature TEXT,          -- JSON
    handler_results    TEXT NOT NULL, -- JSON array（含 label 字段）
    account_checks     TEXT,          -- JSON array（含 passed 字段）
    redacted_sent      TEXT,          -- 脱敏 transcript sent
    redacted_recv      TEXT,          -- 脱敏 transcript recv
    session_data       TEXT,          -- JSON，含 policyVersion 等元数据
    tx_hash            TEXT,          -- 链上确认后由交易所 PATCH 写入
    recorded_at        TEXT NOT NULL, -- ISO8601
    retain_until       TEXT NOT NULL  -- recorded_at + 5 years
);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON proof_store(tx_hash);
```

新增三个 HTTP 端点：
```
GET   /proof/{sessionId}       → 返回完整 ProofExportV1（含脱敏 transcript）
PATCH /proof/{sessionId}/tx    → 交易所链上确认后写入 txHash
GET   /proof?txHash={hash}     → 按 txHash 反查，返回完整 ProofExportV1
```

写入时机：`session_completed` 处理完毕、发送 webhook 之前同步写入 SQLite。

**`packages/demo/src/components/ContractSubmit.tsx`** — 在 `setTxHash(hash)` 之后补写一行：
```typescript
await fetch(`${verifierHost}/proof/${attestationId}/tx`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ txHash: hash, chainId }),
});
```

**R.11 满足逻辑：** 服务端 SQLite 磁盘持久，`retain_until = recorded_at + 5年`，通过 `GET /proof/{id}` 随时检索完整证明包可导出给监管机构。生产环境替换为 PostgreSQL，接口不变。

---

### 改动三：瘦 Webhook + HMAC 来源认证（解决数据最小化 + R.11 安全性）

**目标：**
1. webhook 只推送交易所实时决策所需的最小字段，不推送 transcript 原文
2. 通过 HMAC-SHA256 让交易所能验证 webhook 确实来自本 verifier，防止伪造通知

**为什么要分开：**

当前 `WebhookPayload` 包含 `redactedTranscript`（脱敏 transcript 字节串），体积大且实时决策用不到。交易所合规系统需要的只是：
- 这笔证明通过了（`accountChecksAllPassed`）
- 旅行规则关键字段值（`travelRuleFields`）
- 签名，供后续链上验证（`verifierSignature`）

脱敏 transcript 仅在审计或争议时才需要，通过 `GET /proof/{sessionId}` 按需拉取即可。

**数据对比：**

| | 当前 fat webhook | 新的 slim webhook |
|---|---|---|
| 脱敏 transcript（通常 10-100 KB） | 每笔都推送 | 不推送，按需 GET |
| 旅行规则字段 | 无结构化 | 按 label 索引 |
| 来源认证 | 静态 header token | HMAC-SHA256 签名 |
| 交易所实时处理 | 需解析大 payload | 小 payload，直接使用 |

**新的瘦 webhook payload 结构（仅包含实时决策所需字段）：**
```json
{
  "attestationId": "sess_xxx",
  "policyVersion": "v1.0.0",
  "serverName": "wise.com",
  "travelRuleFields": {
    "originator.amount":      { "value": "720.00",          "commitmentIndex": 2 },
    "originator.currency":    { "value": "MYR",             "commitmentIndex": 3 },
    "beneficiary.accountId":  { "value": "john@wise.com",   "commitmentIndex": 5 }
  },
  "accountChecksAllPassed": true,
  "verifierSignature": "0x...",
  "verifierAddress": "0x...",
  "orderBindingHash": "0x...",
  "timestamp": "2026-04-20T10:00:00Z"
}
```

HTTP header 附加 HMAC 签名（对整个 JSON body 计算）：
```
X-TLSN-Signature: sha256=a3f8c2d1...
```

**`packages/verifier/src/main.rs`** — 改动点：
1. 在 `WebhookPayload` struct 中移除 `transcript` 字段，替换为上述精简结构
2. `send_webhook()` 中计算 `HMAC-SHA256(secret, payload_json)` 并写入请求 header
3. `config.yaml` 新增 `secret` 字段：

```yaml
webhooks:
  "wise.com":
    url: "https://exchange.example.com/webhook/tlsn"
    secret: "your-hmac-secret"    # 新增，用于 HMAC 签名
    headers:
      X-Source: "tlsn-verifier"
```

**交易所接收端验证 HMAC（伪代码）：**
```typescript
const expected = hmacSha256(webhookSecret, rawBody);
const received = req.headers['x-tlsn-signature'].replace('sha256=', '');
if (!timingSafeEqual(expected, received)) return res.status(401).end();
// 验证通过 → 处理 travelRuleFields
```

**交易所何时调用 GET /proof：**
```typescript
// 日常合规：只用 slim webhook，不拉 GET
// 归档（R.11）：每天批量拉取当日全部 attestation 的完整 ProofExportV1 存档
// 争议处理：按 txHash 反查完整证明
await fetch(`${verifierHost}/proof/${attestationId}`);  // → ProofExportV1
```

**数据最小化满足逻辑：** 脱敏 transcript 不再无条件推送，仅在需要时按需获取，减少数据暴露面，符合最小必要原则。  
**R.11 安全性满足逻辑：** HMAC 确保交易所存档的证明来源可信，攻击者无法伪造 webhook 通知。

---

### 改动四：旅行规则事实标签（解决 R.16 可解析性）

**目标：** handler 输出的字段用标准化语义标签标注，交易所合规系统无需理解 handler 内部格式即可解析旅行规则字段。

**已有基础：** `types.ts` 里 `Handler` 的 `label` 字段已存在但未被系统性使用，`verifier/main.rs` 中 `Handler` struct 缺少对应字段。

**`packages/plugin-sdk/src/types.ts`** — 新增旅行规则标签枚举：
```typescript
export type TravelRuleFieldLabel =
  | 'originator.accountId'    // 发起方账户标识符（email、用户名等）
  | 'originator.name'         // 发起方姓名
  | 'originator.amount'       // 转账金额
  | 'originator.currency'     // 货币类型
  | 'originator.timestamp'    // 付款时间
  | 'beneficiary.accountId'   // 受益方账户标识符
  | 'beneficiary.name'        // 受益方姓名
  | 'beneficiary.amount'      // 到账金额
  | 'transaction.id'          // 平台侧交易 ID
  | 'transaction.status'      // 交易状态（completed / pending）
  | string;                   // 自定义标签（向后兼容）
```

**各 plugin 文件** — handler 的 `label` 字段使用标准枚举，例如 `wise.plugin.ts`：
```javascript
handlers: [
  { type: 'RECV', part: 'BODY', action: 'REVEAL',
    params: { type: 'json', path: 'amount' },
    label: 'originator.amount' },
  { type: 'RECV', part: 'BODY', action: 'REVEAL',
    params: { type: 'json', path: 'targetRecipient.email' },
    label: 'beneficiary.accountId' },
  { type: 'RECV', part: 'BODY', action: 'REVEAL',
    params: { type: 'json', path: 'targetCurrency' },
    label: 'originator.currency' },
]
```

**`packages/verifier/src/main.rs`** — `Handler` struct 新增 `label` 字段：
```rust
pub(crate) label: Option<String>,
```
`HandlerResult` 同步新增 `label: Option<String>`，使 label 随结果一并序列化输出。

**R.16 满足逻辑：** 交易所收到 slim webhook 后，`travelRuleFields` 已按 label 索引好，无需解析 handler 内部格式，直接喂给旅行规则合规系统。

---

### 改动五：标准化证明导出格式 ProofExportV1（R.11 存档合约）

**目标：** 定义稳定、版本化的 JSON 结构作为中间件与交易所之间的合规数据合约，供 `GET /proof/{id}` 返回。

**`packages/plugin-sdk/src/types.ts`** — 新增 interface：

```typescript
/**
 * ProofExportV1 — zkTLS 中间件标准化证明导出格式
 *
 * 用途：
 *   - 交易所合规存档（R.11，5年检索）
 *   - 旅行规则事实验证（R.16）
 *   - 审计回放与争议处理
 *
 * 稳定性约定：字段只增不减，破坏性变更升级到 ProofExportV2
 */
export interface ProofExportV1 {
  formatVersion: 'ProofExportV1';

  // ── 证明标识 ─────────────────────────────────────────
  attestationId: string;          // 等同于 verifier sessionId，全局唯一
  txHash: string | null;          // 链上确认后写入，初始 null
  policyVersion: string;
  timestamp: string;              // ISO8601

  // ── 证明来源 ─────────────────────────────────────────
  serverName: string;             // TLS 服务器 hostname（例如 "wise.com"）
  verifierVersion: string;        // verifier 服务器版本

  // ── 旅行规则事实字段 ──────────────────────────────────
  travelRuleFields: {
    [label: string]: {            // key 为 TravelRuleFieldLabel
      value: string;
      commitmentIndex: number;    // 对应 transcriptCommitments 索引，供独立验证
    };
  };

  // ── 账户归属验证结果 ──────────────────────────────────
  accountChecks: Array<{
    fieldLabel: string;           // 例如 "beneficiary.accountId"
    direction: 'SENT' | 'RECV';
    expectedHash: string;         // 来自交易所 KYC 注册的期望哈希
    passed: boolean;
  }>;

  // ── 密码学证据 ────────────────────────────────────────
  orderBindingHash: string | null;
  commitmentsHash: string;
  verifierSignature: string;      // 65字节 ECDSA，0x 前缀
  verifierAddress: string;        // 0x 前缀 Ethereum 地址
  chainId: number;

  // ── 深度审计材料（仅此格式包含，slim webhook 不含）────
  redactedTranscript: {
    sent: string;                 // 未披露字节已清零
    recv: string;
  };
  transcriptCommitments: TranscriptCommitmentSummary[];
}
```

**R.11 满足逻辑：** 包含完整密码学证据链，5 年后可脱离在线 verifier 独立回放验证。交易所按需拉取后存入自己的数据库。

---

### 改动六：API 版本化文档（R.15 治理）

**目标：** 发布稳定、版本化的 verifier API 规范，交易所集成可依赖。

**新增文件：** `packages/verifier/API_SPEC.md`（纯文档，无代码改动）

文档包含：
- WebSocket 协议版本（当前：`tlsn-verifier/v1`）
- 全部 HTTP 端点的请求/响应 JSON schema
- `policyVersion` 生命周期管理规则（升版流程、废弃通知窗口期）
- 破坏性变更通知流程
- slim webhook 字段说明与 ProofExportV1 完整字段说明

已实现的 `GET /info` 端点返回的 `version` 字段作为 API 版本锚点，交易所可以此判断兼容性。

---

## 六、交易所集成指南

### 6.1 交易所需要提供给中间件的

| 数据 | 何时提供 | 用途 |
|---|---|---|
| `nameHash = keccak256(customerName)` | KYC 注册时，存入链上合约 | accountChecks 的期望哈希 |
| `idHash = keccak256(customerId)` | KYC 注册时，存入链上合约 | 同上 |
| `orderBindingHash` | 下单时，写入 sessionData | 订单与证明绑定，防跨单挪用 |
| `webhookSecret` | 部署配置时，写入 config.yaml | HMAC 验证 webhook 来源 |

### 6.2 中间件向交易所交付的

| 交付物 | 内容 | 交付方式 | 何时使用 |
|---|---|---|---|
| **瘦 webhook** | 旅行规则字段 + accountChecks 结果 + verifierSignature + HMAC | Webhook POST（实时） | 每笔交易实时合规判断 |
| **完整证明包** | `ProofExportV1`（含脱敏 transcript + 承诺列表） | `GET /proof/{id}` | 合规存档、审计、争议处理 |
| **txHash 写入** | 链上确认后补写 | `PATCH /proof/{id}/tx` | 链上确认后由交易所调用 |
| **逆向检索** | 按 txHash 查 attestationId 和完整证明 | `GET /proof?txHash=` | 监管查询、事后核查 |

### 6.3 交易所自行处理的（不在本中间件范围内）

1. **KYC/CDD**：注册用户，计算 `nameHash`/`idHash` 存入链上合约
2. **制裁筛查**：对照 OFAC、UN、EU 等制裁名单
3. **旅行规则 PII 传输**：通过 TRISA / OpenVASP / Notabene 向对手方交易所传输明文身份信息
4. **SAR 申报**：向金融情报机构报告可疑交易
5. **证明 5 年存档**：调用 `GET /proof/{id}` 拉取 `ProofExportV1` 存入自己的数据库

---

## 七、整体改动量总结

| 改动 | 文件 | 类型 | 规模 |
|---|---|---|---|
| `policyVersion` 字段 + `TravelRuleFieldLabel` 枚举 + `ProofExportV1` interface | `packages/plugin-sdk/src/types.ts` | 类型扩展 | ~80行 |
| SessionManager 透传 `policyVersion` | `packages/extension/src/offscreen/SessionManager.ts` | 小改 | ~10行 |
| Verifier：`policyVersion`/`label` 进签名；SQLite 持久化；3 个新端点；瘦 webhook；HMAC | `packages/verifier/src/main.rs` | 新增+改 | ~180行 |
| rusqlite 依赖 | `packages/verifier/Cargo.toml` | 配置 | 2行 |
| webhook `secret` 字段 | `packages/verifier/config.yaml` | 配置 | 1行/endpoint |
| 各 plugin：`policyVersion` + handler `label` 标注 | `wise.plugin.ts`、`alipay.plugin.ts` | 小改 | 各~15行 |
| ContractSubmit：PATCH txHash | `packages/demo/src/components/ContractSubmit.tsx` | 小改 | ~8行 |
| API 规范文档 | `packages/verifier/API_SPEC.md` | 新建文档 | — |

**总计：约 310 行新增，60 行修改。不触碰 WASM、合约、核心协议。**

---

## 八、满足情况对照表

| FATF 条款 | 要求 | 本方案如何满足 | 责任归属 |
|---|---|---|---|
| **R.11** 记录保存 5 年 | 证据可留存、可重建 | SQLite 持久化 + `GET /proof/{id}` + `retain_until` | 中间件提供检索，交易所实际存档 |
| **R.15** 新技术风险治理 | 行为可预测、可审计 | `policyVersion` 进 ECDSA 签名；版本化 API Spec | 中间件负责 |
| **R.16** 旅行规则事实覆盖 | 账户归属可验证、字段可解析 | `TravelRuleFieldLabel` 标签化字段 + `accountChecks` + 瘦 webhook | 中间件负责事实层，交易所负责 PII 传输层 |
| R.10 客户尽调 | 身份核验 | `accountChecks` 辅助账户归属验证 | 交易所主责，中间件辅助 |
| R.16 PII 传输 | 明文身份信息传输 | 不在中间件范围 | 交易所负责（TRISA 等） |
| R.26/28 VASP 持牌 | 持牌/监管 | 完全不在中间件范围 | 交易所负责 |

---

## 九、局限性声明

1. **本中间件是"事实验证基础设施"，不是合规主体**。使用本中间件的交易所仍需独立满足其 VASP 监管义务。

2. **`ProofExportV1` 提供密码学证据，不提供法律认定**。监管机构是否接受此类证明作为 R.11/R.16 的充分证据，取决于各司法管辖区的监管解释。

3. **SQLite 适用于 demo 和小规模生产环境**。高可用生产环境需替换为带备份、访问控制和审计日志的 PostgreSQL，接口层不变。

4. **账户归属验证依赖 KYC 注册的正确性**。若交易所 KYC 注册中的哈希来自伪造信息，中间件无法检测，这是边界以外的信任假设。

---

*本文档适用于《基于 zkTLS 的半去中心化 C2C 兑换协议设计与实现》论文技术方案章节及面向交易所的中间件集成说明。*
