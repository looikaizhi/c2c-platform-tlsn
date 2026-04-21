# 隐私与合规协同闭环实施方案

> 目标：让"隐私+合规"全链路（插件定义 → 扩展端构造 → verifier 校验/签名 → 落库 → API 返回 → webhook 通知）端到端自洽、数据契约统一、测试覆盖完整。

---

## 背景与问题清单

经代码审查发现以下未闭环缺口，按优先级排序：

| ID | 文件 | 问题描述 | 严重程度 |
|----|------|----------|----------|
| G1 | `main.rs:1552` | `account_checks: None` 硬编码，校验结果从不落库 | 🔴 高 |
| G2 | `main.rs:516-533` vs `types.ts:479-522` | `ProofExportResponse` 字段（`handler_results`/`session_data`）与 `ProofExportV1` 契约（`travelRuleFields`/`accountChecks`/`transcriptCommitments`/`chainId`）完全不匹配 | 🔴 高 |
| G3 | `schema.sql` / `main.rs` | DB 无 `transcript_commitments` 列，验证完成后丢失，GET /proof 永远无法返回 | 🔴 高 |
| G4 | `main.rs:1688-1696` | `current_timestamp_str()` 返回 Unix 秒，但 schema.sql:20、API_SPEC.md:278、SlimWebhookPayload 注释均说 ISO 8601 | 🟡 中 |
| G5 | `main.rs` / `schema.sql` | 签名时的 `chain_id`（来自 `VerifierSignature.chain_id`）从未写入 DB；`chain_id` 列仅由 PATCH 写入（语义不同） | 🟡 中 |
| G6 | `main.rs:1844-1872` | `record_to_response` 读取了 `account_checks`（col 8）但从不输出 | 🔴 高 |
| G7 | `main.rs:529` vs `types.ts:513` | `verifier_signature` 为 `Option<String>` 但 `ProofExportV1` 要求 `string`（必填） | 🟡 中 |
| G8 | `main.rs:1884` | `travel_rule_fields` 用 HashMap，重复 label 后者覆盖前者 | 🟡 中 |
| G9 | `wise.plugin.ts:279-284` / `alipay.plugin.ts:147-152` | demo 插件 `accountCheckFields` 注释掉，样例链路未验证 | 🟡 中 |
| G10 | `unit_test.rs:54` | 所有测试夹具 `account_checks: None`，合规路径无回归覆盖 | 🟡 中 |

---

## 实施顺序与依赖关系

```
Phase 0 (数据模型)
  ├── G3: DB schema 加列
  ├── G5: signing_chain_id 落库
  └── G4: 时间格式统一

Phase 1 (写侧修复) — 依赖 Phase 0
  └── G1: account_checks 全链路写入

Phase 2 (读侧修复) — 依赖 Phase 0 + Phase 1
  ├── G2/G6: record_to_response 重构为 ProofExportV1 格式
  └── G7: verifierSignature 可空性处理

Phase 3 (辅助修复) — 可并行
  ├── G8: 重复 label 检测
  └── G9: demo 插件取消注释

Phase 4 (测试补全) — 依赖全部前置
  └── G10: 合规全路径回归测试
```

---

## Phase 0：数据模型统一

### 0-A：DB Schema 增加 `transcript_commitments` 和 `signing_chain_id` 列

**文件**：`packages/verifier/src/schema.sql`

**修改内容**：在 `proof_store` 表末尾追加两列：

```sql
transcript_commitments TEXT,   -- JSON array of TranscriptCommitmentSummary, stored at INSERT time
signing_chain_id       INTEGER -- chain_id used during signing (from CHAIN_ID env var at session time)
```

**完整目标 schema**（最终状态）：

