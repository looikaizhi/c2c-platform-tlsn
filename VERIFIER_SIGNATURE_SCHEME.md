# Verifier Signature Scheme — Design & Test Plan

## 目标

在 TLSNotary Verifier（Rust）完成 MPC-TLS 验证后，对以下内容进行 secp256k1 签名：

```
commitments_hash = keccak256(hashHex[0] || hashHex[1] || ... || hashHex[n])
message_hash     = keccak256(abi.encode(chainId, keccak256(sessionId), commitments_hash))
eth_signed_hash  = keccak256("\x19Ethereum Signed Message:\n32" || message_hash)
```

签名结果附加在 `session_completed` 响应中返回给 Extension。

---

## Part 1 — Verifier 签名实现（Rust）

### 1.1 新增 Cargo.toml 依赖

在 `packages/verifier/Cargo.toml` 的 `[dependencies]` 中添加：

```toml
# secp256k1 签名（Ethereum 兼容，RustCrypto 官方实现）
k256 = { version = "0.13", features = ["ecdsa"] }

# keccak256（用于消息哈希，与 Solidity keccak256 完全一致）
sha3 = "0.10"

# hex 编解码
hex = "0.4"
```

> `k256` 与 `sha3` 大概率已在 `tlsn` 的传递依赖树中，cargo 会复用，不会增加实际体积。

### 1.2 环境变量

```bash
# 生成一个 Ethereum 私钥（32 bytes hex，无 0x 前缀）
# 可用 cast wallet new 或 openssl rand -hex 32 生成
export VERIFIER_PRIVATE_KEY=<你的32字节hex私钥>
```

**注意：** 不要提交私钥到 git。生产环境通过 Docker secret 或 AWS Secrets Manager 注入。

### 1.3 签名逻辑（放在 `verifier.rs` 或 `main.rs` 顶部工具函数区）

#### 数据结构（新增到 `main.rs` 的 ServerMessage）

```rust
/// Verifier 签名附加到 session_completed 响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VerifierSignature {
    pub chain_id: u64,
    pub session_id: String,
    pub commitments_hash: String,   // hex，不含 0x
    pub signature: String,          // 65-byte hex (r+s+v)，不含 0x
    pub verifier_address: String,   // 0x 开头
}
```

在 `ServerMessage::SessionCompleted` 中新增字段：

```rust
SessionCompleted {
    results: Vec<HandlerResult>,
    #[serde(rename = "transcriptCommitments")]
    transcript_commitments: Vec<TranscriptCommitmentSummary>,
    #[serde(rename = "verifierTranscript", skip_serializing_if = "Option::is_none")]
    verifier_transcript: Option<VerifierTranscriptSummary>,
    // ↓ 新增
    #[serde(rename = "verifierSignature", skip_serializing_if = "Option::is_none")]
    verifier_signature: Option<VerifierSignature>,
},
```

#### 核心签名函数

