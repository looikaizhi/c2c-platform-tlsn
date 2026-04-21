# Security & Robustness Closure Plan

> **Branch**: `test-pr242`  
> **Scope**: Based on full code audit of `packages/verifier/src/main.rs`, `packages/contracts/contracts/`, and `packages/plugin-sdk/src/index.ts`.  
> **Do NOT skip phases** — each phase builds on the previous one. Mark every checkbox before moving to the next phase.

---

## Phase A — P0: API Boundary Protection (Verifier Auth + CORS + Input Validation)

### Context

- `packages/verifier/src/main.rs` lines 78–81: `/proof/:session_id`, `/proof/:session_id/tx`, and `/proof?txHash=` are all public with `CorsLayer::permissive()`.
- `get_proof_handler` (line 570), `patch_proof_tx_handler` (line 588), and `get_proof_by_tx_handler` (line 614): none extract or validate any auth header.
- `PatchTxBody` struct (line 519): `tx_hash: String` — no format enforcement.
- `GetProofByTxQuery` struct (line 528): `tx_hash: String` — no format enforcement.
- `AppState` struct (line 275): no `proof_api_key` field exists.

### Tasks

#### A-1: Add `proof_api_key` to `AppState`

**File**: `packages/verifier/src/main.rs`

- [ ] In the `AppState` struct (line 275), add a new field:
  ```rust
  pub(crate) proof_api_key: Option<String>,
  ```
- [ ] In `main()`, before building `app_state` (line 64), read the env var:
  ```rust
  let proof_api_key = std::env::var("PROOF_API_KEY").ok();
  if proof_api_key.is_none() {
      warn!("PROOF_API_KEY not set — /proof* endpoints are UNAUTHENTICATED (dev mode only)");
  }
  ```
- [ ] Pass `proof_api_key` into the `AppState` initializer.

#### A-2: Write a reusable `check_proof_api_key` helper function

**File**: `packages/verifier/src/main.rs`

- [ ] Add the following function before the proof store handlers (before line 570):
  ```rust
  /// Returns Ok(()) if auth passes, or Err(StatusCode::UNAUTHORIZED) if it fails.
  fn check_proof_api_key(
      headers: &axum::http::HeaderMap,
      state: &Arc<AppState>,
  ) -> Result<(), StatusCode> {
      let Some(ref expected) = state.proof_api_key else {
          return Ok(()); // dev mode: no key configured, allow all
      };
      let provided = headers
          .get("X-TLSN-Api-Key")
          .or_else(|| headers.get("authorization"))
          .and_then(|v| v.to_str().ok())
          .map(|s| s.trim_start_matches("Bearer ").trim());
      if provided == Some(expected.as_str()) {
          Ok(())
      } else {
          Err(StatusCode::UNAUTHORIZED)
      }
  }
  ```

#### A-3: Wire auth into all three proof store handlers

**File**: `packages/verifier/src/main.rs`

- [ ] Add `headers: axum::http::HeaderMap` as first parameter to `get_proof_handler`, and call `check_proof_api_key(&headers, &state)?;` at the top of the handler body before the DB query.
- [ ] Do the same for `patch_proof_tx_handler`.
- [ ] Do the same for `get_proof_by_tx_handler`.

#### A-4: Replace `CorsLayer::permissive()` with env-configurable CORS

**File**: `packages/verifier/src/main.rs`

- [ ] In `main()`, replace `CorsLayer::permissive()` with:
  ```rust
  let cors = {
      let origins_str = std::env::var("CORS_ALLOW_ORIGINS")
          .unwrap_or_else(|_| "http://localhost:3000,http://localhost:8080".to_string());
      let origins: Vec<axum::http::HeaderValue> = origins_str
          .split(',')
          .filter_map(|s| s.trim().parse().ok())
          .collect();
      if origins.is_empty() {
          CorsLayer::permissive() // fallback
      } else {
          CorsLayer::new()
              .allow_origin(origins)
              .allow_methods([axum::http::Method::GET, axum::http::Method::PATCH])
              .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION])
      }
  };
  ```
- [ ] Replace `.layer(CorsLayer::permissive())` with `.layer(cors)` in the router chain.

#### A-5: Add `tx_hash` format validation helper and wire into PATCH and GET handlers

**File**: `packages/verifier/src/main.rs`

