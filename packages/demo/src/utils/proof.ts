// packages/demo/src/utils/proof.ts
//
// Single-file proof subsystem. Collapsed verbatim during Phase 2 from:
//   - proofTransformer.ts     → ─── Transformer ───
//   - proofsApi.ts            → ─── API ───
//   - verifierAuth.ts         → ─── Auth ───
//   - paymentProofArtifact.ts → ─── Artifact ───
// Plus a new unified ─── BackfillTx ─── section that replaces the three
// near-duplicate backfill helpers currently inlined in TradingHall / UserPanel
// (and previously in ContractSubmit, removed in Phase 1b).
//
// Phase 2 is behavior-preserving:
//   - Existing inject* sentinels and helpers remain individually exported so
//     wise/alipay actions (Phase 7d) keep compiling.
//   - injectPluginContext() is added as the consolidated entry point used by
//     the upcoming PlatformAdapter in Phase 3.
//   - Panel call sites still use their inline backfill helpers; the new
//     backfillProofTx is wired in during Phase 6.

import {
  encodePacked,
  getAddress,
  hashMessage,
  keccak256,
  recoverAddress,
  toBytes,
  type Hex,
  type WalletClient,
} from 'viem';
import { config } from '../config';

// ─── Transformer (= proofTransformer.ts) ────────────────────────────────────

// ── Types matching the contract's TLSNProof struct ──

export interface ContractTLSNProof {
  chainId: bigint;
  sessionId: string;
  commitmentsHash: Hex;
  /**
   * keccak256(abi.encodePacked(escrow, chainId, merchant, buyer, productId, orderId, assetType, amount, rate, deadline))
   * Must match the binding hash signed by the TLSN verifier server.
   */
  orderBindingHash: Hex;
  policyVersionHash: Hex;
  verifierSignature: Hex;
  revealedItems: Array<{
    handlerType: string;
    part: string;
    value: string;
    commitment_index: bigint;
    start_item: bigint;
    end_item: bigint;
    start_value: bigint;
    end_value: bigint;
  }>;
  commitmentOpenings: Array<{ blinderHex: Hex }>;
  commitments: Array<{
    direction: string;
    hashAlg: string;
    hashValue: Hex;
  }>;
  serverName: string;
}

// ── Extension ProveResponse types (subset needed for transformation) ──

export interface ExtensionProveResponse {
  results: Array<{
    type: string;
    part: string;
    value: string;
    commitmentIndex: number;
    start: number;
    end: number;
    startValue: number;
    endValue: number;
  }>;
  transcriptCommitments: Array<{
    kind: string;
    direction?: string;
    hashAlg?: string;
    hashHex?: string;
  }>;
  transcriptCommitOpenings?: Array<{
    blinderHex: string;
  }>;
  verifierSignature?: {
    chainId: number;
    sessionId: string;
    commitmentsHash: string;
    /** Order-binding hash echoed from verifier (0x-prefixed). Present when plugin passed it in sessionData. */
    orderBindingHash?: string;
    /** Policy version string used by verifier, e.g. "v1.0.0". */
    policyVersion?: string;
    /** keccak256(policyVersion UTF-8), 0x-prefixed bytes32. */
    policyVersionHash?: string;
    signature: string;
    verifierAddress: string;
  };
  serverName?: string;
}

// ── Order binding context ──