```rust
use k256::{
    ecdsa::{SigningKey, Signature, signature::hazmat::PrehashSigner},
    elliptic_curve::sec1::ToEncodedPoint,
    PublicKey,
};
use sha3::{Keccak256, Digest};

/// 把公钥转换为 Ethereum 地址（keccak256(pubkey_uncompressed[1..])[12..]）
fn eth_address_from_signing_key(signing_key: &SigningKey) -> String {
    let verifying_key = signing_key.verifying_key();
    let point = verifying_key.to_encoded_point(false); // uncompressed, 65 bytes
    let pubkey_bytes = &point.as_bytes()[1..];          // 去掉 0x04 前缀，剩 64 bytes

    let hash = Keccak256::digest(pubkey_bytes);
    format!("0x{}", hex::encode(&hash[12..]))           // 取最后 20 bytes
}

/// 对 transcript commitments 生成 Ethereum 兼容签名
///
/// message_hash = keccak256(
///     chainId(32 bytes big-endian)
///     || keccak256(sessionId as UTF-8)(32 bytes)
///     || commitments_hash(32 bytes)
/// )
/// eth_hash = keccak256("\x19Ethereum Signed Message:\n32" || message_hash)
///
/// 返回 (verifier_address, commitments_hash_hex, signature_hex)
fn sign_commitments(
    signing_key: &SigningKey,
    chain_id: u64,
    session_id: &str,
    transcript_commitments: &[TranscriptCommitmentSummary],
) -> Result<(String, String, String), eyre::ErrReport> {
    // 1. commitments_hash = keccak256(hashHex[0] || hashHex[1] || ...)
    let mut hasher = Keccak256::new();
    for commitment in transcript_commitments {
        if let Some(hash_hex) = &commitment.hash_hex {
            let bytes = hex::decode(hash_hex)
                .map_err(|e| eyre::eyre!("Invalid hashHex: {}", e))?;
            hasher.update(&bytes);
        }
    }
    let commitments_hash: [u8; 32] = hasher.finalize().into();
    let commitments_hash_hex = hex::encode(commitments_hash);

    // 2. session_id_hash = keccak256(session_id as UTF-8)
    let session_id_hash: [u8; 32] = Keccak256::digest(session_id.as_bytes()).into();

    // 3. message_hash = keccak256(chainId_32bytes || session_id_hash || commitments_hash)
    //    chainId を uint256 big-endian 32 bytes に変換
    let mut chain_id_bytes = [0u8; 32];
    chain_id_bytes[24..].copy_from_slice(&chain_id.to_be_bytes());

    let mut message_preimage = Vec::with_capacity(96);
    message_preimage.extend_from_slice(&chain_id_bytes);
    message_preimage.extend_from_slice(&session_id_hash);
    message_preimage.extend_from_slice(&commitments_hash);

    let message_hash: [u8; 32] = Keccak256::digest(&message_preimage).into();

    // 4. eth_signed_hash = keccak256("\x19Ethereum Signed Message:\n32" || message_hash)
    let prefix = b"\x19Ethereum Signed Message:\n32";
    let mut eth_preimage = Vec::with_capacity(prefix.len() + 32);
    eth_preimage.extend_from_slice(prefix);
    eth_preimage.extend_from_slice(&message_hash);
    let eth_signed_hash: [u8; 32] = Keccak256::digest(&eth_preimage).into();

    // 5. secp256k1 ECDSA 签名（对 prehash 签名）
    let (sig, recovery_id): (Signature, k256::ecdsa::RecoveryId) = signing_key
        .sign_prehash_recoverable(&eth_signed_hash)
        .map_err(|e| eyre::eyre!("Sign failed: {}", e))?;

    // 6. 组装 65-byte signature: r(32) + s(32) + v(1)
    let sig_bytes = sig.to_bytes();
    let v = recovery_id.to_byte() + 27; // Ethereum 约定：27 或 28
    let mut sig65 = Vec::with_capacity(65);
    sig65.extend_from_slice(&sig_bytes);
    sig65.push(v);
    let signature_hex = hex::encode(&sig65);

    let verifier_address = eth_address_from_signing_key(signing_key);

    Ok((verifier_address, commitments_hash_hex, signature_hex))
}
```

#### 在 `run_verifier_task` 中调用

在构建 `VerificationResult` 之前，读取私钥并签名：

```rust
// 读取私钥（可选，若未配置则跳过签名）
let verifier_signature = match std::env::var("VERIFIER_PRIVATE_KEY") {
    Ok(hex_key) => {
        match hex::decode(&hex_key)
            .map_err(|e| eyre::eyre!("Bad VERIFIER_PRIVATE_KEY hex: {}", e))
            .and_then(|bytes| {
                SigningKey::from_slice(&bytes)
                    .map_err(|e| eyre::eyre!("Invalid private key: {}", e))
            }) {
            Ok(signing_key) => {
                let chain_id: u64 = std::env::var("CHAIN_ID")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(11155111); // 默认 Sepolia

                match sign_commitments(&signing_key, chain_id, &session_id, &transcript_commitments) {
                    Ok((verifier_address, commitments_hash, signature)) => {
                        info!("[{}] ✅ Commitments signed, verifier={}", session_id, verifier_address);
                        Some(VerifierSignature {
                            chain_id,
                            session_id: session_id.clone(),
                            commitments_hash,
                            signature,
                            verifier_address,
                        })
                    }
                    Err(e) => {
                        error!("[{}] ❌ Signing failed: {}", session_id, e);
                        None
                    }
                }
            }
            Err(e) => {
                error!("Failed to load signing key: {}", e);
                None
            }
        }
    }
    Err(_) => {
        warn!("VERIFIER_PRIVATE_KEY not set, skipping signature");
        None
    }
};
```

### 1.4 最终响应格式

