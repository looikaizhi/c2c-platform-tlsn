# zkTLS 中间件合规方案

**版本：** v1.2  
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
| R.10 | 客户尽调 | `accountChecks` 验证账户归属，辅助交易所 KYC 核实 | 交易所主责，中间件提供辅助验证手段 |
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

**交易所仍需负责：** 把上述哈希反查为明文 PII，通过 TRISA 等协议传输给对手方交易所。

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
- **瘦 webhook**：实时合规判断只需旅行规则事实字段和验证结果，不需要 transcript 原文
- **ProofExportV1（GET /proof）**：完整证明包，仅在审计、存档、争议时才需要
- **HMAC**：认证瘦 webhook 的来源，防止攻击者伪造通知

---

### 改动一：policyVersion 透传链（解决 R.15）

**目标：** 每个 attestation 都带有策略版本声明，策略版本被密码学锁定在签名中。

**`packages/plugin-sdk/src/types.ts`** — `PluginConfig` 增加**可选**字段：
```typescript
policyVersion?: string;   // 格式 "v{major}.{minor}.{patch}"，例如 "v1.0.0"
```

`ProveOptions` 增加可选字段（用于动态覆盖）：
```typescript
policyVersion?: string;
```

**各 plugin 文件**（`wise.plugin.ts`、`alipay.plugin.ts` 等）— `config` 对象加：
```javascript
policyVersion: 'v1.0.0',
```