export interface OrderBindingContext {
  escrowAddress: Hex;
  chainId: number;
  merchant: Hex;
  buyer: Hex;
  productId: bigint;
  orderId: bigint;
  /** 0 = CRYPTO, 1 = FIAT */
  assetType: number;
  amount: bigint;
  rate: bigint;
  /** Rate version snapshot taken at placeOrder time (from getOrder().rateVersion) */
  rateVersion: bigint;
  /** On-chain order deadline (o.deadline) */
  deadline: bigint;
  /** keccak256(normalize(displayName)) — merchant payer */
  merchantNameHash: Hex;
  /** keccak256(normalize(email/handle)) — merchant payer */
  merchantIdHash: Hex;
  /** keccak256(normalize(displayName)) — CRYPTO: merchant; FIAT: buyer */
  payeeNameHash: Hex;
  /** keccak256(normalize(email/handle)) — CRYPTO: merchant; FIAT: buyer */
  payeeIdHash: Hex;
  /** Buyer address (lowercase 0x-hex) — auditor scoping: owner = initiator */
  ownerAddress?: Hex;
  /** Merchant address (lowercase 0x-hex) — auditor scoping: counterparty */
  counterpartyAddress?: Hex;
  /** Platform tenant id: 'wise' | 'alipay' (plaintext, not hashed) */
  tenantId?: 'wise' | 'alipay';
}

/**
 * Compute the orderBindingHash that the TLSN verifier server signs.
 * Must match _computeOrderBindingHash() in C2CEscrow.sol exactly.
 */
export function computeOrderBindingHash(ctx: OrderBindingContext): Hex {
  return keccak256(
    encodePacked(
      [
        'address', 'uint64',
        'address', 'address',
        'uint256', 'uint256',
        'uint8', 'uint256', 'uint256',
        'uint32',
        'uint256',
        'bytes32', 'bytes32',
        'bytes32', 'bytes32',
      ],
      [
        ctx.escrowAddress,
        BigInt(ctx.chainId),
        ctx.merchant,
        ctx.buyer,
        ctx.productId,
        ctx.orderId,
        ctx.assetType,
        ctx.amount,
        ctx.rate,
        Number(ctx.rateVersion), // uint32 — safe because version is small
        ctx.deadline,
        ctx.merchantNameHash,
        ctx.merchantIdHash,
        ctx.payeeNameHash,
        ctx.payeeIdHash,
      ],
    ),
  );
}

// ── Sentinels (kept exported during Phase 2~7c; wise/alipay actions reference them) ──

export const ZERO_HASH_32: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const ORDER_BINDING_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export const MERCHANT_NAME_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000002';

export const MERCHANT_ID_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000003';

export const PAYEE_NAME_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000004';

export const PAYEE_ID_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000005';

export const TRANSFER_ORDER_BINDING_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000006';

export const OWNER_ADDRESS_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000007';

export const COUNTERPARTY_ADDRESS_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000008';

export const TENANT_ID_SENTINEL = '__TLSN_TENANT_ID_SENTINEL__';

// ── Individual sentinel injectors (still exported for legacy callers) ──

export function injectOrderBindingHash(pluginCode: string, hash: Hex): string {
  if (!pluginCode.includes(ORDER_BINDING_HASH_SENTINEL)) {
    console.warn('[injectOrderBindingHash] sentinel not found in plugin code — orderBindingHash not injected');
    return pluginCode;
  }
  return pluginCode.replace(ORDER_BINDING_HASH_SENTINEL, hash);
}

export function injectMerchantNameHash(pluginCode: string, hash: Hex): string {
  if (!pluginCode.includes(MERCHANT_NAME_HASH_SENTINEL)) {
    console.warn('[injectMerchantNameHash] sentinel not found in plugin code');
    return pluginCode;
  }
  return pluginCode.replace(MERCHANT_NAME_HASH_SENTINEL, hash);
}

export function injectMerchantIdHash(pluginCode: string, hash: Hex): string {
  if (!pluginCode.includes(MERCHANT_ID_HASH_SENTINEL)) {
    console.warn('[injectMerchantIdHash] sentinel not found in plugin code');
    return pluginCode;
  }
  return pluginCode.replace(MERCHANT_ID_HASH_SENTINEL, hash);
}

export function injectPayeeNameHash(pluginCode: string, hash: Hex): string {
  if (!pluginCode.includes(PAYEE_NAME_HASH_SENTINEL)) {
    console.warn('[injectPayeeNameHash] sentinel not found in plugin code');
    return pluginCode;
  }
  return pluginCode.replace(PAYEE_NAME_HASH_SENTINEL, hash);
}