```sql
CREATE TABLE IF NOT EXISTS proof_store (
    session_id              TEXT PRIMARY KEY,
    server_name             TEXT NOT NULL,
    policy_version          TEXT,
    order_binding_hash      TEXT,
    commitments_hash        TEXT NOT NULL,
    verifier_signature      TEXT,
    verifier_address        TEXT,
    handler_results         TEXT NOT NULL,
    account_checks          TEXT,
    redacted_sent           TEXT,
    redacted_recv           TEXT,
    session_data            TEXT,
    tx_hash                 TEXT,
    chain_id                INTEGER,
    recorded_at             TEXT NOT NULL,   -- RFC3339 UTC
    retain_until            TEXT NOT NULL,   -- RFC3339 UTC, recorded_at + 5 years
    transcript_commitments  TEXT,            -- JSON array of TranscriptCommitmentSummary
    signing_chain_id        INTEGER          -- chain_id locked into verifier ECDSA signature
);
```

> **注意**：已有的 `chain_id` 列保持不动（语义为链上确认 tx 的 chain_id，由 PATCH 写入）；新增 `signing_chain_id` 明确区分两者。

**迁移兼容**：`CREATE TABLE IF NOT EXISTS` 不会影响已有行；新列对旧行默认 NULL，不破坏现有数据。若 evidence.db 已存在，需执行：
```sql
ALTER TABLE proof_store ADD COLUMN transcript_commitments TEXT;
ALTER TABLE proof_store ADD COLUMN signing_chain_id INTEGER;
```
可在 `init_db` 里用 `execute_batch` 以 `IF NOT EXISTS` 方式安全追加。

**Todo**：
- [ ] **0-A-1**：在 `schema.sql` 末尾追加两列定义
- [ ] **0-A-2**：在 `init_db()` 函数里加 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 的迁移逻辑（SQLite 语法：`ALTER TABLE proof_store ADD COLUMN transcript_commitments TEXT`，需捕获"duplicate column"错误并忽略）

---

### 0-B：`ProofExportRecord` 结构体同步扩展

**文件**：`packages/verifier/src/main.rs`

当前结构体缺少两个字段，需添加：

```rust
struct ProofExportRecord {
    // ... 现有字段 ...
    transcript_commitments: Option<String>, // JSON of Vec<TranscriptCommitmentSummary>
    signing_chain_id: Option<i64>,
}
```

**Todo**：
- [ ] **0-B-1**：在 `ProofExportRecord` 结构体中添加 `transcript_commitments: Option<String>` 和 `signing_chain_id: Option<i64>`

---

### 0-C：时间格式统一为 RFC3339

**文件**：`packages/verifier/src/main.rs`

**当前实现**（有问题）：
```rust
fn current_timestamp_str() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()   // 输出 "1745000000" 这样的 Unix 秒字符串
}
```

**目标实现**（RFC3339 UTC）：

```rust
fn current_timestamp_str() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // 手动格式化为 RFC3339 UTC（不引入额外 crate）
    // 或使用 chrono（若已在 Cargo.toml）：
    // chrono::Utc::now().to_rfc3339()
    format_rfc3339(secs)
}
```

> 推荐选择：在 `Cargo.toml` 中添加 `chrono = { version = "0.4", default-features = false, features = ["clock"] }`，然后用 `chrono::Utc::now().to_rfc3339()`。若不愿引入新依赖，可手动实现 `format_rfc3339(secs: u64) -> String`。

`retain_until_str()` 同理修改。

**同步更新文档**（不改逻辑，仅文字）：
- `API_SPEC.md` line 234：`"timestamp": "<unix-seconds>"` → `"timestamp": "2026-04-21T08:00:00Z"`（示例值）
- `SlimWebhookPayload` 注释 line 477：已是"ISO 8601 UTC timestamp"，实现改正后即一致

**Todo**：
- [ ] **0-C-1**：修改 `current_timestamp_str()` 返回 RFC3339 字符串
- [ ] **0-C-2**：修改 `retain_until_str()` 返回 RFC3339 字符串（recorded_at + 5 年）
- [ ] **0-C-3**：更新 `API_SPEC.md` webhook payload 示例中的 timestamp 字段
- [ ] **0-C-4**：更新 `schema.sql` 注释（已写"ISO 8601"，实现改正后注释即正确，无需改）

---

## Phase 1：写侧修复 — account_checks 全链路落库

### 1-A：收集 accountCheck 校验结果