- [ ] Add a validation helper:
  ```rust
  /// Returns true if `s` matches `^0x[0-9a-fA-F]{1,64}$`.
  /// Accepts 1–64 hex chars (not strictly 64) to handle chain-specific hash lengths.
  fn is_valid_tx_hash(s: &str) -> bool {
      s.starts_with("0x")
          && s.len() >= 3
          && s.len() <= 66
          && s[2..].chars().all(|c| c.is_ascii_hexdigit())
  }
  ```
- [ ] In `patch_proof_tx_handler`, after deserializing `body`, add:
  ```rust
  if !is_valid_tx_hash(&body.tx_hash) {
      return (StatusCode::BAD_REQUEST, "Invalid tx_hash format: must be 0x<1-64 hex chars>").into_response();
  }
  if let Some(cid) = body.chain_id {
      if cid <= 0 {
          return (StatusCode::BAD_REQUEST, "Invalid chain_id: must be positive").into_response();
      }
  }
  ```
- [ ] In `get_proof_by_tx_handler`, after reading `params`, add:
  ```rust
  if !is_valid_tx_hash(&params.tx_hash) {
      return (StatusCode::BAD_REQUEST, "Invalid txHash query parameter").into_response();
  }
  ```

#### A-6: Log startup state of auth and CORS

**File**: `packages/verifier/src/main.rs`

- [ ] After building `app_state`, log the auth mode:
  ```rust
  if app_state.proof_api_key.is_some() {
      info!("Proof API: authentication ENABLED (X-TLSN-Api-Key / Authorization: Bearer)");
  } else {
      warn!("Proof API: authentication DISABLED — set PROOF_API_KEY for production");
  }
  ```

---

## Phase B — P0: First-Write Lock on `PATCH /proof/:session_id/tx`

### Context

- `patch_tx_hash()` (main.rs line 1890): `UPDATE proof_store SET tx_hash = ?1 ... WHERE session_id = ?3` — no guard against overwriting an already-set `tx_hash`.
- `API_SPEC.md` line 214 says `200 OK` on success but does not define behavior on re-write.
- A re-written `tx_hash` silently breaks the reverse lookup for the old hash.

### Tasks

#### B-1: Modify `patch_tx_hash` DB function to enforce first-write-only

**File**: `packages/verifier/src/main.rs`

- [ ] Change the `patch_tx_hash` function (line 1890) SQL to:
  ```rust
  conn.execute(
      "UPDATE proof_store SET tx_hash = ?1, chain_id = ?2 \
       WHERE session_id = ?3 AND tx_hash IS NULL",
      rusqlite::params![tx_hash, chain_id, session_id],
  )
  ```
  This makes the update a no-op if `tx_hash` is already set.

#### B-2: Return `409 Conflict` when first-write lock is triggered

**File**: `packages/verifier/src/main.rs`

- [ ] In `patch_proof_tx_handler`, the current logic treats `rows_affected == 0` as `NOT_FOUND`. Split these cases:
  ```rust
  Ok(Ok(rows_affected)) if rows_affected > 0 => StatusCode::OK.into_response(),
  Ok(Ok(_)) => {
      // rows_affected == 0: either session not found, or tx_hash already set.
      // Distinguish by checking existence.
      let exists = {
          let conn = state.db.lock().unwrap();
          get_proof_by_session_id(&conn, &session_id).is_some()
      };
      if exists {
          (StatusCode::CONFLICT, "tx_hash already set for this session — overwrite not allowed").into_response()
      } else {
          (StatusCode::NOT_FOUND, "Proof not found").into_response()
      }
  }
  ```

#### B-3: Write audit log on conflict

**File**: `packages/verifier/src/main.rs`

- [ ] Inside the `exists == true` branch above, add:
  ```rust
  warn!("[{}] Attempted overwrite of tx_hash rejected (409)", session_id);
  ```

---

## Phase B' — P0: Unified Token-Decimal-Aware Rate Formula

> **Decision**: Option A — unify all rate precision to a single canonical encoding that works for all ERC20 tokens (USDC 6dp, USDT 18dp, etc.).

### Root Cause Analysis

**Three affected sites** all compute `fiatAmountX1000` but use incompatible rate encodings:

| Site | Function | Line | Current Formula | Rate Encoding Assumed |
|---|---|---|---|---|
| CRYPTO buyer payment | `payOrderByPlatform` | 574 | `mulDiv(amount, rate, 1e33)` | `rate = fiatPrice * 1e18`, token = 18dp |
| FIAT merchant payment | `receiveCryptoWithPlatformPayment` | 649 | `mulDiv(amount, rate * 10, 1e18)` | `rate = fiatPrice * 100`, token = 18dp |
| FIAT dispute resolve | `resolveDisputeByMerchant` | 730 | `mulDiv(amount, rate * 10, 1e18)` | `rate = fiatPrice * 100`, token = 18dp |

**Both encodings hardcode 18-decimal tokens.** For USDC (6dp):
- `payOrderByPlatform`: `mulDiv(100e6, rate, 1e33)` → integer division rounds to **0**
- `receiveCryptoWithPlatformPayment`: `mulDiv(100e6, rate*10, 1e18)` → integer division rounds to **0**

Additionally, `maxOrderAmount = 1_000 * 1e18` in `C2CAdmin.sol` line 41 is also hardcoded to 18dp.

**Additional issue**: The CRYPTO and FIAT paths use different rate conventions, making it impossible for merchants to publish one rate that works consistently in both.

### Unified Solution

**Canonical rate encoding** (new standard):

```
rate = fiat_price_per_whole_token × RATE_PRECISION
RATE_PRECISION = 1e8
```

Example: 4.70 MYR per 1 USDT → `rate = 470_000_000` (4.70 × 1e8)

**Unified formula** (token-decimal-aware):

```solidity
uint256 constant RATE_PRECISION_EXP = 8;   // rate = fiatPrice * 10^8

fiatAmountX1000 = mulDiv(
    amount_raw * 1000,
    rate,
    10 ** (tokenDecimals + RATE_PRECISION_EXP)
);
```

**Proof of correctness:**

| Token | Decimals | amount_raw (100 tokens) | rate (4.70 MYR/token) | denominator | fiatAmountX1000 |
|---|---|---|---|---|---|
| USDT | 18 | `1e20` | `4.70e8` | `1e26` | `1e20 × 1000 × 4.70e8 / 1e26 = 470000` ✓ |
| USDC | 6 | `1e8` | `4.70e8` | `1e14` | `1e8 × 1000 × 4.70e8 / 1e14 = 470000` ✓ |

**Rate migration**: Old CRYPTO rates were `fiatPrice * 1e18`; new canonical is `fiatPrice * 1e8`. Merchants must re-publish rates after contract upgrade. Old FIAT rates were `fiatPrice * 100`; same re-publish required.

### Tasks

#### B'-1: Add `IERC20Metadata` import to `C2CEscrow.sol`

**File**: `packages/contracts/contracts/C2CEscrow.sol`

- [ ] Add the following import (alongside existing IERC20 import on line 5):
  ```solidity
  import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
  ```

#### B'-2: Add `RATE_PRECISION_EXP` constant and `_computeFiatAmountX1000` helper

**File**: `packages/contracts/contracts/C2CEscrow.sol`

- [ ] After the existing constants `MAX_PENDING_ORDERS`, `ORDER_TIMEOUT`, `DISPUTE_WINDOW` (around line 90), add:
  ```solidity
  /// @dev rate = fiat_price_per_whole_token × 10^RATE_PRECISION_EXP
  ///      fiatAmountX1000 = mulDiv(amount_raw × 1000, rate, 10^(tokenDecimals + RATE_PRECISION_EXP))
  ///      Works for any ERC20 token decimals (USDC=6, USDT=18, etc.)
  uint256 private constant RATE_PRECISION_EXP = 8;
  ```

- [ ] Add the helper function in the internal helpers section (after `_getTokenAddress`):
  ```solidity
  /// @dev Compute fiat amount × 1000 from raw token amount and rate.
  ///      rate must be encoded as: fiat_price_per_whole_token × 10^RATE_PRECISION_EXP
  ///      Works for any ERC20 token regardless of its decimal count.
  function _computeFiatAmountX1000(
      uint256 amountRaw,
      uint256 rate,
      uint256 cryptoID
  ) internal view returns (uint256) {
      address tokenAddr = _getTokenAddress(cryptoID);
      uint8 decimals = IERC20Metadata(tokenAddr).decimals();
      uint256 denominator = 10 ** (uint256(decimals) + RATE_PRECISION_EXP);
      return Math.mulDiv(amountRaw * 1000, rate, denominator);
  }
  ```