```jsonc
{
  "type": "session_completed",
  "results": [...],
  "transcriptCommitments": [
    { "kind": "Hash", "direction": "RECV", "hashAlg": "Keccak256", "hashHex": "abc...", ... },
    { "kind": "Hash", "direction": "RECV", "hashAlg": "Keccak256", "hashHex": "def...", ... }
  ],
  "verifierSignature": {
    "chainId": 11155111,
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "commitmentsHash": "1a2b3c...",   // keccak256(hashHex[0]||hashHex[1]||...)
    "signature": "r32bytes_s32bytes_v1byte_hex",  // 65 bytes
    "verifierAddress": "0xYourVerifierAddress"
  }
}
```

---

## Part 2 — 签名验证测试（TypeScript）

测试文件位置：`packages/extension/src/offscreen/verifierSignature.test.ts`

### 2.1 依赖

```bash
# 已有 viem 或 ethers.js 则直接用，否则：
npm install viem --save-dev   # 推荐，轻量
```

### 2.2 测试逻辑

```typescript
import { describe, it, expect } from 'vitest';
import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  recoverAddress,
  toBytes,
  concatBytes,
  toHex,
} from 'viem';

// ─── 工具函数：与 Rust 端完全对称 ─────────────────────────────────────

function computeCommitmentsHash(hashHexArray: string[]): `0x${string}` {
  // keccak256(hashHex[0] || hashHex[1] || ...)
  const parts = hashHexArray.map((h) =>
    toBytes(h.startsWith('0x') ? (h as `0x${string}`) : `0x${h}`),
  );
  const concatenated = concatBytes(parts);
  return keccak256(concatenated);
}

function computeMessageHash(
  chainId: bigint,
  sessionId: string,
  commitmentsHash: `0x${string}`,
): `0x${string}` {
  // message_hash = keccak256(abi.encode(uint256, bytes32, bytes32))
  const sessionIdHash = keccak256(toHex(new TextEncoder().encode(sessionId)));
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('uint256, bytes32, bytes32'),
      [chainId, sessionIdHash, commitmentsHash],
    ),
  );
}

function computeEthSignedHash(messageHash: `0x${string}`): `0x${string}` {
  // eth_signed_hash = keccak256("\x19Ethereum Signed Message:\n32" || messageHash)
  const prefix = new TextEncoder().encode('\x19Ethereum Signed Message:\n32');
  const msgBytes = toBytes(messageHash);
  return keccak256(concatBytes([prefix, msgBytes]));
}

// ─── 测试套件 ─────────────────────────────────────────────────────────

describe('VerifierSignature', () => {
  // 把从 Verifier 返回的 session_completed 数据粘贴到这里
  const FIXTURE = {
    transcriptCommitments: [
      { hashHex: 'abc123...' },
      { hashHex: 'def456...' },
      // ...实际数据
    ],
    verifierSignature: {
      chainId: 11155111,
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      commitmentsHash: '1a2b3c...',
      signature: '...65bytes hex...',
      verifierAddress: '0x...',
    },
  };

  it('commitmentsHash 与 hashHex 数组匹配', () => {
    const hashHexArray = FIXTURE.transcriptCommitments
      .filter((c) => c.hashHex)
      .map((c) => c.hashHex!);

    const computed = computeCommitmentsHash(hashHexArray);
    const expected = FIXTURE.verifierSignature.commitmentsHash.startsWith('0x')
      ? FIXTURE.verifierSignature.commitmentsHash
      : `0x${FIXTURE.verifierSignature.commitmentsHash}`;

    expect(computed.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('签名可以还原出 verifierAddress', async () => {
    const { chainId, sessionId, commitmentsHash, signature, verifierAddress } =
      FIXTURE.verifierSignature;

    const hashHexArray = FIXTURE.transcriptCommitments
      .filter((c) => c.hashHex)
      .map((c) => c.hashHex!);

    // Step 1: 重算 commitmentsHash
    const computedCommitmentsHash = computeCommitmentsHash(hashHexArray);

    // Step 2: 重算 message_hash
    const messageHash = computeMessageHash(
      BigInt(chainId),
      sessionId,
      computedCommitmentsHash,
    );

    // Step 3: 重算 eth_signed_hash
    const ethSignedHash = computeEthSignedHash(messageHash);

    // Step 4: ecrecover — 从签名 + 哈希还原签名地址
    const sigHex = signature.startsWith('0x')
      ? (signature as `0x${string}`)
      : (`0x${signature}` as `0x${string}`);
    const sigBytes = toBytes(sigHex);

    // 拆分 r, s, v（65 bytes = r[32] + s[32] + v[1]）
    const r = toHex(sigBytes.slice(0, 32)) as `0x${string}`;
    const s = toHex(sigBytes.slice(32, 64)) as `0x${string}`;
    const v = BigInt(sigBytes[64]);

    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: { r, s, v },
    });

    expect(recovered.toLowerCase()).toBe(verifierAddress.toLowerCase());
  });

  it('使用 verifier 返回的 commitmentsHash（不重算）也能验签', async () => {
    const { chainId, sessionId, commitmentsHash, signature, verifierAddress } =
      FIXTURE.verifierSignature;

    const ch = commitmentsHash.startsWith('0x')
      ? (commitmentsHash as `0x${string}`)
      : (`0x${commitmentsHash}` as `0x${string}`);

    const messageHash = computeMessageHash(BigInt(chainId), sessionId, ch);
    const ethSignedHash = computeEthSignedHash(messageHash);

    const sigHex = signature.startsWith('0x')
      ? (signature as `0x${string}`)
      : (`0x${signature}` as `0x${string}`);
    const sigBytes = toBytes(sigHex);
    const r = toHex(sigBytes.slice(0, 32)) as `0x${string}`;
    const s = toHex(sigBytes.slice(32, 64)) as `0x${string}`;
    const v = BigInt(sigBytes[64]);

    const recovered = await recoverAddress({
      hash: ethSignedHash,
      signature: { r, s, v },
    });

    expect(recovered.toLowerCase()).toBe(verifierAddress.toLowerCase());
  });
});
```