**文件**：`packages/verifier/src/main.rs`

**位置**：`main.rs` 的 verifier task，当前 account_checks 校验循环（约 line 1258-1299）。

**当前逻辑**：逐条校验，pass 则 `info!`，fail 则 `cleanup_session` 并 return。结果不保留。

**目标逻辑**：定义结果结构体，每条 pass/fail 都追加到列表，最后序列化写库。

新增结构体（在合规结构区）：
```rust
/// Per-check result stored in DB and returned by GET /proof
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountCheckResult {
    direction: String,
    start: usize,
    end: usize,
    expected_hash: String,
    computed_hash: String,
    value_mode: String,
    passed: bool,
    /// Optional semantic label (from matching handler label, if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    field_label: Option<String>,
}
```

校验循环修改思路：
1. 在循环外初始化 `let mut account_check_results: Vec<AccountCheckResult> = vec![];`
2. 每次 hash 计算后，无论 pass/fail，push 一条 `AccountCheckResult`
3. fail 时仍然 `cleanup_session` 并 return（行为不变）
4. 循环结束后（全部通过），序列化：`let account_checks_json = serde_json::to_string(&account_check_results).ok()`

**Todo**：
- [ ] **1-A-1**：在合规结构区（约 line 450）添加 `AccountCheckResult` 结构体
- [ ] **1-A-2**：在校验循环前声明 `account_check_results: Vec<AccountCheckResult>`
- [ ] **1-A-3**：循环内每次计算 computed_hash 后，构造 `AccountCheckResult` 并 push（pass/fail 均记录）
- [ ] **1-A-4**：循环通过后序列化为 JSON 字符串

---

### 1-B：写库时传入 account_checks 和 transcript_commitments 以及 signing_chain_id

**文件**：`packages/verifier/src/main.rs`

**位置**：构造 `ProofExportRecord`（约 line 1543-1558）。

当前：
```rust
account_checks: None,   // G1: 硬编码 None
```

目标：
```rust
account_checks: account_checks_json,      // 1-A-4 的序列化结果
transcript_commitments: Some(serde_json::to_string(&transcript_commitments).unwrap_or_default()),
signing_chain_id: verifier_signature.as_ref().map(|s| s.chain_id as i64),
```

**同步修改 `insert_proof_record`**：

```sql
INSERT OR REPLACE INTO proof_store (
    session_id, server_name, policy_version, order_binding_hash,
    commitments_hash, verifier_signature, verifier_address,
    handler_results, account_checks,
    redacted_sent, redacted_recv, session_data,
    tx_hash, recorded_at, retain_until,
    transcript_commitments, signing_chain_id
) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
```

参数列表末尾追加 `r.transcript_commitments` 和 `r.signing_chain_id`。

**同步修改 `get_proof_by_session_id` 和 `get_proof_by_tx_hash` 的 SELECT**：

```sql
SELECT session_id, server_name, policy_version, order_binding_hash,
       commitments_hash, verifier_signature, verifier_address,
       handler_results, account_checks,
       redacted_sent, redacted_recv, session_data,
       tx_hash, recorded_at, retain_until,
       transcript_commitments, signing_chain_id
FROM proof_store WHERE session_id = ?1
```

行映射中追加：
```rust
transcript_commitments: row.get(15)?,
signing_chain_id: row.get(16)?,
```

**Todo**：
- [ ] **1-B-1**：修改构造 `ProofExportRecord` 的代码，传入真实的 `account_checks`、`transcript_commitments`、`signing_chain_id`
- [ ] **1-B-2**：修改 `insert_proof_record` SQL 和参数，写入两个新列
- [ ] **1-B-3**：修改 `get_proof_by_session_id` 的 SELECT 和行映射，读取两个新列
- [ ] **1-B-4**：修改 `get_proof_by_tx_hash` 的 SELECT 和行映射，读取两个新列

---

## Phase 2：读侧修复 — ProofExportResponse 对齐 ProofExportV1

### 2-A：重构 `ProofExportResponse` 结构体

**文件**：`packages/verifier/src/main.rs`