export function injectPayeeIdHash(pluginCode: string, hash: Hex): string {
  if (!pluginCode.includes(PAYEE_ID_HASH_SENTINEL)) {
    console.warn('[injectPayeeIdHash] sentinel not found in plugin code');
    return pluginCode;
  }
  return pluginCode.replace(PAYEE_ID_HASH_SENTINEL, hash);
}

export function injectTransferOrderBindingHash(pluginCode: string, hash: Hex): string {
  if (!pluginCode.includes(TRANSFER_ORDER_BINDING_HASH_SENTINEL)) {
    console.warn('[injectTransferOrderBindingHash] sentinel not found in plugin code');
    return pluginCode;
  }
  return pluginCode.replace(TRANSFER_ORDER_BINDING_HASH_SENTINEL, hash);
}

export function injectOwnerAddress(pluginCode: string, owner: Hex): string {
  return pluginCode.includes(OWNER_ADDRESS_SENTINEL)
    ? pluginCode.replace(OWNER_ADDRESS_SENTINEL, owner.toLowerCase())
    : pluginCode;
}

export function injectCounterpartyAddress(pluginCode: string, addr: Hex): string {
  return pluginCode.includes(COUNTERPARTY_ADDRESS_SENTINEL)
    ? pluginCode.replace(COUNTERPARTY_ADDRESS_SENTINEL, addr.toLowerCase())
    : pluginCode;
}

