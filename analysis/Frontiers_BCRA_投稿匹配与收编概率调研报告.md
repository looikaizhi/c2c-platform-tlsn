# TLSN C2C 隐私支付方案投稿调研报告（Frontiers in Blockchain vs BCRA）

日期：2026-04-08  
作者：基于 `analysis/` 目录现有数据的二次分析  
研究对象：  
- Frontiers in Blockchain（含其相关 section）  
- Blockchain: Research and Applications（BCRA）

---

## 1. 报告目标与数据边界

### 1.1 目标
判断你当前要做的工作（TLSNotary + Noir + C2C 隐私支付证明）是否与两个平台匹配，并给出“被收编（录用）概率”评估。

### 1.2 使用的数据
- Frontiers 数据：
  - `analysis/frontiers_blockchain_2025_2026_article_profiles.json`（122 篇，2025-2026）
  - `analysis/frontiers_scope_articletypes_section_extracts.json`
- BCRA 数据：
  - `analysis/bcra_2025_2026_articles.json`（219 篇，2025-2026）
  - `analysis/bcra_2025_2026_structured_summaries.md`
- 你的当前工作证据：
  - `ZK_PRIVACY_SOLUTION.md`
  - `packages/circuits/circuits/*/src/main.nr`
  - `packages/contracts/contracts/TLSNVerifier.sol`
  - `packages/contracts/contracts/MockNoirVerifier.sol`
  - `packages/contracts/test/BuyerMerchantZK.ts`
  - `packages/contracts/test/helpers/buildTLSNProof.ts`

### 1.3 结论先行
- **范围匹配**：两个平台都匹配，你的主题（区块链支付 + 隐私 + ZK + 智能合约验证）在两边都属于主航道。
- **当前状态不建议立即投**：工程方向正确，但学术稿件所需“可复现实证强度”还不够，且当前关键测试未绿。
- **当前被收编概率（经验估计）**：
  - Frontiers in Blockchain：**18% - 32%**
  - BCRA：**10% - 20%**
- **补齐关键实验与端到端闭环后**：
  - Frontiers：**45% - 65%**
  - BCRA：**35% - 55%**

---

## 2. 你当前工作的技术画像（用于匹配判断）

### 2.1 已具备的“可投稿素材”
- 明确问题场景：C2C 支付中，证明支付真实发生且不泄露明文细节。
- 技术路线清晰：TLSNotary commitment + Noir 电路 + on-chain verifier 组合。
- 有多电路设计：`wise-payment` / `alipay-payment` / `alipay-merchant-received` / `kyb-verify`。
- 合约层已支持 ZK 结构：`TLSNZKProof`、`registerNoirVerifier`、`verifyZKProof` 路径已存在。
- 有完整方案文档：`ZK_PRIVACY_SOLUTION.md` 给出了架构、阶段计划、约束与风险。

### 2.2 当前“学术录用阻塞点”（核心）
- 测试不稳定：本地 `BuyerMerchantZK.ts` 运行结果为 **1 通过 / 8 失败**。
- ZK 验证仍是测试替身：`MockNoirVerifier.sol` 明确是 always-true，非真实验证。
- 真实 verifier 产物未落地：`packages/contracts/contracts` 下未见自动生成的 `*NoirVerifier.sol` 真实合约（只有 `MockNoirVerifier.sol`）。
- 文档阶段仍大量未完成：`ZK_PRIVACY_SOLUTION.md` 的 Phase 0-5 checklist 多数未勾选。
- 现有测试辅助仍大量使用 mock proof（如 `zkProof: 0xdeadbeef`），难支撑“真实可复现性能/安全结论”。

结论：你现在更像“高潜力工程原型 + 方案设计”，距离“可投稿的实证型论文”还差一段收敛。

---

## 3. Frontiers in Blockchain 匹配度分析

### 3.1 平台/栏目是否收这类题
- scope 抽取显示：Frontiers 接收区块链理论、应用、实验研发、案例、方法论文，且强调 blockchain 技术本体相关性。
- 与你最匹配的 section：
  - `Blockchain Security and Privacy`
  - `Smart Contracts`
  - 次选：`Financial Blockchain`（如果强调支付金融应用）

### 3.2 2025-2026 发表画像（122 篇）
- Original Research：74（60.7%）
- 高实验强度：61（50.0%）
- 关键词信号：
  - 支付/金融：82（67.2%）
  - 安全：55（45.1%）
  - 隐私：31（25.4%）
  - 智能合约：38（31.1%）
  - ZK 相关：8（6.6%）