**当前结构体**（有问题，约 line 516-533）：
```rust
struct ProofExportResponse {
    format_version: &'static str,
    attestation_id: String,
    tx_hash: Option<String>,
    policy_version: String,
    timestamp: String,
    server_name: String,
    verifier_version: &'static str,
    order_binding_hash: Option<String>,
    commitments_hash: String,
    verifier_signature: Option<String>,  // G7: 可空
    verifier_address: Option<String>,
    redacted_transcript: Option<RedactedTranscriptExport>,
    handler_results: serde_json::Value,  // G2: 不在 ProofExportV1 契约里
    session_data: serde_json::Value,     // G2: 不在 ProofExportV1 契约里
}
```

**目标结构体**（对齐 `ProofExportV1`）：
```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofExportResponse {
    format_version: &'static str,                    // "ProofExportV1"
    attestation_id: String,
    tx_hash: Option<String>,
    policy_version: String,
    timestamp: String,                               // RFC3339
    server_name: String,
    verifier_version: &'static str,
    order_binding_hash: Option<String>,
    commitments_hash: String,
    verifier_signature: String,                      // G7: 改为 String，无签名时用空字符串
    verifier_address: String,                        // 无签名时用空字符串
    chain_id: Option<i64>,                           // G5: signing_chain_id
    travel_rule_fields: serde_json::Value,           // G2: HashMap<label, {value, commitmentIndex}>
    account_checks: serde_json::Value,               // G2+G6: 反序列化的 AccountCheckResult 列表
    transcript_commitments: serde_json::Value,       // G3: 反序列化的 TranscriptCommitmentSummary 列表
    redacted_transcript: Option<RedactedTranscriptExport>,
    // 保留 handler_results 和 session_data 作为可选 debug 字段
    #[serde(skip_serializing_if = "Option::is_none")]
    handler_results: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_data: Option<serde_json::Value>,
}
```

**Todo**：
- [ ] **2-A-1**：替换 `ProofExportResponse` 结构体定义为上述版本

---

### 2-B：重构 `record_to_response` 函数

**文件**：`packages/verifier/src/main.rs`，约 line 1844-1872

**目标逻辑**：

```rust
fn record_to_response(r: ProofExportRecord) -> ProofExportResponse {
    // 1. handler_results (raw, optional debug)
    let handler_results_val: serde_json::Value =
        serde_json::from_str(&r.handler_results).unwrap_or(serde_json::Value::Array(vec![]));

    // 2. Build travelRuleFields from handler_results
    //    Only entries with a "label" field go into the map
    let travel_rule_fields = build_travel_rule_fields_from_handler_results(&handler_results_val);

    // 3. account_checks (deserialize stored JSON, or empty array)
    let account_checks: serde_json::Value = r
        .account_checks
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Array(vec![]));

    // 4. transcript_commitments (deserialize stored JSON, or empty array)
    let transcript_commitments: serde_json::Value = r
        .transcript_commitments
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Array(vec![]));

    // 5. session_data (optional debug)
    let session_data_val: serde_json::Value = r
        .session_data
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    // 6. redacted_transcript
    let redacted_transcript = match (r.redacted_sent, r.redacted_recv) {
        (Some(sent), Some(recv)) => Some(RedactedTranscriptExport { sent, recv }),
        _ => None,
    };

    ProofExportResponse {
        format_version: "ProofExportV1",
        attestation_id: r.session_id,
        tx_hash: r.tx_hash,
        policy_version: r.policy_version.unwrap_or_else(|| "unspecified".to_string()),
        timestamp: r.recorded_at,
        server_name: r.server_name,
        verifier_version: env!("CARGO_PKG_VERSION"),
        order_binding_hash: r.order_binding_hash,
        commitments_hash: r.commitments_hash,
        verifier_signature: r.verifier_signature.unwrap_or_default(),
        verifier_address: r.verifier_address.unwrap_or_default(),
        chain_id: r.signing_chain_id,
        travel_rule_fields,
        account_checks,
        transcript_commitments,
        redacted_transcript,
        handler_results: Some(handler_results_val),
        session_data: Some(session_data_val),
    }
}
```