**`packages/plugin-sdk/src/index.ts`** — `extractConfig` 函数增加 policyVersion 提取（在 `versionMatch` 同级位置）：
```typescript
const policyVersionMatch = code.match(/policyVersion\s*:\s*['"`]([^'"`]+)['"`]/);
if (policyVersionMatch) {
  config.policyVersion = policyVersionMatch[1];
}
```

**`packages/extension/src/offscreen/SessionManager.ts`** — 构造 sessionData 时注入：
```typescript
sessionData['__tlsn_policy_version'] =
  proverOptions.policyVersion ?? pluginConfig?.policyVersion ?? 'unspecified';
```

**`packages/verifier/src/main.rs`** — `VerifierSignature` struct 加字段：
```rust
pub(crate) policy_version: Option<String>,
```
在 `sign_commitments` 调用前从 `session_data` 读取，并纳入签名消息内容。

#### ⚠️ 已知报错与修复

| 报错 | 原因 | 修复方案 |
|---|---|---|
| `Property 'policyVersion' is missing in type '{ name: string; description: string; }' but required in type 'PluginConfig'` | 若设为必填，`extractConfig` 里构造对象缺该字段 | **设为可选（`policyVersion?: string`）**，不要设为必填 |
| `sessionData['__tlsn_policy_version']` 在运行时为 `undefined` | `extractConfig` 原先无解析 `policyVersion` 的逻辑 | 在 `extractConfig` 里补充正则匹配（见上方代码） |
| 各 plugin 文件 TypeScript 报错（若设为必填） | 老插件没有 `policyVersion` 字段 | 设为可选字段，老插件无需修改 |

---

### 改动二：证明持久化 API（解决 R.11）

**目标：** verifier 内置 SQLite 持久化层，交易所随时可检索历史证明。

**`packages/verifier/Cargo.toml`** — 新增依赖：
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

**`packages/verifier/src/main.rs`** 变更：

1. `AppState` struct 新增 `db` 字段：
```rust
pub(crate) struct AppState {
    pub(crate) sessions: Arc<Mutex<HashMap<String, SessionData>>>,
    pub(crate) config:   Arc<Config>,
    pub(crate) db:       Arc<std::sync::Mutex<rusqlite::Connection>>,  // 注意：std::sync::Mutex
}
```

2. `main()` 里初始化 DB 连接（新增在 `app_state` 构造之前）：
```rust
let db_path = std::env::var("PROOF_DB_PATH").unwrap_or_else(|_| "evidence.db".to_string());
let conn = rusqlite::Connection::open(&db_path).expect("Failed to open SQLite DB");
conn.execute_batch(include_str!("schema.sql")).expect("Failed to init DB schema");
let db = Arc::new(std::sync::Mutex::new(conn));
```

3. `app_state` 构造加上 `db: db.clone()`

4. `main()` 路由新增三条：
```rust
.route("/proof/:session_id",      get(get_proof_handler))
.route("/proof/:session_id/tx",   patch(patch_proof_tx_handler))
.route("/proof",                  get(get_proof_by_tx_handler))
```

5. 新建 `packages/verifier/src/schema.sql`：
```sql
CREATE TABLE IF NOT EXISTS proof_store (
    session_id         TEXT PRIMARY KEY,
    server_name        TEXT NOT NULL,
    policy_version     TEXT,
    order_binding_hash TEXT,
    commitments_hash   TEXT NOT NULL,
    verifier_signature TEXT,
    handler_results    TEXT NOT NULL,
    account_checks     TEXT,
    redacted_sent      TEXT,
    redacted_recv      TEXT,
    session_data       TEXT,
    tx_hash            TEXT,
    recorded_at        TEXT NOT NULL,
    retain_until       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON proof_store(tx_hash);
```

6. session 完成后（webhook 发送之前）同步写入：
```rust
tokio::task::spawn_blocking({
    let db = state.db.clone();
    let record = build_proof_record(&session_id, &handler_results, &verifier_signature, ...);
    move || {
        let conn = db.lock().unwrap();
        insert_proof_record(&conn, &record);
    }
}).await.ok();
```

7. 三个新 handler 实现（`get_proof_handler`、`patch_proof_tx_handler`、`get_proof_by_tx_handler`）。

**`packages/demo/src/components/ContractSubmit.tsx`** — 导入 config 并在 txHash 确认后补写：
```typescript
import { config } from '../config';

// 在 setTxHash(hash) 之后：
const attestationId =
  wiseProofs?.transfer?.verifierSignature?.sessionId ??
  proveResponse?.verifierSignature?.sessionId;
if (attestationId) {
  await fetch(`${config.verifierUrl}/proof/${attestationId}/tx`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: hash, chainId: Number(config.chainId) }),
  });
}
```

#### ⚠️ 已知报错与修复

| 报错 | 原因 | 修复方案 |
|---|---|---|
| `error[E0063]: missing field 'db' in initializer of 'AppState'` | 新增字段后构造处未同步 | 在 `main()` 里的 `AppState { ... }` 构造处补 `db: db.clone()` |
| `error[E0425]: cannot find function 'patch'` | `axum::routing` 未导入 `patch` | `use axum::routing::{get, patch};` |
| `error: failed to run custom build command for 'libsqlite3-sys'` | Docker/CI 环境缺 C 编译器 | `rusqlite` 用 `features = ["bundled"]` 已自带 SQLite，但需要 `cc` 和基础构建工具（`apt-get install build-essential`） |
| SQLite 阻塞 tokio 运行时线程 | `rusqlite::Connection` 是同步阻塞的，不能直接在 async 里调用 | 所有 DB 操作必须用 `tokio::task::spawn_blocking` 包裹，使用 `std::sync::Mutex`（非 `tokio::sync::Mutex`） |
| 容器重启后数据丢失 | SQLite 文件默认写到容器内当前目录 | 通过 `PROOF_DB_PATH` 环境变量指定路径，并在 `docker-compose.yml` 里挂载 volume |
| `verifierHost` / `attestationId` 在 `ContractSubmit.tsx` 里 undefined | 组件原来没有这些变量 | 从 `config` 导入 `verifierUrl`；从 `proveResponse.verifierSignature?.sessionId` 取 `attestationId`，加空值保护 |

---

### 改动三：瘦 Webhook + HMAC 来源认证（数据最小化 + R.11 安全性）

**目标：** webhook 只推送实时决策所需最小字段；HMAC 认证 webhook 来源。

**`packages/verifier/Cargo.toml`** — 新增依赖：
```toml
hmac = "0.12"
sha2 = "0.10"
```

**`packages/verifier/src/main.rs`** 变更：

1. 新增 slim webhook 结构体（替换原 `WebhookPayload`）：
```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SlimWebhookPayload {
    attestation_id:           String,
    policy_version:           Option<String>,
    server_name:              String,
    travel_rule_fields:       HashMap<String, TravelRuleFieldValue>,
    account_checks_all_passed: bool,
    verifier_signature:       Option<String>,
    verifier_address:         Option<String>,
    order_binding_hash:       Option<String>,
    timestamp:                String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TravelRuleFieldValue {
    value:            String,
    commitment_index: usize,
}
```

2. 签名必须在 webhook 发送之前完成（代码顺序重排）：

```
当前顺序：① 构建 redacted_transcript → ② 构建 WebhookPayload → ③ 发送 webhook → ④ 签名
新顺序：  ① 签名 → ② 构建 SlimWebhookPayload（含签名） → ③ 发送 webhook → ④ 构建并存储 ProofExportV1
```

3. `send_webhook()` 函数新增 HMAC 计算：
```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;

fn compute_hmac_sha256(secret: &str, body: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .expect("HMAC key init failed");
    mac.update(body.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
```
发送时附加 header：`X-TLSN-Signature: sha256=<hex>`

4. `WebhookConfig` 新增 `secret` 字段（可选）：
```rust
pub(crate) struct WebhookConfig {
    pub(crate) url:     String,
    pub(crate) headers: HashMap<String, String>,
    pub(crate) secret:  Option<String>,   // 新增
}
```

5. `config.yaml` 格式更新：
```yaml
webhooks:
  "wise.com":
    url: "https://exchange.example.com/webhook/tlsn"
    secret: "your-hmac-secret"
    headers:
      X-Source: "tlsn-verifier"
```

#### ⚠️ 已知报错与修复

| 报错 | 原因 | 修复方案 |
|---|---|---|
| `error[E0432]: unresolved import 'hmac'` | `hmac` 和 `sha2` 未加入 `Cargo.toml` | 补充 `hmac = "0.12"` 和 `sha2 = "0.10"` 依赖 |
| 签名字段 `None`：slim webhook 里 `verifierSignature` 为空 | 原代码签名在 webhook 之后，改动后签名必须前移 | 将签名逻辑整体移到 webhook 构建之前，注意 `transcript_commitments` 的所有权转移问题（Rust borrow checker） |
| `error[E0502]: cannot borrow 'transcript_commitments' as mutable` | 重排代码后借用冲突 | 在签名前 `.clone()` 一份 `transcript_commitments` 给签名使用，原值留给后续 |
| `WebhookConfig` 反序列化失败（老 `config.yaml` 无 `secret` 字段） | 新增字段不兼容老配置 | `secret` 用 `Option<String>` + `#[serde(default)]`，老配置不加 `secret` 时默认 `None`，不发 HMAC |
| 集成测试 `test_webhook_integration_with_github` 失败 | 测试断言了 `config.sent`、`transcript.recv` 等已被移除的字段 | 更新测试断言为 slim webhook 的字段：`attestationId`、`travelRuleFields`、`accountChecksAllPassed` |

---

### 改动四：旅行规则事实标签（解决 R.16 可解析性）

**目标：** handler 输出按旅行规则语义标签标注，交易所无需理解内部格式。

**`packages/plugin-sdk/src/types.ts`** — 新增枚举类型：
```typescript
export type TravelRuleFieldLabel =
  | 'originator.accountId'
  | 'originator.name'
  | 'originator.amount'
  | 'originator.currency'
  | 'originator.timestamp'
  | 'beneficiary.accountId'
  | 'beneficiary.name'
  | 'beneficiary.amount'
  | 'transaction.id'
  | 'transaction.status'
  | string;   // 自定义标签，向后兼容
```

**各 plugin 文件** — handler 加 `label` 字段，例如 `wise.plugin.ts`：
```javascript
handlers: [
  { type: 'RECV', part: 'BODY', action: 'REVEAL',
    params: { type: 'json', path: 'amount' },
    label: 'originator.amount' },
  { type: 'RECV', part: 'BODY', action: 'REVEAL',
    params: { type: 'json', path: 'targetRecipient.email' },
    label: 'beneficiary.accountId' },
]
```

**`packages/verifier/src/main.rs`** — `Handler` struct 加 `label` 字段：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Handler {
    #[serde(rename = "type")]
    pub(crate) handler_type: HandlerType,
    pub(crate) part:         HandlerPart,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) label:        Option<String>,   // 新增
}
```

`HandlerResult` 同步新增 `label: Option<String>`（从对应 handler 复制）。

#### ⚠️ 已知报错与修复

| 报错 | 原因 | 修复方案 |
|---|---|---|
| 集成测试本地 `Handler` struct 与主 `Handler` 不同步 | 测试文件定义了独立的 `Handler` struct | 测试的本地 struct 加 `label: Option<String>` 字段（或改为 `#[allow(dead_code)]` 忽略） |
| slim webhook 里 `travelRuleFields` 为空 | `handler_results` 里的 `label` 未复制 | 确认 `HandlerResult` 的构建逻辑从 `RangeWithHandler.handler.label` 复制值 |

---

### 改动五：标准化证明导出格式 ProofExportV1（R.11 存档合约）

**目标：** `GET /proof/{id}` 返回稳定、版本化的完整证明包，供交易所存档。

**`packages/plugin-sdk/src/types.ts`** — 新增 interface（引用已有的 `TranscriptCommitmentSummary`）：

```typescript
export interface ProofExportV1 {
  formatVersion: 'ProofExportV1';
  attestationId:  string;
  txHash:         string | null;
  policyVersion:  string;
  timestamp:      string;
  serverName:     string;
  verifierVersion: string;
  travelRuleFields: {
    [label: string]: { value: string; commitmentIndex: number; };
  };
  accountChecks: Array<{
    fieldLabel:   string;
    direction:    'SENT' | 'RECV';
    expectedHash: string;
    passed:       boolean;
  }>;
  orderBindingHash:    string | null;
  commitmentsHash:     string;
  verifierSignature:   string;
  verifierAddress:     string;
  chainId:             number;
  redactedTranscript:  { sent: string; recv: string; };
  transcriptCommitments: TranscriptCommitmentSummary[];
}
```

`GET /proof/{sessionId}` 端点（Rust 侧）从 SQLite 读取记录后组装此结构返回。

#### ⚠️ 已知报错与修复

| 报错 | 原因 | 修复方案 |
|---|---|---|
| `Cannot find name 'TranscriptCommitmentSummary'` | 若 `ProofExportV1` 放在不同文件，需 import | 放在同一个 `types.ts` 文件里，无需额外 import |

---

### 改动六：API 版本化文档（R.15 治理）

**新增文件：** `packages/verifier/API_SPEC.md`

内容包括：
- 所有 HTTP 端点的 JSON schema
- `policyVersion` 生命周期规则
- 破坏性变更通知流程
- slim webhook 与 ProofExportV1 字段说明

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
| **完整证明包** | `ProofExportV1`（含脱敏 transcript） | `GET /proof/{id}` | 合规存档、审计、争议处理 |
| **txHash 写入** | 链上确认后补写 | `PATCH /proof/{id}/tx` | 链上确认后由交易所调用 |
| **逆向检索** | 按 txHash 查完整证明 | `GET /proof?txHash=` | 监管查询、事后核查 |

### 6.3 交易所自行处理的

1. **KYC/CDD**：注册用户，计算 `nameHash`/`idHash` 存入链上合约
2. **制裁筛查**：对照 OFAC、UN、EU 等制裁名单
3. **旅行规则 PII 传输**：通过 TRISA / OpenVASP 向对手方交易所传输明文身份信息
4. **SAR 申报**：向金融情报机构报告可疑交易
5. **证明 5 年存档**：调用 `GET /proof/{id}` 拉取 `ProofExportV1` 存入自己的数据库

---

## 七、测试方案

### 7.1 测试层级总览

```
Layer 4: 手动 E2E 测试   （全链路：Chrome 插件 + verifier + demo，约 30 分钟）
Layer 3: Rust 集成测试   （真实 WebSocket + SQLite + webhook，需网络，约 5 分钟）
Layer 2: Rust 单元测试   （隔离，in-memory DB，无网络，约 30 秒）
Layer 1: TypeScript 单元  （Vitest，纯函数/类型，最快，约 10 秒）
```

**执行原则：从下往上，每层通过再上一层。**

---

### 7.2 Layer 1：TypeScript 单元测试

运行：`cd packages/plugin-sdk && npm test`

**需要新增的测试用例：**

**文件：`packages/plugin-sdk/src/extractConfig.test.ts`（追加）**

```
✅ 测试：extractConfig 能提取 policyVersion
   输入：包含 policyVersion: 'v1.0.0' 的插件代码
   断言：result.policyVersion === 'v1.0.0'

✅ 测试：policyVersion 缺失时返回 undefined（不报错）
   输入：老格式插件代码（无 policyVersion）
   断言：result.policyVersion === undefined，name/description 正常提取

✅ 测试：policyVersion 双引号格式可正确提取
   输入：policyVersion: "v2.0.1"
   断言：result.policyVersion === 'v2.0.1'
```

**文件：`packages/plugin-sdk/src/types.test.ts`（新建）**

```
✅ 测试：TravelRuleFieldLabel 标准枚举值合法
   方法：TypeScript 类型断言编译通过

✅ 测试：ProofExportV1 接口构造完整不报 TS 错误
   方法：构造满足接口的 mock 对象赋值给该类型

✅ 测试：txHash 为 null 合法（初始状态）
   断言：{ ...proofExport, txHash: null } 不报类型错误

✅ 测试：formatVersion 只接受字面量 'ProofExportV1'
   断言：formatVersion: 'Other' 报 TS 类型错误
```

**文件：`packages/extension/src/offscreen/SessionManager.test.ts`（新建）**

```
✅ 测试：prove() 时 sessionData 包含 __tlsn_policy_version
   Setup：mock ProveManager，捕获 sessionData
   输入：pluginConfig.policyVersion = 'v1.0.0'
   断言：capturedSessionData['__tlsn_policy_version'] === 'v1.0.0'

✅ 测试：proverOptions.policyVersion 优先于 pluginConfig.policyVersion
   输入：config = 'v1.0.0'，options = 'v2.0.0'
   断言：sessionData 中值为 'v2.0.0'

✅ 测试：两者均未定义时，兜底值为 'unspecified'
   断言：sessionData['__tlsn_policy_version'] === 'unspecified'
```

---

### 7.3 Layer 2：Rust 单元测试

运行：`cd packages/verifier && cargo test --lib`

**在 `main.rs` 末尾的 `#[cfg(test)]` 模块里新增：**

**HMAC 测试：**
```
✅ 测试：compute_hmac_sha256 与已知参考向量一致
   输入：secret="test-secret", body=r#"{"id":"abc"}"#
   断言：输出十六进制与离线计算的参考值相等

✅ 测试：不同 body 产生不同 HMAC

✅ 测试：相同输入多次调用幂等
```

**SQLite 测试（使用 `:memory:`）：**
```
✅ 测试：insert_proof 后 get_proof_by_session_id 能取回
   Setup：Connection::open(":memory:") + 创建 schema
   断言：取回记录各字段与插入值完全一致

✅ 测试：patch_tx_hash 正确更新，其他字段不变

✅ 测试：get_proof_by_tx_hash 能按 tx_hash 检索

✅ 测试：查询不存在的 session_id 返回 None（对应 HTTP 404）

✅ 测试：retain_until = recorded_at + 5 年（误差 < 1 秒）
```

**label 透传测试：**
```
✅ 测试：Handler 有 label 时，序列化 JSON 包含该字段

✅ 测试：Handler label=None 时，JSON 不包含 label 字段（skip_serializing_if）

✅ 测试：反序列化旧格式 JSON（无 label）不报错，label = None
   → 确认向后兼容

✅ 测试：build_slim_webhook_payload 只保留有 label 的 handler_results
   输入：3 个 results，其中 1 个 label=None
   断言：travelRuleFields 只有 2 个 key
```

**policyVersion 进签名测试：**
```
✅ 测试：签名输出的 VerifierSignature 包含 policy_version 字段

✅ 测试：policy_version 不同时，签名不同（须纳入消息哈希）
```

---

### 7.4 Layer 3：Rust 集成测试

运行：`cd packages/verifier && cargo test --test integration_test -- --nocapture`

**更新已有测试 `test_webhook_integration_with_github`：**

删除以下已失效的断言：
```rust
// 删除
assert!(payload["config"]["sent"].is_array(), ...);
assert!(payload["config"]["recv"].is_array(), ...);
assert!(payload["transcript"]["sent"].is_string(), ...);
assert!(payload["transcript"]["recv"].is_string(), ...);
```

替换为 slim webhook 断言：
```rust
// 新增
assert!(payload["attestationId"].is_string(), "attestationId should exist");
assert!(payload["travelRuleFields"].is_object(), "travelRuleFields should be object");
assert!(payload["accountChecksAllPassed"].is_boolean(), "...");
assert!(payload["verifierSignature"].is_string() || payload["verifierSignature"].is_null(), "...");
assert!(payload["timestamp"].is_string(), "...");
// HMAC header 验证（TestWebhookServer 需记录 request headers）
```

**新增测试 `test_proof_store_api`：**
```
✅ 完成一次 verification flow，拿到 session_id
✅ GET /proof/{session_id} → 200，formatVersion = "ProofExportV1"
✅ 响应包含 redactedTranscript.sent（完整证明含 transcript）
✅ txHash 初始为 null
✅ PATCH /proof/{session_id}/tx → 200
✅ 再次 GET /proof/{session_id} → txHash = "0xtest"
✅ GET /proof?txHash=0xtest → 返回 attestationId = session_id
```

**新增测试 `test_proof_not_found`：**
```
✅ GET /proof/nonexistent-id → 404
✅ GET /proof?txHash=0xnonexistent → 404
```

---

### 7.5 Layer 4：手动 E2E 测试

**前提条件：**
- verifier 已启动（`cd packages/verifier && cargo run`）
- 本地起一个 HTTP 监听服务器记录 webhook（`npx http-echo-server 9000`）
- `config.yaml` 配置 webhook 指向 `http://localhost:9000/webhook`，`secret: "test-secret-123"`
- demo 已启动（`npm run demo`），Chrome 已加载扩展

**检查清单：**

| 步骤 | 期望结果 | 验证方式 |
|---|---|---|
| 跑完整 Wise 或 Alipay proof flow | 无报错 | Demo UI 状态 |
| verifier 日志包含 policyVersion | `policy_version: "v1.0.0"` | `cargo run` stdout |
| 监听服务器收到 slim webhook | JSON 包含 `travelRuleFields`、无 `transcript` 字段 | 监听服务器日志 |
| X-TLSN-Signature header 存在 | 格式 `sha256=<64位hex>` | 监听服务器记录的 headers |
| HMAC 手动验证 | 用 Node.js 重算 HMAC 与 header 一致 | 见下方脚本 |
| `GET /proof/{sessionId}` | 返回 ProofExportV1，含 `redactedTranscript` | `curl http://localhost:7047/proof/<id>` |
| `PATCH /proof/{sessionId}/tx` | 200 OK | `curl -X PATCH ...` |
| `GET /proof?txHash=<hash>` | 返回同一 attestation | `curl http://localhost:7047/proof?txHash=<hash>` |

**HMAC 手动验证脚本（`verify-hmac.js`）：**
```javascript
const crypto = require('crypto');
const body = process.argv[2];      // 从监听服务器拷贝的 webhook body
const secret = 'test-secret-123';
const expected = 'sha256=' + crypto.createHmac('sha256', secret)
                                    .update(body).digest('hex');
console.log('Expected:', expected);
// 与 X-TLSN-Signature header 比对
```
运行：`node verify-hmac.js '<webhook-body-json>'`

---

### 7.6 回归测试检查表

每次提交前必须全部通过：

```bash
# TypeScript 全量测试
cd packages/plugin-sdk && npm test
cd packages/extension && npm test

# TypeScript 类型检查（无运行时测试的类型错误）
cd packages/plugin-sdk && npx tsc --noEmit
cd packages/extension && npx tsc --noEmit

# Rust 单元测试（快，无网络）
cd packages/verifier && cargo test --lib

# Rust 集成测试（慢，需网络）
cd packages/verifier && cargo test --test integration_test
```

**需要确认仍然通过的现有测试：**

| 测试文件 | 关注点 |
|---|---|
| `extractConfig.test.ts` | 新增 policyVersion 提取不破坏原有 name/description/version/author |
| `index.test.ts` | PluginConfig 可选字段不影响 Host 初始化 |
| `verifierSignature.test.ts` | 若签名加了 policyVersion，需更新 FIXTURE（手动跑一次 prove，拷贝新的 session_completed 数据） |
| `test_webhook_integration_with_github` | 断言已更新为 slim webhook 格式 |

---

## 八、整体改动量总结

| 改动 | 文件 | 类型 | 估计行数 |
|---|---|---|---|
| `policyVersion` 字段 + `TravelRuleFieldLabel` + `ProofExportV1` | `packages/plugin-sdk/src/types.ts` | 类型扩展 | ~80 行 |
| `extractConfig` 补 policyVersion 提取 | `packages/plugin-sdk/src/index.ts` | 小改 | ~5 行 |
| SessionManager 透传 policyVersion | `packages/extension/src/offscreen/SessionManager.ts` | 小改 | ~5 行 |
| Verifier：label 字段 + SQLite + 3 端点 + slim webhook + HMAC + 代码顺序重排 | `packages/verifier/src/main.rs` | 主要新增 | ~220 行 |
| Schema SQL 文件 | `packages/verifier/src/schema.sql` | 新建 | ~15 行 |
| 依赖新增 | `packages/verifier/Cargo.toml` | 配置 | ~3 行 |
| config.yaml secret 字段 | `packages/verifier/config.yaml` | 配置 | ~1 行/endpoint |
| 各 plugin policyVersion + label | `wise.plugin.ts`、`alipay.plugin.ts` | 小改 | 各 ~15 行 |
| ContractSubmit PATCH txHash | `packages/demo/src/components/ContractSubmit.tsx` | 小改 | ~15 行 |
| API Spec 文档 | `packages/verifier/API_SPEC.md` | 新建文档 | — |

**总计：约 380 行新增，70 行修改。不触碰 WASM、合约、核心协议。**

---

## 九、满足情况对照表

| FATF 条款 | 要求 | 本方案如何满足 | 责任归属 |
|---|---|---|---|
| **R.11** 记录保存 5 年 | 证据可留存、可重建 | SQLite 持久化 + `GET /proof/{id}` + `retain_until` | 中间件提供检索，交易所实际存档 |
| **R.15** 新技术风险治理 | 行为可预测、可审计 | `policyVersion` 进 ECDSA 签名；版本化 API Spec | 中间件负责 |
| **R.16** 旅行规则事实覆盖 | 账户归属可验证、字段可解析 | `TravelRuleFieldLabel` + `accountChecks` + 瘦 webhook | 中间件事实层，交易所 PII 传输层 |
| R.10 客户尽调 | 身份核验 | `accountChecks` 辅助账户归属验证 | 交易所主责，中间件辅助 |
| R.16 PII 传输 | 明文身份信息传输 | 不在中间件范围 | 交易所负责（TRISA 等） |
| R.26/28 VASP 持牌 | 持牌/监管 | 完全不在中间件范围 | 交易所负责 |

---

## 十、局限性声明

1. **本中间件是"事实验证基础设施"，不是合规主体。**
2. **`ProofExportV1` 提供密码学证据，不提供法律认定。**
3. **SQLite 适用于 demo 和小规模部署。** 生产环境需替换为 PostgreSQL，接口不变。
4. **账户归属验证依赖 KYC 注册的正确性。** 若交易所 KYC 注册中的哈希来自伪造信息，中间件无法检测。

---

## 十一、TODO List（供 Claude Code 实施）

以下任务按依赖顺序排列，**必须严格按序执行**，后续任务依赖前序任务的类型定义。

---

### Phase 1：类型定义（无副作用，先做）

- [ ] **T1** `packages/plugin-sdk/src/types.ts`
  - 在 `PluginConfig` interface 末尾添加 `policyVersion?: string`
  - 在 `ProveOptions` interface 末尾添加 `policyVersion?: string`
  - 新增 `TravelRuleFieldLabel` 类型（见改动四代码）
  - 新增 `ProofExportV1` interface（见改动五代码，引用同文件的 `TranscriptCommitmentSummary`）

- [ ] **T2** `packages/plugin-sdk/src/index.ts`
  - 在 `extractConfig` 函数里，`authorMatch` 代码块之后，新增 policyVersion 正则提取（见改动一代码）

---

### Phase 2：Plugin 文件更新（依赖 T1）

- [ ] **T3** `packages/demo/plugins/wise.plugin.ts`
  - `config` 对象加 `policyVersion: 'v1.0.0'`
  - 对应 handler 加 `label` 字段（按旅行规则语义，见改动四示例）

- [ ] **T4** `packages/demo/plugins/alipay.plugin.ts`
  - 同 T3，按 Alipay 的字段路径设置对应 label

---

### Phase 3：Extension SessionManager（依赖 T1）

- [ ] **T5** `packages/extension/src/offscreen/SessionManager.ts`
  - 在构造 `sessionData` 的位置新增：
    ```typescript
    sessionData['__tlsn_policy_version'] =
      proverOptions.policyVersion ?? pluginConfig?.policyVersion ?? 'unspecified';
    ```
  - 确认 `pluginConfig` 的类型和来源，加空值保护

---

### Phase 4：Verifier Rust 依赖与 Schema（依赖无）

- [ ] **T6** `packages/verifier/Cargo.toml`
  - 在 `[dependencies]` 末尾添加：
    ```toml
    rusqlite = { version = "0.31", features = ["bundled"] }
    hmac = "0.12"
    sha2 = "0.10"
    ```

- [ ] **T7** 新建 `packages/verifier/src/schema.sql`
  - 内容见改动二的 SQL 建表语句

---

### Phase 5：Verifier 主体改动（依赖 T6、T7）

- [ ] **T8** `packages/verifier/src/main.rs` — 新增类型与结构体
  - 新增 `SlimWebhookPayload` struct
  - 新增 `TravelRuleFieldValue` struct
  - `Handler` struct 添加 `label: Option<String>` 字段（带 `#[serde(default, skip_serializing_if = "Option::is_none")]`）
  - `HandlerResult` struct 添加 `label: Option<String>` 字段
  - `VerifierSignature` struct 添加 `policy_version: Option<String>` 字段
  - `WebhookConfig` struct 添加 `secret: Option<String>` 字段（带 `#[serde(default)]`）
  - `AppState` struct 添加 `db: Arc<std::sync::Mutex<rusqlite::Connection>>` 字段

- [ ] **T9** `packages/verifier/src/main.rs` — 新增函数
  - `compute_hmac_sha256(secret: &str, body: &str) -> String`
  - `init_db(path: &str) -> rusqlite::Connection`（打开连接 + `execute_batch(include_str!("schema.sql"))`）
  - `insert_proof_record(conn: &rusqlite::Connection, ...)` 
  - `get_proof_by_session_id(conn: &rusqlite::Connection, session_id: &str) -> Option<ProofExportRecord>`
  - `patch_tx_hash(conn: &rusqlite::Connection, session_id: &str, tx_hash: &str, chain_id: i64)`
  - `get_proof_by_tx_hash(conn: &rusqlite::Connection, tx_hash: &str) -> Option<ProofExportRecord>`
  - `build_slim_webhook_payload(...)` — 从 handler_results 过滤有 label 的字段构建 `SlimWebhookPayload`

- [ ] **T10** `packages/verifier/src/main.rs` — 新增 HTTP 端点 handler
  - `get_proof_handler` — `GET /proof/:session_id`
  - `patch_proof_tx_handler` — `PATCH /proof/:session_id/tx`
  - `get_proof_by_tx_handler` — `GET /proof` with `txHash` query param

- [ ] **T11** `packages/verifier/src/main.rs` — 修改 `main()` 函数
  - 新增 DB 初始化逻辑（读 `PROOF_DB_PATH` 环境变量）
  - `AppState` 构造补 `db` 字段
  - Router 注册三条新路由
  - `use axum::routing::{get, patch};`

- [ ] **T12** `packages/verifier/src/main.rs` — 重排验证流程代码顺序
  - 将**签名逻辑**（当前约 1217-1268 行）移到 **webhook 发送之前**
  - `transcript_commitments` 在签名前 `.clone()` 一份
  - 用签名结果构建 `SlimWebhookPayload`（而非旧的 `WebhookPayload`）
  - 在 webhook 发送后，将完整数据写入 SQLite（用 `spawn_blocking`）
  - 修改 `send_webhook()` 函数签名以接受新的 `SlimWebhookPayload`
  - 在 `send_webhook()` 内计算并附加 `X-TLSN-Signature` header

- [ ] **T13** `packages/verifier/src/main.rs` — `HandlerResult` 构建处补 label
  - 在所有构造 `HandlerResult` 的地方，从 `RangeWithHandler.handler.label` 复制 `label` 字段

---

### Phase 6：Demo ContractSubmit（依赖 T11 端点已存在）

- [ ] **T14** `packages/demo/src/components/ContractSubmit.tsx`
  - 在文件顶部 import `config` from `'../config'`
  - 在 `setTxHash(hash)` 之后，新增 PATCH 调用（见改动二代码）
  - 加空值保护（`attestationId` 可能为 undefined）

---

### Phase 7：Verifier Config（依赖 T8 中 `WebhookConfig` 改动）

- [ ] **T15** `packages/verifier/config.yaml`
  - 取消注释 `wise.com` 示例，添加 `secret` 字段示例
  - 添加说明注释

---

### Phase 8：测试文件（依赖所有上述改动）

- [ ] **T16** `packages/plugin-sdk/src/extractConfig.test.ts`
  - 追加三个 policyVersion 提取测试用例（见测试方案 7.2）

- [ ] **T17** 新建 `packages/plugin-sdk/src/types.test.ts`
  - ProofExportV1 类型测试、TravelRuleFieldLabel 测试

- [ ] **T18** 新建 `packages/extension/src/offscreen/SessionManager.test.ts`
  - policyVersion 注入测试（需 mock ProveManager）

- [ ] **T19** `packages/verifier/src/main.rs` 的 `#[cfg(test)]` 模块
  - HMAC 单元测试
  - SQLite :memory: 测试
  - label 透传测试
  - policyVersion 进签名测试

- [ ] **T20** `packages/verifier/src/tests/integration_test.rs`
  - 更新 `test_webhook_integration_with_github` 的 webhook 断言
  - 新增 `test_proof_store_api`
  - 新增 `test_proof_not_found`

---

### Phase 9：文档

- [ ] **T21** 新建 `packages/verifier/API_SPEC.md`
  - 所有端点的请求/响应 schema
  - policyVersion 生命周期说明

---

*本文档适用于《基于 zkTLS 的半去中心化 C2C 兑换协议设计与实现》论文技术方案章节及面向交易所的中间件集成说明。*