export function injectTenantId(pluginCode: string, tenantId?: string): string {
  if (tenantId) {
    return pluginCode.replace(TENANT_ID_SENTINEL, tenantId);
  }
  // D-2: 没值时把整行从 sessionData 删掉,避免哨兵字面值入库
  return pluginCode.replace(
    /^\s*__tlsn_tenant_id:\s*['"]__TLSN_TENANT_ID_SENTINEL__['"],?\s*\n/m,
    '',
  );
}

/**
 * Consolidated sentinel injector used by the upcoming PlatformAdapter
 * (Phase 3). Replaces 8 sentinels in one pass:
 *   1. ORDER_BINDING_HASH        (computed from ctx)
 *   2. MERCHANT_NAME_HASH        (ctx.merchantNameHash)
 *   3. MERCHANT_ID_HASH          (ctx.merchantIdHash)
 *   4. PAYEE_NAME_HASH           (ctx.payeeNameHash)
 *   5. PAYEE_ID_HASH             (ctx.payeeIdHash)
 *   6. OWNER_ADDRESS             (ctx.ownerAddress, optional)
 *   7. COUNTERPARTY_ADDRESS      (ctx.counterpartyAddress, optional)
 *   8. TENANT_ID                 (ctx.tenantId, optional — D-2 row-delete fallback)
 * Adapters that also need TRANSFER_ORDER_BINDING_HASH (Wise) layer on top via
 * injectTransferOrderBindingHash().
 */
export function injectPluginContext(code: string, ctx: OrderBindingContext): string {
  let out = code;
  out = injectOrderBindingHash(out, computeOrderBindingHash(ctx));
  out = injectMerchantNameHash(out, ctx.merchantNameHash);
  out = injectMerchantIdHash(out, ctx.merchantIdHash);
  out = injectPayeeNameHash(out, ctx.payeeNameHash);
  out = injectPayeeIdHash(out, ctx.payeeIdHash);
  if (ctx.ownerAddress) out = injectOwnerAddress(out, ctx.ownerAddress);
  if (ctx.counterpartyAddress) out = injectCounterpartyAddress(out, ctx.counterpartyAddress);
  out = injectTenantId(out, ctx.tenantId);
  return out;
}

// ── Helpers (verbatim) ──

function ensureHexPrefix(hex: string): Hex {
  return (hex.startsWith('0x') ? hex : `0x${hex}`) as Hex;
}

function isBytes32Hex(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function resolvePolicyVersionHash(sig: NonNullable<ExtensionProveResponse['verifierSignature']>): {
  policyVersionHash: Hex;
  policyVersion?: string;
} {
  const policyVersion = sig.policyVersion?.trim();
  const rawPolicyHash = sig.policyVersionHash?.trim();

  let providedHash: Hex | undefined;
  if (rawPolicyHash) {
    const normalized = ensureHexPrefix(rawPolicyHash);
    if (!isBytes32Hex(normalized)) {
      throw new Error(
        `verifierSignature.policyVersionHash must be a valid bytes32 hex string, got: ${rawPolicyHash}`,
      );
    }
    providedHash = normalized.toLowerCase() as Hex;
  }

  if (providedHash && policyVersion) {
    const computed = keccak256(toBytes(policyVersion)).toLowerCase() as Hex;
    if (computed !== providedHash) {
      throw new Error(
        [
          'Policy version signature mismatch.',
          `policyVersion=${policyVersion}`,
          `computedHash=${computed}`,
          `providedHash=${providedHash}`,
        ].join(' '),
      );
    }
    return { policyVersionHash: providedHash, policyVersion };
  }

  if (providedHash) {
    return { policyVersionHash: providedHash, policyVersion };
  }

  if (policyVersion) {
    return {
      policyVersionHash: keccak256(toBytes(policyVersion)).toLowerCase() as Hex,
      policyVersion,
    };
  }

  throw new Error(
    'Missing verifier policy metadata: neither verifierSignature.policyVersionHash nor verifierSignature.policyVersion is present.',
  );
}

function mapDirection(dir: string): string {
  if (dir === 'RECV') return 'Recv';
  if (dir === 'SENT') return 'Sent';
  return dir;
}

export function buildContractProof(response: ExtensionProveResponse): ContractTLSNProof {
  if (!response.verifierSignature) {
    throw new Error(
      'verifierSignature is missing. ' +
        'Ensure transcriptCommitHashAlg is set in proverOptions, ' +
        'and the Verifier server has VERIFIER_PRIVATE_KEY configured.',
    );
  }
  if (!response.transcriptCommitOpenings?.length) {
    throw new Error(
      'transcriptCommitOpenings is empty. ' +
        'Ensure transcriptCommitDebug.exposeOpenings is true in proverOptions.',
    );
  }
  if (!response.verifierSignature.orderBindingHash) {
    throw new Error(
      'verifierSignature.orderBindingHash is missing. ' +
        'Ensure the plugin was executed with injectOrderBindingHash() before calling execCode().',
    );
  }

  const sig = response.verifierSignature;
  const { policyVersionHash } = resolvePolicyVersionHash(sig);

  const revealedItems = response.results.map((r) => ({
    handlerType: r.type,
    part: r.part,
    value: r.value,
    commitment_index: BigInt(r.commitmentIndex ?? 0),
    start_item: BigInt(r.start ?? 0),
    end_item: BigInt(r.end ?? 0),
    start_value: BigInt(r.startValue ?? 0),
    end_value: BigInt(r.endValue ?? r.value?.length ?? 0),
  }));

  const commitmentOpenings = response.transcriptCommitOpenings.map((o) => ({
    blinderHex: ensureHexPrefix(o.blinderHex),
  }));

  const commitments = response.transcriptCommitments.map((c) => ({
    direction: mapDirection(c.direction ?? 'RECV'),
    hashAlg: c.hashAlg ?? 'Keccak256',
    hashValue: ensureHexPrefix(c.hashHex ?? ''),
  }));

  return {
    chainId: BigInt(sig.chainId ?? 0),
    sessionId: sig.sessionId,
    commitmentsHash: ensureHexPrefix(sig.commitmentsHash),
    orderBindingHash: ensureHexPrefix(sig.orderBindingHash ?? ''),
    policyVersionHash,
    verifierSignature: ensureHexPrefix(sig.signature),
    revealedItems,
    commitmentOpenings,
    commitments,
    serverName: response.serverName ?? '',
  };
}

export interface ProofDebugSnapshot {
  sessionId: string;
  chainId: string;
  orderBindingHash: Hex;
  policyVersion?: string;
  policyVersionHash: Hex;
  recoveredSigner?: Hex;
  recoveryError?: string;
}

export async function recoverVerifierSignerFromProof(proof: ContractTLSNProof): Promise<Hex> {
  const sessionIdHash = keccak256(toBytes(proof.sessionId));
  const messageHash = keccak256(
    encodePacked(
      ['uint64', 'bytes32', 'bytes32', 'bytes32', 'bytes32'],
      [
        proof.chainId,
        sessionIdHash,
        proof.commitmentsHash,
        proof.orderBindingHash,
        proof.policyVersionHash,
      ],
    ),
  );
  const ethSignedMessageHash = hashMessage({ raw: messageHash });
  const recovered = await recoverAddress({
    hash: ethSignedMessageHash,
    signature: proof.verifierSignature,
  });
  return recovered.toLowerCase() as Hex;
}

export async function buildProofDebugSnapshot(response: ExtensionProveResponse): Promise<ProofDebugSnapshot> {
  const sig = response.verifierSignature;
  if (!sig) {
    throw new Error('Cannot build proof diagnostics: verifierSignature is missing.');
  }
  const contractProof = buildContractProof(response);
  const snapshot: ProofDebugSnapshot = {
    sessionId: contractProof.sessionId,
    chainId: contractProof.chainId.toString(),
    orderBindingHash: contractProof.orderBindingHash,
    policyVersion: sig.policyVersion,
    policyVersionHash: contractProof.policyVersionHash,
  };
  try {
    snapshot.recoveredSigner = await recoverVerifierSignerFromProof(contractProof);
  } catch (err) {
    snapshot.recoveryError = (err as any)?.message ?? String(err);
  }
  return snapshot;
}

// ─── Auth (= verifierAuth.ts) ───────────────────────────────────────────────
//
// SIWE login (user wallets) + Admin key login + JWT cache + authedFetch.
// Single source of truth for "who is the demo frontend right now":
//   - admin    → Bearer = PROOF_API_KEY (sessionStorage 'tlsn:adminKey')
//   - user     → Bearer = SIWE JWT      (sessionStorage 'tlsn:jwt:<addr>')
//   - anon     → no Authorization header

// ── SIWE message builder ──

interface SiweFields {
  domain: string;
  address: Hex;
  uri: string;
  chainId: number;
  nonce: string;
}

function buildSiweMessage(p: SiweFields): string {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    p.address,
    '',
    'Sign in to TLSN demo audit.',
    '',
    `URI: ${p.uri}`,
    'Version: 1',
    `Chain ID: ${p.chainId}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
}

// ── JWT cache (sessionStorage, keyed by lowercase address) ──

interface CachedToken {
  token: string;
  expiresAt: number; // unix seconds
}

function jwtKey(addr: string) {
  return `tlsn:jwt:${addr.toLowerCase()}`;
}

function getCachedJwt(addr: string): CachedToken | null {
  try {
    const raw = sessionStorage.getItem(jwtKey(addr));
    if (!raw) return null;
    const t = JSON.parse(raw) as CachedToken;
    // 60s pre-expiry buffer → force re-login
    if (t.expiresAt - Math.floor(Date.now() / 1000) < 60) return null;
    return t;
  } catch {
    return null;
  }
}

// ── User SIWE login ──

export async function loginAsUser(walletClient: WalletClient): Promise<string> {
  // SIWE spec + the `siwe` Rust crate require the address line to be in
  // EIP-55 checksum format (mixed case). viem's getAddress() does that.
  // Storage / lookup keys are always lowercase — see jwtKey().
  const checksumAddr = getAddress(walletClient.account!.address as string) as Hex;
  const cached = getCachedJwt(checksumAddr);
  if (cached) return cached.token;

  const nonceResp = await fetch(`${config.verifierUrl}/auth/nonce`);
  if (!nonceResp.ok) throw new Error(`SIWE nonce fetch failed: ${nonceResp.status}`);
  const { nonce } = (await nonceResp.json()) as { nonce: string };

  const message = buildSiweMessage({
    domain: window.location.host,
    address: checksumAddr,
    uri: window.location.origin,
    chainId: 31337,
    nonce,
  });
  const signature = await walletClient.signMessage({
    account: walletClient.account!,
    message,
  });

  const resp = await fetch(`${config.verifierUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  if (!resp.ok) {
    throw new Error(`SIWE login failed (${resp.status}): ${await resp.text()}`);
  }
  const { token, address: addr, expiresAt } = (await resp.json()) as {
    token: string;
    address: string;
    expiresAt: number;
  };
  sessionStorage.setItem(jwtKey(addr), JSON.stringify({ token, expiresAt }));
  return token;
}

// ── Admin key login (PROOF_API_KEY) ──

const ADMIN_KEY = 'tlsn:adminKey';

/**
 * Strip the optional `:scope` suffix from a PROOF_API_KEYS env-style value.
 * The verifier expects ONLY the key portion as the Bearer token; the `:scope`
 * (e.g. `:*`, `:tenant=wise`) lives in the env and is parsed server-side.
 */
function normalizeAdminKey(raw: string): string {
  const trimmed = raw.trim();
  const i = trimmed.indexOf(':');
  return i >= 0 ? trimmed.slice(0, i) : trimmed;
}

export function loginAsAdmin(key: string) {
  sessionStorage.setItem(ADMIN_KEY, normalizeAdminKey(key));
}

export function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_KEY);
}

// ── Identity resolution ──

export type Identity =
  | { kind: 'admin'; key: string }
  | { kind: 'user'; address: Hex; token: string }
  | { kind: 'anonymous' };

export function getCurrentIdentity(activeUserAddr?: Hex): Identity {
  if (activeUserAddr) {
    const c = getCachedJwt(activeUserAddr);
    if (c) {
      return {
        kind: 'user',
        address: activeUserAddr.toLowerCase() as Hex,
        token: c.token,
      };
    }
  }
  const k = sessionStorage.getItem(ADMIN_KEY);
  if (k) return { kind: 'admin', key: k };
  return { kind: 'anonymous' };
}

function getBearer(activeUserAddr?: Hex): string | null {
  const id = getCurrentIdentity(activeUserAddr);
  if (id.kind === 'user') return id.token;
  if (id.kind === 'admin') return id.key;
  return null;
}

// ── authedFetch (caller stays in charge of Content-Type) ──

export async function authedFetch(
  url: string,
  init: RequestInit = {},
  activeUserAddr?: Hex,
): Promise<Response> {
  const bearer = getBearer(activeUserAddr);
  const headers = new Headers(init.headers);
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  return fetch(url, { ...init, headers });
}

// ─── API (= proofsApi.ts) ───────────────────────────────────────────────────
//
// Typed API client for verifier proof endpoints + hex0x normalization helper.
//
// Naming convention (per PROOF_AUDIT_PLAN §3.2):
//   - Top-level fields: camelCase
//   - hashHex / commitmentsHash / verifierSignature → RAW hex (no 0x)
//   - orderBindingHash / verifierAddress / txHash    → 0x-prefixed
//   - hex0x() lifts raw hex to 0x-prefixed Hex for viem consumption.

// ── Normalization ──

export const hex0x = (h: string | null | undefined): Hex | null => {
  if (!h) return null;
  return (h.startsWith('0x') ? h : `0x${h}`) as Hex;
};

// ── Response types ──

export type ProofStatus = 'provisional' | 'committed';
export type RetentionClass = 'compliance' | 'ephemeral';

export interface TravelRuleField {
  value: string;
  commitmentIndex: number;
}

export interface AccountCheckResult {
  field: string;
  matched: boolean;
  [k: string]: unknown;
}

export interface ListItem {
  attestationId: string;
  status: ProofStatus;
  retentionClass: RetentionClass;
  ownerAddress: string | null;
  tenantId: string | null;
  serverName: string;
  txHash: string | null;
  timestamp: string;
  committedAt: string | null;
  travelRuleFields: Record<string, TravelRuleField>;
}

export interface ListPage {
  items: ListItem[];
  nextCursor: string | null;
}

export interface TranscriptCommitment {
  hashHex: string;
  hashAlg: 'Keccak256' | string;
  direction: 'SENT' | 'RECV';
  kind: 'Hash' | string;
  ranges: Array<{ start: number; end: number }>;
}

export interface ProofExportResponse {
  formatVersion: 'ProofExportV1';
  attestationId: string;
  txHash: string | null;
  policyVersion: string;
  timestamp: string;
  serverName: string;
  verifierVersion: string;
  orderBindingHash: string | null;
  commitmentsHash: string;
  verifierSignature: string;
  verifierAddress: string;
  chainId: number | null;
  travelRuleFields: Record<string, TravelRuleField>;
  accountChecks: AccountCheckResult[];
  transcriptCommitments: TranscriptCommitment[];
  redactedTranscript?: { sent: string; recv: string };
  handlerResults?: unknown;
  sessionData?: Record<string, string>;
}

// ── List query params ──

export interface ListFilters {
  owner?: string;
  tenant?: string;
  status?: ProofStatus;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

function buildQuery(f: ListFilters): string {
  const sp = new URLSearchParams();
  if (f.owner)  sp.set('owner', f.owner);
  if (f.tenant) sp.set('tenant', f.tenant);
  if (f.status) sp.set('status', f.status);
  if (f.from)   sp.set('from', f.from);
  if (f.to)     sp.set('to', f.to);
  if (f.limit !== undefined) sp.set('limit', String(f.limit));
  if (f.cursor) sp.set('cursor', f.cursor);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── API calls ──

export async function listProofs(
  filters: ListFilters = {},
  activeUserAddr?: Hex,
): Promise<ListPage> {
  const url = `${config.verifierUrl}/proofs${buildQuery(filters)}`;
  const resp = await authedFetch(url, { method: 'GET' }, activeUserAddr);
  if (!resp.ok) throw new Error(`listProofs ${resp.status}: ${await resp.text()}`);
  return (await resp.json()) as ListPage;
}

export async function getProof(
  sessionId: string,
  activeUserAddr?: Hex,
): Promise<ProofExportResponse> {
  const url = `${config.verifierUrl}/proof/${encodeURIComponent(sessionId)}`;
  const resp = await authedFetch(url, { method: 'GET' }, activeUserAddr);
  if (!resp.ok) throw new Error(`getProof ${resp.status}: ${await resp.text()}`);
  return (await resp.json()) as ProofExportResponse;
}

export async function getProofByTxHash(
  txHash: string,
  activeUserAddr?: Hex,
): Promise<ProofExportResponse> {
  const url = `${config.verifierUrl}/proof?txHash=${encodeURIComponent(txHash)}`;
  const resp = await authedFetch(url, { method: 'GET' }, activeUserAddr);
  if (!resp.ok) throw new Error(`getProofByTxHash ${resp.status}: ${await resp.text()}`);
  return (await resp.json()) as ProofExportResponse;
}

export interface PatchTxResult {
  ok: boolean;
  status: number;
  alreadyCommitted: boolean; // 409 = already-backfilled-skip
}

export async function patchProofTx(
  sessionId: string,
  txHash: Hex,
  chainId: number,
  activeUserAddr?: Hex,
): Promise<PatchTxResult> {
  const url = `${config.verifierUrl}/proof/${encodeURIComponent(sessionId)}/tx`;
  const resp = await authedFetch(
    url,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, chainId }),
    },
    activeUserAddr,
  );
  return {
    ok: resp.ok || resp.status === 409,
    status: resp.status,
    alreadyCommitted: resp.status === 409,
  };
}