**辅助函数 `build_travel_rule_fields_from_handler_results`**：

```rust
fn build_travel_rule_fields_from_handler_results(
    handler_results: &serde_json::Value,
) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    if let Some(arr) = handler_results.as_array() {
        for item in arr {
            if let Some(label) = item.get("label").and_then(|v| v.as_str()) {
                if let (Some(value), Some(idx)) = (
                    item.get("value").and_then(|v| v.as_str()),
                    item.get("commitmentIndex").and_then(|v| v.as_u64()),
                ) {
                    map.insert(
                        label.to_string(),
                        serde_json::json!({ "value": value, "commitmentIndex": idx }),
                    );
                }
            }
        }
    }
    serde_json::Value::Object(map)
}
```

> 注意：此处对重复 label 的处理是"后者覆盖"（与写侧 HashMap 行为一致）。G8 的修复在 Phase 3 单独处理。

**Todo**：
- [ ] **2-B-1**：添加辅助函数 `build_travel_rule_fields_from_handler_results`
- [ ] **2-B-2**：重构 `record_to_response` 按上述逻辑实现

---

## Phase 3：辅助修复

### 3-A：重复 label 检测日志（G8）

**文件**：`packages/verifier/src/main.rs`，`build_slim_webhook_payload` 函数（约 line 1874）

在 `travel_rule_fields.insert(label.clone(), ...)` 之前，检测是否已存在同名 label：

```rust
if travel_rule_fields.contains_key(label) {
    warn!(
        "[{}] Duplicate travel_rule label '{}' — previous value will be overwritten. \
         Consider using unique labels or upgrading to ProofExportV2.",
        session_id, label
    );
}
travel_rule_fields.insert(label.clone(), TravelRuleFieldValue { ... });
```

> 说明：`build_slim_webhook_payload` 当前签名无 `session_id` 参数，需要额外传入或改为 `warn!` 不带 session_id 上下文。简单方案：函数签名加 `session_id: &str` 参数，所有调用处同步更新。

同理在 `build_travel_rule_fields_from_handler_results` 中处理重复 label 时记录 warn。

**Todo**：
- [ ] **3-A-1**：`build_slim_webhook_payload` 函数签名增加 `session_id: &str` 参数
- [ ] **3-A-2**：所有调用 `build_slim_webhook_payload` 的地方传入 `&session_id`
- [ ] **3-A-3**：在 label insert 前添加重复检测 warn 日志
- [ ] **3-A-4**：在 `build_travel_rule_fields_from_handler_results` 中同样添加重复检测 warn

---

### 3-B：Demo 插件启用账户校验（G9）

**文件**：`packages/demo/plugins/wise.plugin.ts`，`packages/demo/plugins/alipay.plugin.ts`

**wise.plugin.ts**（line 279-284）：取消以下注释：
```typescript
accountCheckFields: [
    { handlerIndex: 2, sessionDataKey: '__tlsn_payee_name_hash', valueMode: 'json_value' },
    { handlerIndex: 3, sessionDataKey: '__tlsn_payee_id_hash',   valueMode: 'json_value' },
],
```

**alipay.plugin.ts**（line 147-152）：取消以下注释：
```typescript
accountCheckFields: [
    { handlerIndex: 4, sessionDataKey: '__tlsn_payee_name_hash', valueMode: 'json_value' },
    { handlerIndex: 5, sessionDataKey: '__tlsn_payee_id_hash',   valueMode: 'json_value' },
],
```

> 前提：需确保对应的 `sessionData` 哈希（`__tlsn_payee_name_hash`、`__tlsn_payee_id_hash`）在 demo 场景下与实际 transcript 数据一致；若仅作样例展示，可保留占位哈希并在注释中说明。

**Todo**：
- [ ] **3-B-1**：取消 `wise.plugin.ts` 中 `accountCheckFields` 的注释
- [ ] **3-B-2**：取消 `alipay.plugin.ts` 中 `accountCheckFields` 的注释
- [ ] **3-B-3**：确认两个插件的 `sessionData` 哈希值与样例 transcript 一致（或添加注释说明为 demo placeholder）