#### B'-3: Replace the hardcoded formula in all three sites

**File**: `packages/contracts/contracts/C2CEscrow.sol`

- [ ] **Line 558–574** (`payOrderByPlatform`): Replace:
  ```solidity
  // @dev fiatAmountX1000 = mulDiv(amount, rate, 1e33)
  //      assumes token is 18 decimals and rate is 18-decimal precision.
  ...
  uint256 fiatAmountX1000 = Math.mulDiv(o.amount, o.rate, 1e33);
  ```
  With:
  ```solidity
  uint256 fiatAmountX1000 = _computeFiatAmountX1000(o.amount, o.rate, p.cryptoID);
  ```
  Also remove the old `@dev` comment from the NatSpec block above.

- [ ] **Line 630–649** (`receiveCryptoWithPlatformPayment`): Replace:
  ```solidity
  // @dev fiatAmountX1000 = mulDiv(amount, rate * 10, 1e18)
  //      FIAT product uses 2-decimal integer rate (e.g. 250 = 2.50 CNY/USDT).
  ...
  uint256 fiatAmountX1000 = Math.mulDiv(o.amount, o.rate * 10, 1e18);
  ```
  With:
  ```solidity
  uint256 fiatAmountX1000 = _computeFiatAmountX1000(o.amount, o.rate, p.cryptoID);
  ```
  Also remove the old `@dev` comment from the NatSpec block above.

- [ ] **Line 730** (`resolveDisputeByMerchant`): Replace:
  ```solidity
  uint256 fiatAmountX1000 = Math.mulDiv(o.amount, o.rate * 10, 1e18);
  ```
  With:
  ```solidity
  uint256 fiatAmountX1000 = _computeFiatAmountX1000(o.amount, o.rate, p.cryptoID);
  ```

#### B'-4: Fix `maxOrderAmount` to be token-decimal-aware

**File**: `packages/contracts/contracts/C2CAdmin.sol`

- [ ] Update the storage comment and initial value (line 40–41):
  ```solidity
  // Maximum order size expressed as 18-decimal-normalised amount.
  // 1_000 * 1e18 ≡ "1000 whole tokens" regardless of the token's own decimal count.
  uint256 public maxOrderAmount = 1_000 * 1e18;
  ```
  (The value stays the same; the semantic clarification is what changes.)

**File**: `packages/contracts/contracts/C2CEscrow.sol`

- [ ] In `placeOrder` (line 442–443), replace the `ExceedsUsdCap` check:
  ```solidity
  // 2. USD 上限校验（D-5：1:1，直接比较代币数量）
  if (_amount > adminContract.maxOrderAmount()) revert ExceedsUsdCap();
  ```
  With a decimal-normalised comparison:
  ```solidity
  // Normalise amount to 18 decimals for cap comparison (works for any ERC20).
  {
      address tokenAddr = _getTokenAddress(p.cryptoID);
      uint8 dec = IERC20Metadata(tokenAddr).decimals();
      uint256 normalised = dec <= 18
          ? _amount * (10 ** (18 - dec))
          : _amount / (10 ** (dec - 18));
      if (normalised > adminContract.maxOrderAmount()) revert ExceedsUsdCap();
  }
  ```

#### B'-5: Update `publishRate` NatSpec in `C2CAdmin.sol`

**File**: `packages/contracts/contracts/C2CAdmin.sol`

- [ ] Above `publishRate` (line 296), add/update NatSpec:
  ```solidity
  /// @notice Merchant publishes or updates the exchange rate for a product.
  /// @param _rate Exchange rate encoded as: fiat_price_per_whole_token × 10^8
  ///              Example: 4.70 MYR per 1 USDT → _rate = 470_000_000
  ///              This encoding is token-decimal-agnostic.
  /// @dev ⚠️  MIGRATION: After the C2CEscrow contract upgrade that introduced
  ///      RATE_PRECISION_EXP = 8, all existing rates must be re-published.
  ///      Old CRYPTO encoding (rate = fiatPrice × 1e18) is incompatible.
  ///      Old FIAT encoding (rate = fiatPrice × 100) is incompatible.
  ```

#### B'-6: Add tests

**File**: `packages/contracts/test/C2CEscrow.ts`