// ─── Artifact (= paymentProofArtifact.ts) ───────────────────────────────────

export const PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION = 'PaymentProofArtifactV1' as const;

const PAYMENT_PROOF_STORAGE_PREFIX = 'tlsn:c2c:payment-proof:v1';

export interface PaymentProofOrderSnapshotV1 {
  buyer: Hex;
  merchant: Hex;
  productId: string;
  orderId: string;
  assetType: 0 | 1;
  amount: string;
  rate: string;
  rateVersion: number;
  deadline: string;
}

export interface PaymentProofPlatformSnapshotV1 {
  platformId: Hex;
  platformLabel: string;
}

export type PaymentProofPayloadV1 =
  | {
      type: 'wise';
      contactsProof: ExtensionProveResponse;
      transferProof: ExtensionProveResponse;
    }
  | {
      type: 'alipay';
      proof: ExtensionProveResponse;
    };

export interface PaymentProofArtifactV1 {
  schemaVersion: typeof PAYMENT_PROOF_ARTIFACT_SCHEMA_VERSION;
  createdAt: string;
  order: PaymentProofOrderSnapshotV1;
  platform: PaymentProofPlatformSnapshotV1;
  orderBindingHash: Hex;
  sessionIds: string[];
  txHash: Hex;
  proofs: PaymentProofPayloadV1;
}