---

### 3-C：更新 API_SPEC.md（G4）

**文件**：`packages/verifier/API_SPEC.md`

**Todo**：
- [ ] **3-C-1**：将 webhook payload 示例中 `"timestamp": "<unix-seconds>"` 改为 RFC3339 示例值
- [ ] **3-C-2**：在 Data Retention 节说明 `recorded_at` 和 `retain_until` 均为 RFC3339 UTC
- [ ] **3-C-3**：补充 `GET /proof/:session_id` 响应体示例，包含 `travelRuleFields`、`accountChecks`、`transcriptCommitments`、`chainId` 字段

---

## Phase 4：测试补全

### 4-A：unit_test.rs 新增合规路径回归测试

**文件**：`packages/verifier/src/tests/unit_test.rs`

#### 测试组 1：account_checks 全路径（写入 → 读取 → 字段正确）

```rust
#[test]
fn test_account_checks_persisted_and_retrieved() {
    let conn = init_db(":memory:");
    let account_checks_json = r#"[
        {"direction":"recv","start":100,"end":150,
         "expectedHash":"0xabc","computedHash":"0xabc",
         "valueMode":"json_value","passed":true,"fieldLabel":"originator.accountId"}
    ]"#;
    let mut record = make_test_record("session-checks");
    record.account_checks = Some(account_checks_json.to_string());
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-checks").unwrap();
    assert!(retrieved.account_checks.is_some());
    let parsed: serde_json::Value =
        serde_json::from_str(retrieved.account_checks.unwrap().as_str()).unwrap();
    assert_eq!(parsed[0]["passed"], true);
    assert_eq!(parsed[0]["fieldLabel"], "originator.accountId");
}
```

#### 测试组 2：transcript_commitments 全路径

```rust
#[test]
fn test_transcript_commitments_persisted_and_retrieved() {
    let conn = init_db(":memory:");
    let tc_json = r#"[{"commitmentIndex":0,"hashHex":"0xcafe","start":0,"end":10}]"#;
    let mut record = make_test_record("session-tc");
    record.transcript_commitments = Some(tc_json.to_string());
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-tc").unwrap();
    assert!(retrieved.transcript_commitments.is_some());
}
```

#### 测试组 3：signing_chain_id 落库与读取

```rust
#[test]
fn test_signing_chain_id_persisted_and_retrieved() {
    let conn = init_db(":memory:");
    let mut record = make_test_record("session-chainid");
    record.signing_chain_id = Some(11155111);
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-chainid").unwrap();
    assert_eq!(retrieved.signing_chain_id, Some(11155111));
}
```

#### 测试组 4：record_to_response 结构对齐 ProofExportV1

```rust
#[test]
fn test_record_to_response_travel_rule_fields() {
    let conn = init_db(":memory:");
    let handler_results = r#"[
        {"commitmentIndex":0,"type":"RECV","part":"BODY",
         "label":"originator.amount","value":"100.00","start":0,"end":6},
        {"commitmentIndex":1,"type":"RECV","part":"BODY",
         "value":"no-label","start":6,"end":14}
    ]"#;
    let mut record = make_test_record("session-trf");
    record.handler_results = handler_results.to_string();
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-trf").unwrap();
    let response = record_to_response(retrieved);

    // travelRuleFields should only contain labeled handler
    let trf = &response.travel_rule_fields;
    assert!(trf.get("originator.amount").is_some());
    assert!(trf.get("no-label").is_none());
}

#[test]
fn test_record_to_response_has_required_v1_fields() {
    let record = make_test_record("session-v1");
    let response = record_to_response(record);
    // format_version must be ProofExportV1
    assert_eq!(response.format_version, "ProofExportV1");
    // account_checks must be a JSON array (even if empty)
    assert!(response.account_checks.is_array());
    // transcript_commitments must be a JSON array
    assert!(response.transcript_commitments.is_array());
}
```

#### 测试组 5：重复 label warn（不 panic）