- [ ] Add a test `"fiatAmountX1000 is equal for USDC and USDT at the same nominal fiat amount"`:
  - Deploy two products: one using USDC (mock 6dp), one using USDT (mock 18dp)
  - Publish the same rate (e.g., `470_000_000` for 4.70 MYR/token) for both
  - Place orders for 100 tokens on each
  - Call `payOrderByPlatform` with a mock proof that encodes `fiatAmountX1000 = 470000`
  - Assert both succeed (platform verifier accepts the amount)
  - Assert both fail if fiatAmountX1000 = 470001 (wrong amount rejected)

- [ ] Add a test `"maxOrderAmount cap is enforced for USDC"`:
  - Place an order of 1001 USDC (1001 * 1e6)
  - Assert it reverts with `ExceedsUsdCap` (normalised value = 1001 * 1e18 > 1000 * 1e18)
  - Place an order of 999 USDC → assert it succeeds

- [ ] Add a test `"resolveDisputeByMerchant fiatAmountX1000 matches payOrderByPlatform"`:
  - Assert that for a FIAT product with USDT, the fiatAmountX1000 passed to the platform verifier is identical in `receiveCryptoWithPlatformPayment` and `resolveDisputeByMerchant` for the same order

---

## Phase C — P1: Populate `field_label` in `AccountCheckResult`

### Context

- `account_check_results.push(AccountCheckResult { ..., field_label: None })` at main.rs line 1318–1327.
- The `RevealConfig` message carries `accountChecks` which have a `direction`, `start`, `end` range.
- `handler_results` (built in the same session) carry a `label` field for labeled handlers and also contain `start`/`end` ranges.
- Cross-referencing the two by `(direction, start, end)` key would allow filling in `field_label`.

### Tasks

#### C-1: Build a range→label lookup from `handler_results` before constructing account checks

**File**: `packages/verifier/src/main.rs`

- [ ] After `handler_results` is built (after line ~1450), before the `for check in &account_checks_raw` loop (~line 1290), construct a lookup map:
  ```rust
  // Build (direction, start, end) → label lookup from handler_results for field_label population
  let handler_label_lookup: std::collections::HashMap<(String, usize, usize), String> =
      handler_results
          .iter()
          .filter_map(|hr| {
              hr.handler.label.as_ref().map(|lbl| {
                  let dir = match hr.handler.handler_type {
                      HandlerType::Sent => "SENT".to_string(),
                      HandlerType::Recv => "RECV".to_string(),
                  };
                  ((dir, hr.start, hr.end), lbl.clone())
              })
          })
          .collect();
  ```
  > **Note**: If `handler_results` is built after the account check loop due to code order, restructure by extracting the loop into a helper or by doing two passes. Do NOT change the verification logic — only the result construction order.

#### C-2: Use the lookup when building each `AccountCheckResult`

**File**: `packages/verifier/src/main.rs`

- [ ] Replace `field_label: None` (line 1326) with:
  ```rust
  field_label: handler_label_lookup.get(&(check.direction.clone(), check.start, check.end)).cloned(),
  ```

---

## Phase C' — P1: `adminForceSettle` Time Guard

> **Decision**: Option A — `adminForceSettle` may only be called after `disputeDeadline` has passed. All dispute outcomes are governed by contract rules; no admin shortcut during the merchant's evidence window.

### Context

- `adminForceSettle` in `C2CEscrow.sol` line 801 only requires `o.status == OrderStatus.DISPUTED` — no check that `disputeDeadline` has passed.
- `resolveDisputeByMerchant` requires `block.timestamp <= o.disputeDeadline` (line 725), giving the merchant a protected window to submit proof.
- Without a time guard, admin can call `adminForceSettle` while the merchant's window is still open, pre-empting a legitimate proof submission and centralising power in the admin key.
- The error `DisputeWindowNotExpired` already exists in `C2CTypes.sol` (line ~178) and is already used by `finalizeExpiredDispute` — reuse it here.

### Tasks

#### C'-1: Add the time guard to `adminForceSettle`

**File**: `packages/contracts/contracts/C2CEscrow.sol`

- [ ] After the `NotDisputedOrder` check (line 811), add one line:
  ```solidity
  if (o.status != OrderStatus.DISPUTED) revert NotDisputedOrder();
  if (block.timestamp <= o.disputeDeadline) revert DisputeWindowNotExpired(); // ← add this
  ```