export interface PaymentProofArtifactKeyInput {
  buyer: Hex;
  merchant: Hex;
  assetType: 0 | 1;
  productId: bigint;
  orderId: bigint;
}

export function buildPaymentProofArtifactStorageKey(input: PaymentProofArtifactKeyInput): string {
  return [
    PAYMENT_PROOF_STORAGE_PREFIX,
    input.buyer.toLowerCase(),
    input.merchant.toLowerCase(),
    String(input.assetType),
    input.productId.toString(),
    input.orderId.toString(),
  ].join(':');
}

// ─── BackfillTx (NEW, unifies 3 panel impls) ────────────────────────────────
//
// Best-effort PATCH /proof/:id/tx for every session id referenced by `proofs`.
// 409 → counted as alreadyCommitted, NOT failed (verifier already linked tx).
// Callers (Phase 6 panel refactors) decide how to surface patched / already /
// failed counts in their log feed.

export interface BackfillResult {
  /** count of sessions newly bound to txHash (HTTP 200) */
  patched: number;
  /** count of sessions verifier already had a txHash for (HTTP 409) */
  alreadyCommitted: number;
  /** count of sessions where PATCH failed (anything else) */
  failed: number;
  /** "<sid> → <reason>" lines for caller-side logging */
  failures: string[];
}