运行测试：

```bash
cd packages/extension
npx vitest run src/offscreen/verifierSignature.test.ts
```

---

## Part 3 — Solidity 合约验证（参考，不需要立即实现）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract TLSNVerifier {
    address public immutable VERIFIER;

    constructor(address verifier) {
        VERIFIER = verifier;
    }

    function verify(
        uint256 chainId,
        string calldata sessionId,
        bytes32[] calldata hashHexValues,  // 每个 commitment 的 hashHex，已转为 bytes32
        bytes calldata sig
    ) external view returns (bool) {
        // 1. commitmentsHash
        bytes32 commitmentsHash = keccak256(abi.encodePacked(hashHexValues));

        // 2. messageHash
        bytes32 sessionIdHash = keccak256(bytes(sessionId));
        bytes32 messageHash = keccak256(abi.encode(chainId, sessionIdHash, commitmentsHash));

        // 3. ethSignedHash（等价于 MessageHashUtils.toEthSignedMessageHash）
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        // 4. ecrecover
        address signer = ECDSA.recover(ethHash, sig);
        return signer == VERIFIER;
    }
}
```

> **注意：** Rust 端 `commitmentsHash` 用的是 `keccak256(concat(...))` = `abi.encodePacked(bytes32[])` 的语义，与 Solidity `keccak256(abi.encodePacked(hashHexValues))` 完全对应（因为每个 hashHex 都是固定 32 bytes）。

---

## 数据流总览

```
Prover WASM
  └─ 生成 transcriptCommitments[i].hashHex (keccak256 承诺)
       ↓
Verifier (Rust)
  ├─ 验证 MPC-TLS transcript 真实性
  ├─ 计算 commitmentsHash = keccak256(hashHex[0]||hashHex[1]||...)
  ├─ 计算 messageHash     = keccak256(abi.encode(chainId, keccak256(sessionId), commitmentsHash))
  ├─ 计算 ethSignedHash   = keccak256("\x19...\n32" || messageHash)
  ├─ secp256k1 签名 → (r, s, v)
  └─ 返回 verifierSignature { chainId, sessionId, commitmentsHash, signature, verifierAddress }
       ↓
Extension / 链上合约
  ├─ 重算 commitmentsHash，与 verifier 返回值对比
  ├─ ecrecover(ethSignedHash, sig) → 还原地址
  └─ 对比地址与已知的 VERIFIER 地址
```

---

## 关键设计决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| hashHex 的拼接方式 | 直接字节拼接（无分隔符） | 每个 keccak256 输出固定 32 bytes，无歧义 |
| chainId 编码 | uint256 big-endian 32 bytes | 与 `abi.encode(uint256)` 完全一致 |
| sessionId 编码 | `keccak256(UTF-8 bytes)` → bytes32 | 避免变长字符串歧义，Solidity 可直接 `keccak256(bytes(sessionId))` |
| Ethereum 签名前缀 | EIP-191 `\x19Ethereum Signed Message:\n32` | `ecrecover` 原生支持，无需额外库 |
| v 值 | recovery_id + 27 | Ethereum 历史约定（27/28，非 0/1） |
| 私钥存储 | 环境变量 `VERIFIER_PRIVATE_KEY` | 最简单可用；生产用 secret manager |