- [ ] Update the NatSpec above the function (line ~799) to document the time constraint:
  ```solidity
  /// @notice Admin force-settles a disputed order after the merchant's evidence window has closed.
  /// @dev    Can only be called after `disputeDeadline` has passed. During the window,
  ///         the merchant must use `resolveDisputeByMerchant` to submit TLSN proof.
  ///         Once the window closes, admin may intervene to unblock stuck orders.
  /// @param settleToMerchant true = release to merchant; false = compensate buyer (×2)
  ```

#### C'-2: Add contract tests

**File**: `packages/contracts/test/C2CEscrow.ts`

- [ ] Add test `"adminForceSettle reverts if disputeDeadline has not yet passed"`:
  ```
  given: FIAT order in DISPUTED state, disputeDeadline in the future
  when:  admin calls adminForceSettle
  then:  reverts with DisputeWindowNotExpired
  ```

- [ ] Add test `"adminForceSettle succeeds after disputeDeadline expires — settleToMerchant=true"`:
  ```
  given: FIAT order in DISPUTED state
  when:  time.increase past disputeDeadline, then admin calls adminForceSettle(true)
  then:  order status → COMPLETED, merchant receives crypto
  ```

- [ ] Add test `"adminForceSettle succeeds after disputeDeadline expires — settleToMerchant=false"`:
  ```
  given: FIAT order in DISPUTED state
  when:  time.increase past disputeDeadline, then admin calls adminForceSettle(false)
  then:  order status → EXPIRED, buyer receives 2× compensation
  ```

- [ ] Add test `"merchant can still resolve dispute before disputeDeadline even if admin tries to intervene"`:
  ```
  given: FIAT order in DISPUTED state, disputeDeadline in the future
  step 1: admin calls adminForceSettle → reverts (DisputeWindowNotExpired)
  step 2: merchant calls resolveDisputeByMerchant with valid proof → succeeds
  ```

---

## Phase D — P1: Integration Test Coverage (401/400/409)

### Context

- `packages/verifier/src/tests/integration_test.rs` lines 1027–1122: only 200 and 404 paths covered.
- After Phase A–B, three new failure modes exist: 401 (bad auth), 400 (bad input), 409 (re-write).

### Tasks

#### D-1: Add a test helper to start the verifier with an API key configured

**File**: `packages/verifier/src/tests/integration_test.rs`

- [ ] Add a helper `start_verifier_server_with_key(port: u16, key: &str)` that sets `PROOF_API_KEY` env var before starting the server (or passes it through `AppState` directly for test isolation).

#### D-2: Add test — `GET /proof/:id` without key → 401

**File**: `packages/verifier/src/tests/integration_test.rs`

- [ ] New test `test_proof_api_auth_required`:
  ```
  given: server started with PROOF_API_KEY = "test-secret"
  when:  GET /proof/<any-id> with no X-TLSN-Api-Key header
  then:  StatusCode::UNAUTHORIZED (401)
  ```

#### D-3: Add test — `GET /proof/:id` with wrong key → 401

- [ ] Same test, second case:
  ```
  when:  GET /proof/<any-id> with X-TLSN-Api-Key: wrong-key
  then:  StatusCode::UNAUTHORIZED (401)
  ```

#### D-4: Add test — `GET /proof/:id` with correct key → passthrough (200 or 404)

- [ ] Same test, third case:
  ```
  when:  GET /proof/<any-id> with X-TLSN-Api-Key: test-secret
  then:  StatusCode::NOT_FOUND (404)  ← correct — no record seeded, but auth passed
  ```

#### D-5: Add test — `PATCH /proof/:id/tx` with invalid `tx_hash` → 400

**File**: `packages/verifier/src/tests/integration_test.rs`

- [ ] New test `test_patch_tx_invalid_inputs`:
  ```
  given: server started with key; record seeded
  when:  PATCH with txHash = "not-a-hash"
  then:  400 Bad Request
  ```
- [ ] Second case:
  ```
  when:  PATCH with txHash = "0xinvalid!!!"
  then:  400 Bad Request
  ```
- [ ] Third case:
  ```
  when:  PATCH with chainId = -1
  then:  400 Bad Request
  ```

#### D-6: Add test — `PATCH` twice on same session → 409 on second

**File**: `packages/verifier/src/tests/integration_test.rs`

