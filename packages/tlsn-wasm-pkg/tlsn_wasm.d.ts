/* tslint:disable */
/* eslint-disable */
export interface Commit {
    sent: { start: number; end: number }[];
    recv: { start: number; end: number }[];
}

export interface ConnectionInfo {
    time: number;
    version: TlsVersion;
    transcript_length: TranscriptLength;
}

export interface CrateLogFilter {
    level: LoggingLevel;
    name: string;
}

export interface HttpRequest {
    uri: string;
    method: Method;
    headers: Map<string, number[]>;
    body: Body | undefined;
}

export interface HttpResponse {
    status: number;
    headers: [string, number[]][];
}

export interface LoggingConfig {
    level: LoggingLevel | undefined;
    crate_filters: CrateLogFilter[] | undefined;
    span_events: SpanEvent[] | undefined;
}

export interface PartialTranscript {
    sent: number[];
    sent_authed: { start: number; end: number }[];
    recv: number[];
    recv_authed: { start: number; end: number }[];
}

export interface ProverConfig {
    server_name: string;
    max_sent_data: number;
    max_sent_records: number | undefined;
    max_recv_data_online: number | undefined;
    max_recv_data: number;
    max_recv_records_online: number | undefined;
    defer_decryption_from_start: boolean | undefined;
    network: NetworkSetting;
    client_auth: [number[][], number[]] | undefined;
}

export interface Reveal {
    sent: { start: number; end: number }[];
    recv: { start: number; end: number }[];
    server_identity: boolean;
    transcript_commit: TranscriptCommitOptions | undefined;
}

export interface RevealOutput {
    transcriptCommitOpenings: TranscriptCommitOpening[];
}

export interface Transcript {
    sent: number[];
    recv: number[];
}

export interface TranscriptCommitOpening {
    kind: TranscriptCommitOpeningKind;
    direction: TranscriptCommitOpeningDirection;
    hashAlg: TranscriptCommitOpeningHashAlg;
    ranges: { start: number; end: number }[];
    blinderHex: string;
}

export interface TranscriptCommitOptions {
    hash_alg: CommitHashAlg;
    expose_openings: boolean | undefined;
}

export interface TranscriptLength {
    sent: number;
    recv: number;
}

export interface VerifierConfig {
    max_sent_data: number;
    max_recv_data: number;
    max_sent_records: number | undefined;
    max_recv_records_online: number | undefined;
}

export interface VerifierOutput {
    server_name: string | undefined;
    connection_info: ConnectionInfo;
    transcript: PartialTranscript | undefined;
}

export type Body = JsonValue;

export type CommitHashAlg = "Sha256" | "Blake3" | "Keccak256";

export type LoggingLevel = "Trace" | "Debug" | "Info" | "Warn" | "Error";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export type NetworkSetting = "Bandwidth" | "Latency";

export type SpanEvent = "New" | "Close" | "Active";

export type TlsVersion = "V1_2" | "V1_3";

export type TranscriptCommitOpeningDirection = "SENT" | "RECV";

export type TranscriptCommitOpeningHashAlg = "Sha256" | "Blake3" | "Keccak256" | "Unknown";

export type TranscriptCommitOpeningKind = "Hash";


export class Prover {
    free(): void;
    [Symbol.dispose](): void;
    constructor(config: ProverConfig);
    /**
     * Reveals data to the verifier and finalizes the protocol.
     */
    reveal(reveal: Reveal): Promise<RevealOutput>;
    /**
     * Send the HTTP request to the server.
     */
    send_request(ws_proxy_url: string, request: HttpRequest): Promise<HttpResponse>;
    /**
     * Set up the prover.
     *
     * This performs all MPC setup prior to establishing the connection to the
     * application server.
     */
    setup(verifier_url: string): Promise<void>;
    /**
     * Returns the transcript.
     */
    transcript(): Transcript;
}

/**
 * Global spawner which spawns closures into web workers.
 */
export class Spawner {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    intoRaw(): number;
    /**
     * Runs the spawner.
     */
    run(url: string): Promise<void>;
}