```rust
#[test]
fn test_duplicate_label_does_not_panic() {
    let results = vec![
        make_handler_result(Some("originator.amount"), "100.00", 0),
        make_handler_result(Some("originator.amount"), "200.00", 1), // 重复
    ];
    let sig: Option<VerifierSignature> = None;
    // 只需确保不 panic；重复时后者覆盖前者
    let payload = build_slim_webhook_payload(
        "session-dup", Some("v1.0.0".to_string()), "wise.com", &results, true, &sig, None,
    );
    assert_eq!(payload.travel_rule_fields.len(), 1);
    // 后者覆盖
    assert_eq!(payload.travel_rule_fields["originator.amount"].value, "200.00");
}
```

#### 测试组 6：时间格式为 RFC3339

```rust
#[test]
fn test_current_timestamp_str_is_rfc3339() {
    let ts = current_timestamp_str();
    // RFC3339 format: YYYY-MM-DDTHH:MM:SSZ or with offset
    assert!(ts.contains('T'), "timestamp should be RFC3339, got: {}", ts);
    assert!(ts.ends_with('Z') || ts.contains('+'), "timestamp should be UTC RFC3339, got: {}", ts);
}

#[test]
fn test_retain_until_str_is_rfc3339_and_5_years_later() {
    let ts = retain_until_str();
    assert!(ts.contains('T'), "retain_until should be RFC3339, got: {}", ts);
}
```

**Todo**：
- [ ] **4-A-1**：更新 `make_test_record` 夹具，添加 `transcript_commitments: None` 和 `signing_chain_id: None` 字段（以适配新结构体）
- [ ] **4-A-2**：添加测试组 1（account_checks 全路径）
- [ ] **4-A-3**：添加测试组 2（transcript_commitments 全路径）
- [ ] **4-A-4**：添加测试组 3（signing_chain_id 落库）
- [ ] **4-A-5**：添加测试组 4（record_to_response 结构）
- [ ] **4-A-6**：添加测试组 5（重复 label 不 panic）
- [ ] **4-A-7**：添加测试组 6（时间格式 RFC3339）
- [ ] **4-A-8**：确认 `record_to_response` 对测试可见（`pub(crate)` 修饰）

---

## 完整 Todo Checklist（按执行顺序）

### Phase 0 — 数据模型
- [ ] **0-A-1** `schema.sql`：追加 `transcript_commitments TEXT` 和 `signing_chain_id INTEGER` 两列
- [ ] **0-A-2** `main.rs init_db()`：添加 ALTER TABLE 迁移逻辑（忽略 duplicate column 错误）
- [ ] **0-B-1** `main.rs ProofExportRecord`：添加 `transcript_commitments: Option<String>` 和 `signing_chain_id: Option<i64>`
- [ ] **0-C-1** `main.rs current_timestamp_str()`：改为 RFC3339 输出
- [ ] **0-C-2** `main.rs retain_until_str()`：改为 RFC3339 输出（recorded_at + 5 年）
- [ ] **0-C-3** `API_SPEC.md`：webhook 示例 timestamp 改为 RFC3339 示例值

### Phase 1 — 写侧
- [ ] **1-A-1** `main.rs`：添加 `AccountCheckResult` 结构体
- [ ] **1-A-2** `main.rs`：校验循环前声明 `account_check_results: Vec<AccountCheckResult>`
- [ ] **1-A-3** `main.rs`：循环内 push AccountCheckResult（含 computed_hash 和 passed 字段）
- [ ] **1-A-4** `main.rs`：循环结束后序列化为 `account_checks_json`
- [ ] **1-B-1** `main.rs`：构造 `ProofExportRecord` 时传入真实的三个新字段
- [ ] **1-B-2** `main.rs insert_proof_record()`：SQL 和参数追加两个新列
- [ ] **1-B-3** `main.rs get_proof_by_session_id()`：SELECT 和行映射追加两个新列
- [ ] **1-B-4** `main.rs get_proof_by_tx_hash()`：SELECT 和行映射追加两个新列