- [ ] New test `test_patch_tx_no_overwrite`:
  ```
  given: server started; record seeded
  step 1: PATCH with txHash = "0xabc...1" → 200
  step 2: PATCH again with txHash = "0xabc...2" → 409 Conflict
  step 3: GET /proof/:id → txHash is still "0xabc...1" (unchanged)
  ```

#### D-7: Add test — `GET /proof?txHash=` with invalid format → 400

- [ ] New test:
  ```
  when:  GET /proof?txHash=not-a-valid-hash
  then:  400 Bad Request
  ```

---

## Phase E — P1: Documentation Alignment

### Context

- `packages/verifier/API_SPEC.md` lines 321–329: only four env vars listed, no auth semantics, no 400/401/409 response codes.

### Tasks

#### E-1: Add authentication section to API_SPEC.md

**File**: `packages/verifier/API_SPEC.md`

- [ ] Add a new `## Authentication` section before the existing `## Endpoints` section:
  ```markdown
  ## Authentication

  The `/proof*` endpoints require an API key when `PROOF_API_KEY` is set.

  **Header (either form accepted):**
  ```
  X-TLSN-Api-Key: <your-key>
  Authorization: Bearer <your-key>
  ```

  **Response when unauthenticated:** `401 Unauthorized`

  When `PROOF_API_KEY` is not set, the server starts in **dev mode** and all requests are allowed. This is logged as a warning at startup.
  ```

#### E-2: Update `PATCH /proof/:session_id/tx` response table

**File**: `packages/verifier/API_SPEC.md`

- [ ] In the `PATCH /proof/:session_id/tx` section, replace the response list with:
  ```markdown
  **Response** `200 OK` — tx hash and chain ID recorded successfully.  
  **Response** `400 Bad Request` — `txHash` format is invalid or `chainId` is not a positive integer.  
  **Response** `401 Unauthorized` — missing or incorrect API key.  
  **Response** `404 Not Found` — session ID not found in proof store.  
  **Response** `409 Conflict` — `tx_hash` is already set for this session; overwrite not allowed.  
  **Response** `500 Internal Server Error` — database write failed.
  ```

#### E-3: Update `GET /proof?txHash=` response table

**File**: `packages/verifier/API_SPEC.md`

- [ ] Add `400 Bad Request` and `401 Unauthorized` entries to that section.

#### E-4: Update the Environment Variables table

**File**: `packages/verifier/API_SPEC.md`

- [ ] Add three new rows to the table (lines 321–329):

  | Variable | Default | Description |
  |---|---|---|
  | `PROOF_API_KEY` | unset | API key for `/proof*` endpoints. If unset, auth is disabled (dev mode). |
  | `CORS_ALLOW_ORIGINS` | `http://localhost:3000,http://localhost:8080` | Comma-separated list of allowed CORS origins. If unset, defaults to localhost only. |

#### E-5: Add `adminForceSettle` time semantics to contract comments (from Phase C')

- [ ] Confirm the decision from Phase C' is reflected in both the Solidity `@dev` comment and a note in any relevant off-chain documentation.

---

## Phase F — P2: Operational Robustness (Rate Limiting + Audit Logging)

### Context

- WebSocket endpoints `/session`, `/verifier`, `/proxy` have no connection rate limiting.
- `/proof` read/write operations have no access audit trail.

### Tasks

#### F-1: Add per-IP connection rate limiting to WebSocket endpoints

**File**: `packages/verifier/src/main.rs`

- [ ] Add `tower-governor` or a simple `Arc<Mutex<HashMap<IpAddr, (u32, Instant)>>>` counter to `AppState`.
- [ ] In each WebSocket handler (`session_ws_handler`, `verifier_ws_handler`, `proxy_ws_handler`), extract the client IP from `ConnectInfo<SocketAddr>` and apply a rate check:
  - Limit: configurable via `WS_RATE_LIMIT_PER_IP` env var (default: 10 connections per minute per IP).
  - On limit exceeded: close WebSocket with `1008 Policy Violation` before upgrading.

#### F-2: Add request body size limit to HTTP endpoints

**File**: `packages/verifier/src/main.rs`

- [ ] Add `.layer(axum::extract::DefaultBodyLimit::max(65_536))` (64 KB) to the router to reject oversized PATCH bodies.

#### F-3: Add structured audit logging for `/proof` access

**File**: `packages/verifier/src/main.rs`

