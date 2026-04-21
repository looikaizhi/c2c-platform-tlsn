export interface InterceptedRequest {
  /** Unique request ID from webRequest API */
  id: string;

  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;

  /** Full request URL */
  url: string;

  /** Unix timestamp (milliseconds) when request was intercepted */
  timestamp: number;

  /** Tab ID where the request originated */
  tabId: number;

  /** Request Body */
  requestBody?: {
    error?: string;
    formData?: Record<string, string>;
    raw?: {
      bytes?: any;
      file?: string;
    }[];
  };
}

export interface InterceptedRequestHeader {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  type: string;
  requestHeaders: { name: string; value?: string }[];
  tabId: number;
}

export type ExecutionContext = {
  id: string;
  pluginUrl: string;
  plugin: string;
  requests?: InterceptedRequest[];
  headers?: InterceptedRequestHeader[];
  windowId?: number;
  context: {
    [functionName: string]: {
      effects: any[][];
      selectors: any[][];
    };
  };
  stateStore: { [key: string]: any };
  currentContext: string;
  sandbox: {
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: (force?: boolean) => any;
  callbacks: {
    [callbackName: string]: () => Promise<void>;
  };
};

export type DomOptions = {
  className?: string;
  id?: string;
  style?: { [key: string]: string };
  onclick?: string;
};

export type DomJson =
  | {
      type: 'div' | 'button';
      options: DomOptions;
      children: DomJson[];
    }
  | string;

export type OpenWindowResponse =
  | {
      type: 'WINDOW_OPENED';
      payload: {
        windowId: number;
        uuid: string;
        tabId: number;
      };
    }
  | {
      type: 'WINDOW_ERROR';
      payload: {
        error: string;
        details: string;
      };
    };

export type WindowMessage =
  | {
      type: 'REQUEST_INTERCEPTED';
      request: InterceptedRequest;
      windowId: number;
    }
  | {
      type: 'HEADER_INTERCEPTED';
      header: InterceptedRequestHeader;
      windowId: number;
    }
  | {
      type: 'PLUGIN_UI_CLICK';
      onclick: string;
      windowId: number;
    }
  | {
      type: 'WINDOW_CLOSED';
      windowId: number;
    }
  | {
      type: 'RE_RENDER_PLUGIN_UI';
      windowId: number;
    };

export enum HandlerType {
  SENT = 'SENT',
  RECV = 'RECV',
}

export enum HandlerPart {
  START_LINE = 'START_LINE',
  PROTOCOL = 'PROTOCOL',
  METHOD = 'METHOD',
  REQUEST_TARGET = 'REQUEST_TARGET',
  STATUS_CODE = 'STATUS_CODE',
  HEADERS = 'HEADERS',
  BODY = 'BODY',
  ALL = 'ALL',
}

export enum HandlerAction {
  REVEAL = 'REVEAL',
  PEDERSEN = 'PEDERSEN',
}

export type StartLineHandler = {
  type: HandlerType;
  part:
    | HandlerPart.START_LINE
    | HandlerPart.PROTOCOL
    | HandlerPart.METHOD
    | HandlerPart.REQUEST_TARGET
    | HandlerPart.STATUS_CODE;
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  /** Semantic label for Verifier-side structured field extraction (e.g. "state", "targetAmount") */
  label?: string;
};

export type HeadersHandler = {
  type: HandlerType;
  part: HandlerPart.HEADERS;
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  params?: {
    key: string;
    hideKey?: boolean;
    hideValue?: boolean;
  };
  /** Semantic label for Verifier-side structured field extraction */
  label?: string;
};

export type BodyHandler = {
  type: HandlerType;
  part: HandlerPart.BODY;
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  params?: {
    type: 'json';
    path: string;
    hideKey?: boolean;
    hideValue?: boolean;
  };
  /** Semantic label for Verifier-side structured field extraction (e.g. "state", "targetAmount") */
  label?: string;
};

export type AllHandler = {
  type: HandlerType;
  part: HandlerPart.ALL; // Not used for regex handlers
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  params?: {
    type: 'regex';
    regex: string;
    flags?: string;
  };
  /** Semantic label for Verifier-side structured field extraction */
  label?: string;
};

export type Handler = StartLineHandler | HeadersHandler | BodyHandler | AllHandler;

export type TranscriptCommitHashAlg = 'Sha256' | 'Blake3' | 'Keccak256';
export type TranscriptCommitmentHashAlg = TranscriptCommitHashAlg | 'Unknown';
export type TranscriptCommitmentKind = 'Hash' | 'Unknown';
export type TranscriptCommitmentDirection = 'SENT' | 'RECV';

export interface TranscriptCommitmentRange {
  start: number;
  end: number;
}

export interface TranscriptCommitmentSummary {
  kind: TranscriptCommitmentKind;
  direction?: TranscriptCommitmentDirection;
  hashAlg?: TranscriptCommitmentHashAlg;
  ranges?: TranscriptCommitmentRange[];
  hashHex?: string;
  hashLen?: number;
  revealed?: boolean;
}

export interface VerifierTranscriptSummary {
  sent: number[];
  recv: number[];
  sentAuthed: TranscriptCommitmentRange[];
  recvAuthed: TranscriptCommitmentRange[];
}

export interface TranscriptCommitOpeningSummary {
  kind: 'Hash';
  direction: TranscriptCommitmentDirection;
  hashAlg: TranscriptCommitmentHashAlg;
  ranges: TranscriptCommitmentRange[];
  blinderHex: string;
}

export type CommitmentSelfCheckStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'unsupported_alg';

export interface CommitmentSelfCheckSummary {
  status: CommitmentSelfCheckStatus;
  total: number;
  matched: number;
  mismatched: number;
  message?: string;
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/**
 * Per-phase timing breakdown for one prove() call.
 * All values are integer milliseconds measured via performance.now().
 *
 * Phases:
 *   connectionMs      – createProver(): session WS setup + WASM Prover init + setup()
 *   requestMs         – send_request(): HTTP sent through the MPC-TLS channel
 *   proofGenerationMs – reveal(): MPC reveal protocol + commitment generation
 *   verificationMs    – getResponse(): elapsed until Verifier's session_completed arrives
 *                       (includes Verifier computation + network RTT, callback-driven)
 *   totalProtocolMs   – wall-clock from onProve entry to getResponse() completion
 *                       (excludes commitmentSelfCheck and all post-processing)
 *   verifierServerMs  – (optional) pure Verifier computation time reported by the
 *                       Rust server; only present when server-side timing is enabled
 */
export interface ProveTiming {
  connectionMs: number;
  requestMs: number;
  proofGenerationMs: number;
  verificationMs: number;
  totalProtocolMs: number;
  /** Verifier 服务器内部纯计算耗时 (ms)，仅服务端计时启用时有值 */
  verifierServerMs?: number;
}

export interface HandlerResult {
  type: HandlerType;
  part: HandlerPart;
  value: string;
  /** Index into transcriptCommitments[] this result corresponds to */
  commitmentIndex: number;
  /** Byte offset (inclusive) in the original transcript */
  start: number;
  /** Byte offset (exclusive) in the original transcript */
  end: number;
  /**
   * Byte offset of the target field **value** within the value string (exclusive of surrounding quotes).
   * For value = '"amount":"720.00"'  →  startValue points to '7' in "720.00"
   * For non-JSON parts defaults to 0.
   */
  startValue: number;
  /**
   * Byte offset (exclusive) of the target field **value** within the value string.
   * For value = '"amount":"720.00"'  →  endValue points just past the last '0'.
   * For non-JSON parts defaults to value.length.
   */
  endValue: number;
}

/**
 * Structured fields extracted and parsed by the Verifier from the revealed transcript.
 * Fields correspond to handler labels set in prove() options.
 * Only present when the Verifier supports structured field extraction.
 */
export interface VerifierStructuredFieldsSummary {
  transferId?: string;
  profileId?: string;
  state?: string;
  targetAmount?: string;
  targetCurrency?: string;
  transferDate?: string;
  recipientTitle?: string;
  recipientSubtitle?: string;
}

export interface VerifierSignatureSummary {
  chainId: number;
  sessionId: string;
  /** keccak256 of all commitment hash bytes, hex without 0x */
  commitmentsHash: string;
  /**
   * Order-binding hash echoed from session_data["__tlsn_order_binding_hash"].
   * keccak256(abi.encodePacked(escrow, chainId, merchant, buyer, productId, orderId, assetType, amount, rate, deadline))
   * "0x"-prefixed 32-byte hex. Present when the client passed the binding hash in sessionData.
   */
  orderBindingHash?: string;
  /** 65-byte ECDSA r+s+v, hex without 0x */
  signature: string;
  /** 0x-prefixed Ethereum address of the verifier */
  verifierAddress: string;
  /** Policy version locked into this signature (R.15). Present when the plugin passed a version. */
  policyVersion?: string;
  /** keccak256(policyVersion UTF-8) or bytes32(0), hex without 0x. For on-chain submission. */
  policyVersionHash?: string;
}

export interface ProveResponse {
  /** Revealed items sorted by commitmentIndex — directly aligned with transcriptCommitments[i] */
  results: HandlerResult[];
  transcriptCommitments: TranscriptCommitmentSummary[];
  verifierTranscript?: VerifierTranscriptSummary;
  transcriptCommitOpenings?: TranscriptCommitOpeningSummary[];
  commitmentSelfCheck?: CommitmentSelfCheckSummary;
  /** Verifier ECDSA signature over (chainId, sessionId, commitmentsHash) */
  verifierSignature?: VerifierSignatureSummary;
  /** TLS server hostname (e.g. "wise.com") */
  serverName?: string;
  /** TLSN 协议各阶段耗时；prove() 成功时填充，失败时不存在 */
  timing?: ProveTiming;
  /** Structured fields extracted by the Verifier from the revealed transcript using handler labels */
  structuredFields?: VerifierStructuredFieldsSummary;
}

export interface ProveRequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ProveOptions {
  verifierUrl: string;
  proxyUrl: string;
  maxRecvData?: number;
  maxSentData?: number;
  handlers: Handler[];
  sessionData?: Record<string, string>;
  /**
   * Marks which handlers' transcript ranges should be verified as account hashes
   * by the Verifier server (off-chain keccak256 comparison). These ranges are
   * excluded from the returned proof results and commitment openings.
   */
  accountCheckFields?: Array<{
    /** Index into handlers[] array (0-based) */
    handlerIndex: number;
    /** Key in sessionData that holds the expected keccak256 hash (0x-prefixed) */
    sessionDataKey: string;
    /**
     * How to derive the bytes to hash from the matched transcript range.
     * - 'full'       (default): hash the entire matched range as-is
     * - 'json_value': extract the string value from a "key":"value" JSON fragment,
     *                 hash only the inner string bytes (without quotes or key)
     */
    valueMode?: 'full' | 'json_value';
  }>;
  transcriptCommitHashAlg?: TranscriptCommitHashAlg;
  transcriptCommitDebug?: {
    exposeOpenings?: boolean;
    includeVerifierTranscript?: boolean;
    runSelfCheck?: boolean;
  };
  /**
   * Policy version override for this specific prove() call.
   * Takes precedence over pluginConfig.policyVersion when provided.
   */
  policyVersion?: string;
}

/**
 * Permission for making HTTP requests via prove()
 */
export interface RequestPermission {
  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Host name (e.g., "api.x.com") */
  host: string;

  /**
   * URL pathname pattern (URLPattern syntax, e.g., "/1.1/users/*")
   * Supports wildcards: * matches any single segment, ** matches multiple segments
   */
  pathname: string;

  /** Verifier URL to use for this request */
  verifierUrl: string;

  /**
   * Proxy URL for WebSocket connection.
   * Defaults to ws/wss of verifierUrl's /proxy endpoint if not specified.
   * e.g., verifierUrl "https://verifier.example.com" -> "wss://verifier.example.com/proxy?token={host}"
   */
  proxyUrl?: string;
}

/**
 * Plugin configuration object that all plugins must export
 */
export interface PluginConfig {
  /** Display name of the plugin */
  name: string;
  /** Description of what the plugin does */
  description: string;
  /** Optional version string */
  version?: string;
  /** Optional author name */
  author?: string;

  /**
   * Allowed HTTP requests the plugin can make via prove().
   * Empty array or undefined means no prove() calls allowed.
   */
  requests?: RequestPermission[];

  /**
   * Allowed URLs the plugin can open via openWindow().
   * Supports URLPattern syntax (e.g., "https://x.com/*").
   * Empty array or undefined means no openWindow() calls allowed.
   */
  urls?: string[];

  /**
   * Policy version for R.15 governance. Format: "v{major}.{minor}.{patch}".
   * When set, this value is cryptographically locked into the verifier ECDSA signature.
   */
  policyVersion?: string;
}

// ─── Travel Rule / Compliance Types ──────────────────────────────────────────

/**
 * Semantic labels for handler outputs per FATF R.16 Travel Rule.
 * Allows exchanges to parse structured fields without understanding internal formats.
 */
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
  | string; // custom labels, backward-compatible

/**
 * Standardized proof export format for R.11 archival (5-year retention).
 * Returned by GET /proof/{sessionId} on the verifier server.
 * Version-locked so exchanges can reliably parse historical proofs.
 */
export interface ProofExportV1 {
  /** Discriminator – always "ProofExportV1" */
  formatVersion: 'ProofExportV1';
  /** UUID of the verification session */
  attestationId: string;
  /** On-chain transaction hash (null until PATCH /proof/{id}/tx is called) */
  txHash: string | null;
  /** Policy version from plugin config, e.g. "v1.0.0" */
  policyVersion: string;
  /** ISO 8601 timestamp of verification */
  timestamp: string;
  /** TLS server hostname, e.g. "wise.com" */
  serverName: string;
  /** Verifier server semver */
  verifierVersion: string;
  /**
   * Structured fields extracted from revealed transcript, keyed by TravelRuleFieldLabel.
   * Only handlers with a label appear here.
   */
  travelRuleFields: {
    [label: string]: { value: string; commitmentIndex: number };
  };
  /** Account ownership checks performed by the verifier */
  accountChecks: Array<{
    fieldLabel: string;
    direction: 'SENT' | 'RECV';
    expectedHash: string;
    passed: boolean;
  }>;
  /** Order-binding hash echoed from sessionData, or null */
  orderBindingHash: string | null;
  /** keccak256 of all commitment hash bytes, hex without 0x */
  commitmentsHash: string;
  /** 65-byte ECDSA signature r+s+v, hex without 0x */
  verifierSignature: string;
  /** 0x-prefixed Ethereum address of the verifier */
  verifierAddress: string;
  /** Chain ID used for signing */
  chainId: number;
  /** Redacted transcript — bytes outside revealed ranges replaced with 0x00 */
  redactedTranscript: { sent: string; recv: string };
  /** Transcript commitment summaries, aligned with handler results */
  transcriptCommitments: TranscriptCommitmentSummary[];
}