### Phase 2 — 读侧
- [ ] **2-A-1** `main.rs ProofExportResponse`：替换结构体定义（对齐 ProofExportV1）
- [ ] **2-B-1** `main.rs`：添加 `build_travel_rule_fields_from_handler_results` 辅助函数
- [ ] **2-B-2** `main.rs record_to_response()`：按新逻辑重构，输出所有 ProofExportV1 字段

### Phase 3 — 辅助
- [ ] **3-A-1** `main.rs build_slim_webhook_payload()`：签名增加 `session_id: &str` 参数
- [ ] **3-A-2** `main.rs`：所有调用处传入 `&session_id`
- [ ] **3-A-3** `main.rs build_slim_webhook_payload()`：label insert 前添加重复检测 warn
- [ ] **3-A-4** `main.rs build_travel_rule_fields_from_handler_results()`：添加重复 label warn
- [ ] **3-B-1** `wise.plugin.ts`：取消 `accountCheckFields` 注释
- [ ] **3-B-2** `alipay.plugin.ts`：取消 `accountCheckFields` 注释
- [ ] **3-B-3** 确认两插件 sessionData 哈希与 demo 场景一致（或加注释说明）
- [ ] **3-C-1** `API_SPEC.md`：更新 webhook timestamp 示例
- [ ] **3-C-2** `API_SPEC.md`：Data Retention 节说明 RFC3339 格式
- [ ] **3-C-3** `API_SPEC.md`：补充 GET /proof 响应体完整示例

### Phase 4 — 测试
- [ ] **4-A-1** `unit_test.rs make_test_record()`：添加两个新字段（初始 None）
- [ ] **4-A-2** `unit_test.rs`：添加 account_checks 全路径测试
- [ ] **4-A-3** `unit_test.rs`：添加 transcript_commitments 全路径测试
- [ ] **4-A-4** `unit_test.rs`：添加 signing_chain_id 落库测试
- [ ] **4-A-5** `unit_test.rs`：添加 record_to_response 结构测试
- [ ] **4-A-6** `unit_test.rs`：添加重复 label 测试
- [ ] **4-A-7** `unit_test.rs`：添加时间格式 RFC3339 测试
- [ ] **4-A-8** `main.rs record_to_response()`：确认函数可见性为 `pub(crate)` 以便测试调用

---

## 验收标准（Definition of Done）

1. **数据契约一致**：`GET /proof/:session_id` JSON 响应包含 `formatVersion: "ProofExportV1"`、`travelRuleFields`、`accountChecks`、`transcriptCommitments`、`chainId`，字段语义与 `packages/plugin-sdk/src/types.ts` 的 `ProofExportV1` 接口完全对应。
2. **account_checks 三处可追溯**：verifier 校验结果在 webhook（`accountChecksAllPassed`）、DB（`account_checks` 列）、API（`accountChecks` 字段）三处一致。
3. **transcriptCommitments 可追溯**：验证完成后的承诺列表落库并可通过 GET /proof 完整取回。
4. **signing_chain_id 可追溯**：ECDSA 签名时使用的 chainId 写入 DB 并在 `chainId` 字段返回。
5. **时间格式唯一**：`recorded_at`、`retain_until`、webhook `timestamp` 均为 RFC3339 UTC，代码注释与文档一致。
6. **Demo 默认开启账户校验**：wise 和 alipay 插件的 `accountCheckFields` 取消注释，本地可运行端到端 demo。
7. **`cargo test` 全部通过**：新增测试组 1-6 以及所有已有测试稳定通过。

---

## 关键文件索引

| 文件 | 涉及 Phase |
|------|-----------|
| `packages/verifier/src/schema.sql` | 0-A |
| `packages/verifier/src/main.rs` | 0-B, 0-C, 1-A, 1-B, 2-A, 2-B, 3-A |
| `packages/verifier/API_SPEC.md` | 0-C, 3-C |
| `packages/verifier/src/tests/unit_test.rs` | 4-A |
| `packages/demo/plugins/wise.plugin.ts` | 3-B |
| `packages/demo/plugins/alipay.plugin.ts` | 3-B |
| `packages/plugin-sdk/src/types.ts` | 参考（不修改） |