export class Verifier {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Connect to the prover.
     */
    connect(prover_url: string): Promise<void>;
    constructor(config: VerifierConfig);
    /**
     * Verifies the connection and finalizes the protocol.
     */
    verify(): Promise<VerifierOutput>;
}

export class WorkerData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Initializes the module.
 */
export function initialize(logging_config: LoggingConfig | null | undefined, thread_count: number): Promise<void>;

/**
 * Starts the thread spawner on a dedicated worker thread.
 */
export function startSpawner(): Promise<any>;

export function web_spawn_recover_spawner(spawner: number): Spawner;

export function web_spawn_start_worker(worker: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly __wbg_prover_free: (a: number, b: number) => void;
    readonly __wbg_verifier_free: (a: number, b: number) => void;
    readonly initialize: (a: number, b: number) => any;
    readonly prover_new: (a: any) => [number, number, number];
    readonly prover_reveal: (a: number, b: any) => any;
    readonly prover_send_request: (a: number, b: number, c: number, d: any) => any;
    readonly prover_setup: (a: number, b: number, c: number) => any;
    readonly prover_transcript: (a: number) => [number, number, number];
    readonly verifier_connect: (a: number, b: number, c: number) => any;
    readonly verifier_new: (a: any) => number;
    readonly verifier_verify: (a: number) => any;
    readonly __wbg_spawner_free: (a: number, b: number) => void;
    readonly __wbg_workerdata_free: (a: number, b: number) => void;
    readonly spawner_intoRaw: (a: number) => number;
    readonly spawner_run: (a: number, b: number, c: number) => any;
    readonly startSpawner: () => any;
    readonly web_spawn_recover_spawner: (a: number) => number;
    readonly web_spawn_start_worker: (a: number) => void;
    readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly wasm_bindgen_17a784087041205b___closure__destroy___dyn_core_2e51e20018f0760f___ops__function__FnMut__wasm_bindgen_17a784087041205b___JsValue____Output________1_: (a: number, b: number) => void;
    readonly wasm_bindgen_17a784087041205b___closure__destroy___dyn_core_2e51e20018f0760f___ops__function__FnMut__wasm_bindgen_17a784087041205b___JsValue____Output___core_2e51e20018f0760f___result__Result_____wasm_bindgen_17a784087041205b___JsError___: (a: number, b: number) => void;
    readonly wasm_bindgen_17a784087041205b___closure__destroy___dyn_core_2e51e20018f0760f___ops__function__FnMut__web_sys_54bc5b4ffa5d6e2e___features__gen_CloseEvent__CloseEvent____Output_______: (a: number, b: number) => void;
    readonly wasm_bindgen_17a784087041205b___closure__destroy___dyn_core_2e51e20018f0760f___ops__function__FnMut__wasm_bindgen_17a784087041205b___JsValue____Output_______: (a: number, b: number) => void;
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke___wasm_bindgen_17a784087041205b___JsValue__core_2e51e20018f0760f___result__Result_____wasm_bindgen_17a784087041205b___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke___js_sys_1d1cb6e545025d9e___Function_fn_wasm_bindgen_17a784087041205b___JsValue_____wasm_bindgen_17a784087041205b___sys__Undefined___js_sys_1d1cb6e545025d9e___Function_fn_wasm_bindgen_17a784087041205b___JsValue_____wasm_bindgen_17a784087041205b___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke___wasm_bindgen_17a784087041205b___JsValue______true__1_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke___web_sys_54bc5b4ffa5d6e2e___features__gen_MessageEvent__MessageEvent______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke___web_sys_54bc5b4ffa5d6e2e___features__gen_CloseEvent__CloseEvent______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke___wasm_bindgen_17a784087041205b___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_17a784087041205b___convert__closures_____invoke_______true_: (a: number, b: number) => void;
    readonly memory: WebAssembly.Memory;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
    readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
 * @param {WebAssembly.Memory} memory - Deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
