# TLSNotary Verifier Server — API Specification

Version: 0.1.0  
Compliance: FATF R.11 (5-year retention), R.15 (policy versioning), R.16 (Travel Rule fields)

---

## Overview

The verifier server exposes HTTP and WebSocket endpoints for MPC-TLS proof generation and retrieval. After a successful verification session the server:

1. Signs transcript commitments with an ECDSA secp256k1 key (EIP-191 personal_sign)
2. Sends a slim compliance webhook to configured endpoints (HMAC-SHA256 authenticated)
3. Persists the full proof record to SQLite for 5-year retrieval (R.11)

---

## Authentication

The `/proof*` endpoints require an API key when `PROOF_API_KEY` is set.

**Header (either form accepted):**

```
X-TLSN-Api-Key: <your-key>
Authorization: Bearer <your-key>
```

**Response when unauthenticated:** `401 Unauthorized`

When `PROOF_API_KEY` is not set, the server starts in **dev mode** and all requests are allowed. This is logged as a warning at startup.

---

## Endpoints

### `GET /health`

Health check. Returns `200 OK` with body `ok`.

---

### `GET /info`

Returns server version metadata.

**Response** `200 OK`

```json
{
  "version": "0.1.0",
  "git_hash": "abc1234",
  "tlsn_version": "0.1.0-alpha.14"
}
```

---

### `WS /session`

Creates a new verification session. The client registers parameters and receives a session ID.

**Client → Server: register**

```json
{
  "type": "register",
  "maxRecvData": 16384,
  "maxSentData": 4096,
  "sessionData": {
    "__tlsn_policy_version": "v1.0.0",
    "__tlsn_order_binding_hash": "0x<32-byte-keccak256-hex>"
  }
}
```

`sessionData` reserved keys:

| Key | Purpose |
|-----|---------|
| `__tlsn_policy_version` | R.15: policy semver locked into verifier signature |
| `__tlsn_order_binding_hash` | `0x`-prefixed 32-byte keccak256 order hash (optional) |
| `__tlsn_tc_include_verifier_transcript` | `"true"` to include verifier transcript in response |

**Server → Client: session_registered**

```json
{
  "type": "session_registered",
  "sessionId": "<uuid>"
}
```

**Client → Server: reveal_config** (after prover completes)

```json
{
  "type": "reveal_config",
  "sent": [
    { "start": 0, "end": 512, "handler": { "type": "SENT", "part": "START_LINE", "label": "transaction.id" } }
  ],
  "recv": [
    { "start": 0, "end": 1024, "handler": { "type": "RECV", "part": "BODY", "label": "originator.amount" } }
  ]
}
```

Handler `label` values follow the Travel Rule field vocabulary (R.16):

| Label | Meaning |
|-------|---------|
| `originator.accountId` | Originator account identifier |
| `originator.name` | Originator legal name |
| `originator.amount` | Transfer amount |
| `originator.currency` | Transfer currency |
| `originator.timestamp` | Transfer timestamp |
| `beneficiary.accountId` | Beneficiary account identifier |
| `beneficiary.name` | Beneficiary legal name |
| `beneficiary.amount` | Beneficiary received amount |
| `transaction.id` | Payment/order reference ID |
| `transaction.status` | Payment status |

**Server → Client: session_completed**

```json
{
  "type": "session_completed",
  "results": [
    {
      "commitmentIndex": 0,
      "type": "RECV",
      "part": "BODY",
      "label": "originator.amount",
      "value": "100.00",
      "start": 512,
      "end": 518
    }
  ],
  "transcriptCommitments": [...],
  "verifierSignature": {
    "chainId": 11155111,
    "sessionId": "<uuid>",
    "commitmentsHash": "<hex>",
    "orderBindingHash": "0x<hex>",
    "policyVersion": "v1.0.0",
    "policyVersionHash": "0x<32-byte-hex>",
    "signature": "<65-byte-hex>",
    "verifierAddress": "0x<20-byte-hex>"
  }
}
```

---

### `WS /verifier?sessionId=<id>`

Low-level TLSNotary verifier WebSocket used internally by the prover.

---

### `WS /proxy?token=<host>`

WebSocket proxy that forwards TLS traffic to the specified `host:443`. Compatible with `notary.pse.dev/proxy`.

---

### `GET /proof/:session_id`

Retrieve a full proof record by session ID (R.11 retrieval).

**Response** `200 OK`

```json
{
  "formatVersion": "ProofExportV1",
  "attestationId": "<session-uuid>",
  "txHash": "0x<hex>",
  "policyVersion": "v1.0.0",
  "timestamp": "2026-04-21T08:00:00Z",
  "serverName": "wise.com",
  "verifierVersion": "0.1.0",
  "orderBindingHash": "0x<hex>",
  "commitmentsHash": "<hex>",
  "verifierSignature": "<65-byte-hex>",
  "verifierAddress": "0x<20-byte-hex>",
  "chainId": 11155111,
  "travelRuleFields": {
    "originator.amount": { "value": "100.00", "commitmentIndex": 2 },
    "transaction.id":    { "value": "TXN-001", "commitmentIndex": 3 }
  },
  "accountChecks": [
    {
      "direction": "recv",
      "start": 100,
      "end": 150,
      "expectedHash": "0x<hex>",
      "computedHash": "0x<hex>",
      "valueMode": "json_value",
      "passed": true,
      "fieldLabel": "originator.accountId"
    }
  ],
  "transcriptCommitments": [
    { "commitmentIndex": 0, "hashHex": "0x<hex>", "start": 0, "end": 10 }
  ],
  "redactedTranscript": {
    "sent": "<utf8-with-redacted-bytes>",
    "recv": "<utf8-with-redacted-bytes>"
  },
  "handlerResults": [...],
  "sessionData": { ... }
}
```