/**
 * Direct sessionIds variant — used by callers (UserPanel) that have already
 * extracted session ids (e.g. from a stored PaymentProofArtifact) and don't
 * need the proofs[] array anymore. Behavior identical to backfillProofTx.
 */
export async function backfillSessionIds(
  sessionIds: string[],
  txHash: Hex,
  signerAddr: Hex,
  chainId: number,
): Promise<BackfillResult> {
  if (sessionIds.length === 0) {
    return { patched: 0, alreadyCommitted: 0, failed: 0, failures: [] };
  }

  const results = await Promise.allSettled(
    sessionIds.map((sid) => patchProofTx(sid, txHash, chainId, signerAddr)),
  );

  let patched = 0;
  let alreadyCommitted = 0;
  const failures: string[] = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (r.value.alreadyCommitted) {
        alreadyCommitted += 1;
      } else if (r.value.ok) {
        patched += 1;
      } else {
        failures.push(`${sessionIds[i]} → ${r.value.status}`);
      }
    } else {
      failures.push(
        `${sessionIds[i]} → ${(r.reason as any)?.message ?? r.reason}`,
      );
    }
  });

  return {
    patched,
    alreadyCommitted,
    failed: failures.length,
    failures,
  };
}

export async function backfillProofTx(
  proofs: ExtensionProveResponse[],
  txHash: Hex,
  signerAddr: Hex,
  chainId: number,
): Promise<BackfillResult> {
  const sessionIds = Array.from(
    new Set(
      proofs
        .map((p) => p?.verifierSignature?.sessionId)
        .filter((s): s is string => !!s),
    ),
  );
  return backfillSessionIds(sessionIds, txHash, signerAddr, chainId);
}

