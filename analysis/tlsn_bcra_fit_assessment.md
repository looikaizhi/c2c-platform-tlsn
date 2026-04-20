# BCRA Submission Fit Assessment (TLSN Extension Repo)

Date: 2026-04-08
Scope: Compare this repository against Blockchain: Research and Applications (BCRA) publications in 2025-2026.

## 1) Journal Corpus Built
- Source window: 2025-01-01 to 2026-04-08 (Crossref publication date filter)
- Total records: 219
- Distribution:
  - Vol.6 Issue 1: 15
  - Vol.6 Issue 2: 17
  - Vol.6 Issue 3: 17
  - Vol.6 Issue 4: 15
  - Vol.7 Issue 1: 11
  - Vol.7 Issue 2: 4
  - In Press / Unassigned: 140
- Type distribution (inferred):
  - Research: 198
  - Review: 20
  - Editorial: 1

## 2) Full-Text Availability
- fulltext_pdf_accessible: 7
- fulltext_html_accessible: 1
- metadata_only: 201
- abstract_metadata_only: 10
- Structured-summary basis:
  - fulltext_inference: 8
  - abstract_metadata_inference: 211

## 3) BCRA Pattern (2025-2026)
- Frequent topics:
  - privacy/security
  - blockchain finance/payment/DeFi
  - smart contracts and Ethereum
  - governance/compliance
  - IoT and federated learning (smaller but recurring)
- Frequent method styles:
  - framework/system design
  - algorithm/model proposals
  - smart-contract implementation
  - security analysis and review articles
- Evaluation expectations (observed from abstracts/full text subset):
  - experiments/simulations are common
  - many papers report cost/performance/security metrics
  - comparative baselines and case studies appear frequently
- Writing style:
  - explicit problem statement
  - clear claimed contribution (method + implementation)
  - concrete evaluation section and metric reporting

## 4) Repository Evidence (Current)
Strengths:
- End-to-end engineering artifact across extension + verifier + contracts + UI
- Strong smart-contract test coverage and attack scenarios
- Platform-specific verifier modularization (Wise/Alipay)
- Ongoing privacy-preserving direction with Noir circuits and browser-side ZK generation code path

Critical gaps for journal submission:
- No paper manuscript structure yet (intro/method/related work/evaluation/threats/limitations)
- Evaluation is mostly engineering tests; no baseline comparison, no systematic benchmark protocol, no statistical reporting
- ZK path is not fully integrated end-to-end:
  - extension sends zk_proof_bundle, but verifier message schema currently only handles register/reveal_config
  - circuit artifacts expected by extension are not present in repo path
  - generated on-chain Noir verifier contracts are not present
- Toolchain reproducibility gaps in environment (cargo/nargo/bb unavailable here)
- One core test suite currently not green in full run (TLSNVerifier has 3 failing assertions)

## 5) Practical Recommendation
Current readiness for "high-probability sent-to-review": low.
Risk level before submission: HIGH.

Must-complete before submission:
1. Freeze a clear research question and novelty claim (not only product integration).
2. Finish the ZK end-to-end path or scope it out of the paper and keep one coherent contribution.
3. Build a reproducible evaluation protocol with baselines, metrics, and datasets/workloads.
4. Provide performance and cost analysis (latency, throughput, gas, proof generation/verification time, memory).
5. Add threat model + security analysis with explicit assumptions and boundary conditions.
6. Ensure all key tests are green in CI and include reproducibility scripts.
7. Write a full academic manuscript aligned with BCRA expectations.