- [ ] In `get_proof_handler`, after a successful DB fetch, log:
  ```rust
  info!(session_id = %session_id, action = "proof_read", "Proof accessed");
  ```
- [ ] In `patch_proof_tx_handler`, after a successful write, log:
  ```rust
  info!(session_id = %session_id, tx_hash = %body.tx_hash, action = "tx_hash_written", "tx_hash recorded");
  ```
- [ ] In `get_proof_by_tx_handler`, after a successful fetch, log:
  ```rust
  info!(tx_hash = %params.tx_hash, action = "proof_read_by_tx", "Proof accessed by tx_hash");
  ```

#### F-4: Add `WS_MAX_SESSIONS` guard

**File**: `packages/verifier/src/main.rs`

- [ ] Before creating a new session in `handle_session_websocket`, check `sessions.len()` against `WS_MAX_SESSIONS` env var (default: 100). If exceeded, send an error message and close.

---

## Verification Checklist (Run After All Phases)

Before closing the plan, verify these end-to-end conditions:

- [ ] `cargo test` passes with zero failures in `packages/verifier/`
- [ ] `npx hardhat test` passes with zero failures in `packages/contracts/`
- [ ] `GET /proof/<id>` without `PROOF_API_KEY` set → 200 (dev mode passthrough)
- [ ] `GET /proof/<id>` with `PROOF_API_KEY=secret` set but no header → 401
- [ ] `GET /proof/<id>` with correct `X-TLSN-Api-Key: secret` → 200 or 404
- [ ] `PATCH /proof/<id>/tx` with `txHash: "not-hex"` → 400
- [ ] `PATCH /proof/<id>/tx` twice with same session → 409 on second call
- [ ] `GET /proof?txHash=bad-input` → 400
- [ ] `adminForceSettle` test reflects the Phase C' decision
- [ ] `API_SPEC.md` env var table includes `PROOF_API_KEY` and `CORS_ALLOW_ORIGINS`
- [ ] `CORS_ALLOW_ORIGINS=https://yourdomain.com cargo run` starts and logs the allowed origins

---

## File Change Index

| File | Phase(s) | Nature of Change |
|---|---|---|
| `packages/verifier/src/main.rs` | A, B, C, F | Auth middleware, CORS, validation, first-write lock, field_label, rate limit, audit log |
| `packages/verifier/src/tests/integration_test.rs` | D | New 401/400/409 test cases |
| `packages/verifier/API_SPEC.md` | E | Auth section, 400/401/409 response codes, new env vars |
| `packages/contracts/contracts/C2CEscrow.sol` | B', C' | Add `IERC20Metadata` import; add `RATE_PRECISION_EXP` constant; add `_computeFiatAmountX1000` helper; replace 3 hardcoded formulas; fix `maxOrderAmount` cap; add `adminForceSettle` time guard |
| `packages/contracts/contracts/C2CAdmin.sol` | B' | Update `publishRate` NatSpec with new rate encoding; update `maxOrderAmount` comment |
| `packages/contracts/test/C2CEscrow.ts` | B', C' | USDC/USDT parity test; max order cap test; dispute resolve amount parity test; adminForceSettle time guard tests (4 cases) |

---

## Implementation Order

```
Phase A (auth + CORS + input validation)
  └─► Phase B (first-write lock + 409)
        └─► Phase B' (unified token-decimal-aware rate formula — NO decision needed, implement directly)
              └─► Phase C (field_label population)
                    └─► Phase C' (adminForceSettle time guard — NO decision needed, implement Option A directly)
                          └─► Phase D (integration tests)
                                └─► Phase E (API_SPEC.md docs)
                                      └─► Phase F (rate limit + audit log)
```

> **No more decision checkpoints.** B' and C' decisions have been made upfront and are fully specified in their respective sections. Implement each phase completely, run tests, then proceed.

---

## Rate Migration Notice

After Phase B' is deployed to any testnet/mainnet:

1. **All merchants must re-publish rates** via `C2CAdmin.publishRate()` using the new encoding:
   ```
   new_rate = fiat_price_per_whole_token × 10^8
   ```
   Example: 4.70 MYR/USDT → `publishRate(productId, assetType, 470_000_000, expiresAt)`

2. **Old rates stored on-chain are incompatible** and will produce wrong `fiatAmountX1000` values until re-published.

3. For testnet deployments, admin should call `publishRate` for all active merchant products as part of the upgrade procedure.