重点 section（与你最相关）：
- `Blockchain Security and Privacy`（16 篇）：
  - Original Research 13
  - 高实验强度 12
  - 说明：该 section 对“安全隐私 + 技术验证”要求较高，和你方向高度一致，但评审不会只看概念。

### 3.3 对你当前工作的匹配判断
- **主题匹配：高**
- **方法匹配：中高**（系统+协议+合约路径是对的）
- **证据匹配：中低**（真实 ZK 验证闭环与稳定实验尚不足）

### 3.4 Frontiers 当前被收编概率（经验区间）
- 如果现在直接投（不补强）：**18% - 32%**
- 如果补齐“真实 verifier + 端到端稳定 + 系统 benchmark + 对比实验”：**45% - 65%**

---

## 4. BCRA 匹配度分析

### 4.1 2025-2026 发表画像（219 篇）
- Research：198（90.4%）
- Review：20（9.1%）
- Editorial：1（0.5%）

主题标签信号：
- `privacy_security`：149（68.0%）
- `finance_payment`：89（40.6%）
- `smart_contract`：55（25.1%）
- `zk_snark`：9（4.1%）

方法与评估信号：
- `framework_design`：155（70.8%）
- `algorithm_model`：116（53.0%）
- `smart_contract_impl`：94（42.9%）
- `experiment`：118（53.9%）
- `cost_perf`：111（50.7%）
- `security_validation`：139（63.5%）
- `comparative`：59（26.9%）

解释：BCRA 对“系统设计 + 实验验证 + 性能/安全指标”要求非常明显，论文普遍更工程实证导向。

### 4.2 对你当前工作的匹配判断
- **主题匹配：高**（你的题正好在 BCRA 主流主题交集）
- **方法匹配：中高**
- **证据匹配：低到中**（当前最弱环：可复现实验强度与真实验证闭环）

### 4.3 BCRA 当前被收编概率（经验区间）
- 如果现在直接投：**10% - 20%**
- 如果补齐 benchmark、对比基线、安全与性能统计、真实 proof 验证：**35% - 55%**

---

## 5. 两平台对比结论（针对你当前阶段）

| 维度 | Frontiers in Blockchain | BCRA |
|---|---|---|
| 范围包容度 | 更宽（section 多，文章类型灵活） | 中等（更偏研究论文硬指标） |
| 对工程原型容忍度 | 相对更高 | 相对更低 |
| 对定量评估硬度 | 高 | 更高 |
| 与你当前状态匹配 | 中高 | 中 |
| 当前投稿建议优先级 | **优先** | 次优先（建议补强后投） |

一句话：  
**你这个题两边都“能投”，但以你当前完成度，Frontiers 更现实；BCRA 需要你先把实验与真实验证拉满。**

---

## 6. 影响“收编概率”的关键改进清单（必须项）

1. 真实 Noir verifier 合约落地并替换 mock（不能再用 always-true verifier 作为主实验证据）。  
2. 端到端用真实 proof 跑通：`prover -> verifier -> on-chain`，并给出可复现脚本。  
3. 修复并稳定 ZK 测试集（至少核心 happy path + replay + deadline + hash mismatch 全绿）。  
4. 增加基线对比：明文 TLSNProof 旧路径 vs 新 ZK 路径（gas、延迟、proof 生成时间、验证时间、失败率）。  
5. 给出统计报告：多次实验（建议 20-30 次）并报告均值/方差/P95。  
6. 写清威胁模型与边界条件：谁可信、谁不可信、攻击面与不可覆盖面。  
7. 收敛论文主贡献，避免“系统改造清单式叙事”，改成“研究问题 -> 方法 -> 实证 -> 结论”。

---

## 7. 最终建议（执行顺序）

1. **先冲 Frontiers（Security and Privacy 或 Smart Contracts section）**，用 6-8 周补齐实验后提交 Original Research。  
2. 再基于同一实验体系扩展成 BCRA 版本（强化 baseline 与统计严谨度）。  
3. 如果你希望“短周期先中一篇”，优先 Frontiers；如果你目标是“更硬核工程实证定位”，第二阶段再打 BCRA 更稳。

---

## 8. 评估不确定性说明

- BCRA 数据中大部分是 metadata 推断（201/219 无完整全文可抓取），因此方法/指标分布虽有参考价值，但存在一定抽样偏差。  
- 概率为经验估计，不是官方 acceptance rate；用于决策排序，不用于对外宣称。  
- 该结论严格基于你仓库当前状态与 `analysis/` 目录已有数据，未额外引入外部数据库。