**Response** `404 Not Found` — session ID not in proof store.

---

### `PATCH /proof/:session_id/tx`

Write the on-chain transaction hash after contract submission. Called by the frontend after `eth_sendTransaction` confirms.

**Request body**

```json
{
  "txHash": "0x<64-hex-chars>",
  "chainId": 11155111
}
```

**Response** `200 OK` — tx hash and chain ID recorded successfully.  
**Response** `400 Bad Request` — `txHash` format is invalid (must be `0x<1-64 hex chars>`) or `chainId` is not a positive integer.  
**Response** `401 Unauthorized` — missing or incorrect API key.  
**Response** `404 Not Found` — session ID not found in proof store.  
**Response** `409 Conflict` — `tx_hash` is already set for this session; overwrite not allowed.  
**Response** `500 Internal Server Error` — database write failed.

---

### `GET /proof?txHash=<hash>`

Reverse lookup: retrieve proof record by on-chain transaction hash.

**Query params**

| Param | Required | Description |
|-------|----------|-------------|
| `txHash` | yes | `0x`-prefixed transaction hash |

**Response** `200 OK` — same body shape as `GET /proof/:session_id`.  
**Response** `400 Bad Request` — `txHash` query parameter is missing or has an invalid format.  
**Response** `401 Unauthorized` — missing or incorrect API key.  
**Response** `404 Not Found` — tx hash not found.

---

## Webhook

After each successful session the verifier POSTs a `SlimWebhookPayload` (JSON) to the configured URL. Only labeled handler results appear in `travelRuleFields` — raw transcripts are omitted (retrieve via `GET /proof/:id` instead).

**Payload**

```json
{
  "attestationId": "<session-uuid>",
  "policyVersion": "v1.0.0",
  "serverName": "wise.com",
  "travelRuleFields": {
    "originator.amount": { "value": "100.00", "commitmentIndex": 2 },
    "transaction.id":    { "value": "TXN-001", "commitmentIndex": 3 }
  },
  "accountChecksAllPassed": true,
  "verifierSignature": "<65-byte-hex>",
  "verifierAddress": "0x<hex>",
  "orderBindingHash": "0x<hex>",
  "timestamp": "2026-04-21T08:00:00Z"
}
```

**HMAC-SHA256 Authentication**

When `secret` is set in `config.yaml`, the verifier adds:

```
X-TLSN-Signature: sha256=<64-hex-chars>
```

Verify on your backend:

```python
import hmac, hashlib
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
assert f"sha256={expected}" == request.headers["X-TLSN-Signature"]
```

---

## Verifier Signature

`sign_commitments` produces an EIP-191 personal_sign over a 136-byte preimage:

```
preimage = chainId(8 BE) || keccak256(sessionId)(32)
         || commitmentsHash(32) || orderBindingHash(32)
         || policyVersionHash(32)
```

Where `policyVersionHash = keccak256(policyVersion UTF-8)` or `[0x00; 32]` if absent.
`policyVersionHash` is returned explicitly in `verifierSignature` for direct on-chain submission.

`commitmentsHash = keccak256(hashHex[0] || hashHex[1] || ...)` over all commitment hashes.

The 65-byte signature is `r(32) || s(32) || v(1)` with `v = recovery_id + 27`.

---

## Data Retention (R.11)

Proof records are persisted in SQLite with:

- `recorded_at`: RFC3339 UTC timestamp of the session (e.g. `2026-04-21T08:00:00Z`)
- `retain_until`: RFC3339 UTC timestamp = `recorded_at + 5 years`

The `PROOF_DB_PATH` environment variable sets the database file path (default: `evidence.db`).

---

## Configuration (`config.yaml`)

```yaml
webhooks:
  "wise.com":
    url: "https://your-backend.example.com/webhook/wise"
    secret: "your-hmac-secret"      # enables X-TLSN-Signature header
    headers:
      Authorization: "Bearer token"

  "*":                               # wildcard catch-all
    url: "https://your-backend.example.com/webhook/default"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7047` | Listening port |
| `VERIFIER_PRIVATE_KEY` | unset | Hex-encoded secp256k1 private key for signing |
| `CHAIN_ID` | `11155111` (Sepolia) | EVM chain ID for signature |
| `PROOF_DB_PATH` | `evidence.db` | SQLite database file path |
| `PROOF_API_KEY` | unset | API key for `/proof*` endpoints. If unset, auth is disabled (dev mode). Logged as a warning at startup. |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3000,http://localhost:8080` | Comma-separated list of allowed CORS origins. If unset, defaults to localhost only. |
