import Host, { Parser } from '@tlsn/plugin-sdk/src';
import { ProveManager } from './ProveManager';
import type { Method } from '../../../tlsn-wasm-pkg/tlsn_wasm';
import type {
  CommitmentSelfCheckSummary,
  DomJson,
  Handler,
  PluginConfig,
  ProveOptions,
  ProveRequestOptions,
  ProveResponse,
  TranscriptCommitHashAlg,
  TranscriptCommitOpeningSummary,
  TranscriptCommitmentHashAlg,
  TranscriptCommitmentRange,
  TranscriptCommitmentDirection,
} from '@tlsn/plugin-sdk/src/types';
import { processHandlers } from './rangeExtractor';
import { logger } from '@tlsn/common';
import {
  validateProvePermission,
  validateOpenWindowPermission,
} from './permissionValidator';
import { runTranscriptCommitmentRuntimeTest } from './transcriptCommitment.runtimeTest';

const SUPPORTED_TRANSCRIPT_HASH_ALGS: TranscriptCommitHashAlg[] = [
  'Sha256',
  'Blake3',
  'Keccak256',
];
const VERIFIER_TRANSCRIPT_SESSION_FLAG = '__tlsn_tc_include_verifier_transcript';

function isTranscriptCommitHashAlg(value: unknown): value is TranscriptCommitHashAlg {
  return (
    typeof value === 'string' &&
    SUPPORTED_TRANSCRIPT_HASH_ALGS.includes(value as TranscriptCommitHashAlg)
  );
}

function normalizeDirection(value: unknown): TranscriptCommitmentDirection | null {
  if (value === 'SENT' || value === 'Sent') {
    return 'SENT';
  }

  if (value === 'RECV' || value === 'Recv' || value === 'Received') {
    return 'RECV';
  }

  return null;
}

function normalizeHashAlg(value: unknown): TranscriptCommitmentHashAlg {
  if (value === 'Sha256') {
    return 'Sha256';
  }
  if (value === 'Blake3') {
    return 'Blake3';
  }
  if (value === 'Keccak256') {
    return 'Keccak256';
  }
  return 'Unknown';
}

function normalizeRanges(value: unknown): TranscriptCommitmentRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      start: Number((item as any)?.start),
      end: Number((item as any)?.end),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));
}

function normalizeTranscriptCommitOpenings(
  rawOpenings: unknown,
): TranscriptCommitOpeningSummary[] {
  if (!Array.isArray(rawOpenings)) {
    return [];
  }

  const openings: TranscriptCommitOpeningSummary[] = [];
  for (const item of rawOpenings) {
    const direction = normalizeDirection((item as any)?.direction);
    const ranges = normalizeRanges((item as any)?.ranges);
    const blinderHex =
      typeof (item as any)?.blinderHex === 'string'
        ? (item as any).blinderHex
        : typeof (item as any)?.blinder_hex === 'string'
          ? (item as any).blinder_hex
          : null;

    if (!direction || !blinderHex) {
      continue;
    }

    openings.push({
      kind: 'Hash',
      direction,
      hashAlg: normalizeHashAlg((item as any)?.hashAlg ?? (item as any)?.hash_alg),
      ranges,
      blinderHex,
    });
  }

  return openings;
}


function skippedSelfCheck(message: string): CommitmentSelfCheckSummary {
  return {
    status: 'skipped',
    total: 0,
    matched: 0,
    mismatched: 0,
    message,
  };
}

export class SessionManager {
  private host: Host;
  private proveManager: ProveManager;
  private initPromise: Promise<void>;
  private currentConfig: PluginConfig | null = null;

  constructor() {
    this.host = new Host({
      onProve: async (
        requestOptions: ProveRequestOptions,
        proverOptions: ProveOptions,
      ): Promise<ProveResponse> => {
        // ── Timing: 协议总起点 ──────────────────────────────────
        const t_total = performance.now();

        let url;

        try {
          url = new URL(requestOptions.url);
        } catch (error) {
          throw new Error('Invalid URL');
        }

        // Validate permissions before proceeding
        validateProvePermission(
          requestOptions,
          proverOptions,
          this.currentConfig,
        );

        const transcriptCommitHashAlg = proverOptions.transcriptCommitHashAlg;
        if (
          transcriptCommitHashAlg !== undefined &&
          !isTranscriptCommitHashAlg(transcriptCommitHashAlg)
        ) {
          throw new Error(
            `Invalid transcriptCommitHashAlg: ${String(transcriptCommitHashAlg)}. ` +
              `Expected one of: ${SUPPORTED_TRANSCRIPT_HASH_ALGS.join(', ')}`,
          );
        }

        const transcriptCommitDebug = proverOptions.transcriptCommitDebug;
        const exposeOpenings = Boolean(transcriptCommitDebug?.exposeOpenings);
        const runSelfCheck = transcriptCommitDebug?.runSelfCheck !== false;
        const includeVerifierTranscript = Boolean(
          transcriptCommitDebug?.includeVerifierTranscript,
        );

        // Build sessionData with defaults + user-provided data
        const sessionData: Record<string, string> = {
          ...proverOptions.sessionData,
        };
        if (includeVerifierTranscript) {
          sessionData[VERIFIER_TRANSCRIPT_SESSION_FLAG] = 'true';
        }
        // Inject policy version for R.15 governance — proverOptions takes precedence over pluginConfig
        sessionData['__tlsn_policy_version'] =
          proverOptions.policyVersion ?? this.currentConfig?.policyVersion ?? 'unspecified';

        // ── Phase A: MPC-TLS 连接 ──────────────────────────────
        const t_conn = performance.now();
        const proverId = await this.proveManager.createProver(
          url.hostname,
          proverOptions.verifierUrl,
          proverOptions.maxRecvData,
          proverOptions.maxSentData,
          sessionData,
        );
        const connectionMs = Math.round(performance.now() - t_conn);
        logger.debug('[Timing] connection:', connectionMs, 'ms');

        try {
          const prover = await this.proveManager.getProver(proverId);

          const headerMap: Map<string, number[]> = new Map();
          Object.entries(requestOptions.headers || {}).forEach(
            ([key, value]) => {
              if (value !== undefined && value !== null) {
                headerMap.set(key, Buffer.from(String(value)).toJSON().data);
              }
            },
          );

          // ── Phase B: HTTP 请求（TLS 录制）───────────────────
          const t_req = performance.now();
          await prover.send_request(proverOptions.proxyUrl, {
            uri: requestOptions.url,
            method: requestOptions.method as Method,
            headers: headerMap,
            body: requestOptions.body,
          });
          const requestMs = Math.round(performance.now() - t_req);
          logger.debug('[Timing] send_request:', requestMs, 'ms');

          // Get transcripts for parsing
          const { sent, recv } = await prover.transcript();

          const parsedSent = new Parser(Buffer.from(sent));
          const parsedRecv = new Parser(Buffer.from(recv));

          logger.debug('parsedSent', parsedSent.json());
          logger.debug('parsedRecv', parsedRecv.json());

          // Use refactored range extraction logic
          const {
            sentRanges,
            recvRanges,
            sentRangesWithHandlers,
            recvRangesWithHandlers,
          } = processHandlers(proverOptions.handlers, parsedSent, parsedRecv);

          logger.debug('sentRanges', sentRanges);
          logger.debug('recvRanges', recvRanges);

          // Build accountCheck ranges from accountCheckFields config
          const accountCheckFields = (proverOptions as any).accountCheckFields as
            | Array<{ handlerIndex: number; sessionDataKey: string; valueMode?: string }>
            | undefined;

          const accountCheckRanges: Array<{
            direction: string;
            start: number;
            end: number;
            expectedHash: string;
            valueMode: string;
          }> = [];

          if (accountCheckFields?.length) {
            const allRangesWithHandlers = [
              ...sentRangesWithHandlers.map((r) => ({ ...r, direction: 'SENT' as const })),
              ...recvRangesWithHandlers.map((r) => ({ ...r, direction: 'RECV' as const })),
            ];

            for (const field of accountCheckFields) {
              const targetHandler = proverOptions.handlers[field.handlerIndex];
              if (!targetHandler) continue;

              const expectedHash = (proverOptions.sessionData ?? {})[field.sessionDataKey];
              if (!expectedHash) continue;

              for (const rwh of allRangesWithHandlers) {
                const isSameHandler =
                  rwh.handler === targetHandler ||
                  ((rwh.handler as any).type === (targetHandler as any).type &&
                    (rwh.handler as any).part === (targetHandler as any).part &&
                    (rwh.handler as any).action === (targetHandler as any).action &&
                    JSON.stringify((rwh.handler as any).params) ===
                      JSON.stringify((targetHandler as any).params));

                if (isSameHandler) {
                  accountCheckRanges.push({
                    direction: rwh.direction.toLowerCase(),
                    start: rwh.start,
                    end: rwh.end,
                    expectedHash,
                    valueMode: field.valueMode ?? 'full',
                  });
                }
              }
            }
          }

          // Send reveal config (ranges + handlers) to verifier BEFORE calling reveal()
          await this.proveManager.sendRevealConfig(proverId, {
            sent: sentRangesWithHandlers,
            recv: recvRangesWithHandlers,
            accountChecks: accountCheckRanges,
          });

          // Reveal the ranges
          const revealPayload: any = {
            sent: sentRanges,
            recv: recvRanges,
            server_identity: true,
          };

          if (transcriptCommitHashAlg) {
            revealPayload.transcript_commit = {
              hash_alg: transcriptCommitHashAlg,
              expose_openings: exposeOpenings,
            };
          }

          // ── Phase C: 证明生成 ────────────────────────────────
          const t_proof = performance.now();
          const revealResult = (await prover.reveal(revealPayload)) as any;
          const proofGenerationMs = Math.round(performance.now() - t_proof);
          logger.debug(
            '[Timing] reveal (proof generation):',
            proofGenerationMs,
            'ms',
          );
          const transcriptCommitOpenings = exposeOpenings
            ? normalizeTranscriptCommitOpenings(
                revealResult?.transcriptCommitOpenings ??
                  revealResult?.transcript_commit_openings,
              )
            : [];

          // ── Phase D: Verifier 验证 ───────────────────────────
          const t_verify = performance.now();
          const response = await this.proveManager.getResponse(proverId);
          const verificationMs = Math.round(performance.now() - t_verify);
          // Must read before cleanupProver() deletes session state
          const verifierServerMs = this.proveManager.getVerifierServerMs(proverId);
          logger.debug(
            '[Timing] getResponse (verification):',
            verificationMs,
            'ms',
          );
          if (verifierServerMs !== undefined) {
            logger.debug('[Timing] verifier server computation:', verifierServerMs, 'ms');
          }

          // ── 汇总 timing ─────────────────────────────────────
          const totalProtocolMs = Math.round(performance.now() - t_total);
          logger.debug('[Timing] TLSN protocol total:', totalProtocolMs, 'ms', {
            connectionMs,
            requestMs,
            proofGenerationMs,
            verificationMs,
            totalProtocolMs,
          });

          // Build (direction:start:end) → original Handler lookup to recover params
          const handlerLookup = new Map<string, Handler>();
          for (const rwh of sentRangesWithHandlers) {
            handlerLookup.set(`SENT:${rwh.start}:${rwh.end}`, rwh.handler);
          }
          for (const rwh of recvRangesWithHandlers) {
            handlerLookup.set(`RECV:${rwh.start}:${rwh.end}`, rwh.handler);
          }

          // Enrich each HandlerResult with startValue / endValue using Parser ranges.
          // For BODY JSON handlers: call parser.ranges.body(path, { hideKey: true }) to get the
          // value-only range, then derive byte offsets within the value string.
          const enrichedResults = (response?.results ?? []).map((result) => {
            const key = `${result.type}:${result.start}:${result.end}`;
            const originalHandler = handlerLookup.get(key);

            let startValue = 0;
            let endValue = (result.value ?? '').length;

            if (originalHandler?.part === 'BODY') {
              const params = (originalHandler as any).params as
                | { type?: string; path?: string; hideKey?: boolean }
                | undefined;

              if (params?.type === 'json' && params.path) {
                const parser =
                  result.type === 'SENT' ? parsedSent : parsedRecv;
                const hideKey = params.hideKey ?? false;

                if (hideKey) {
                  // value IS the value portion already: '"KAI XU LOOI"' or '42'
                  if (
                    result.value.startsWith('"') &&
                    result.value.endsWith('"') &&
                    result.value.length >= 2
                  ) {
                    startValue = 1;
                    endValue = result.value.length - 1;
                  }
                  // number / bool / null: keep defaults 0..length
                } else {
                  // Call Parser with hideKey:true to get value-only transcript range
                  try {
                    const valueRanges = parser.ranges.body(params.path, {
                      type: 'json',
                      hideKey: true,
                    });
                    if (valueRanges.length > 0) {
                      const vr = valueRanges[0];
                      // offsetStart/End are byte offsets within the value string
                      const offsetStart = vr.start - result.start;
                      const offsetEnd = vr.end - result.start;
                      // If the byte at offsetStart is '"', it's a quoted string
                      if (result.value[offsetStart] === '"') {
                        startValue = offsetStart + 1; // skip opening quote
                        endValue = offsetEnd - 1;     // skip closing quote
                      } else {
                        // number / bool / null: no surrounding quotes
                        startValue = offsetStart;
                        endValue = offsetEnd;
                      }
                    }
                  } catch {
                    // fallback: 0..length already set
                  }
                }
              }
            } else if (originalHandler?.part === 'ALL') {
              const params = (originalHandler as any).params as
                | { type?: string; regex?: string; flags?: string }
                | undefined;

              if (params?.type === 'regex' && params.regex) {
                try {
                  // Re-run the regex with 'd' flag to get capture group indices.
                  // If group 1 exists, it designates the value portion within the match.
                  const flags = (params.flags ?? '').replace('d', '') + 'd';
                  const re = new RegExp(params.regex, flags);
                  const match = re.exec(result.value) as RegExpExecArray & {
                    indices?: [number, number][];
                  };

                  if (match?.indices && match.indices[1]) {
                    startValue = match.indices[1][0];
                    endValue = match.indices[1][1];
                  }
                  // No capture group → keep defaults 0..value.length
                } catch {
                  // fallback: 0..length already set
                }
              }
            }

            return { ...result, startValue, endValue };
          });

          // Filter out private account-check ranges from results and openings
          const privateRangeKeys = new Set<string>(
            accountCheckRanges.map((r) => `${r.direction.toUpperCase()}:${r.start}:${r.end}`),
          );

          const filteredResults =
            privateRangeKeys.size > 0
              ? enrichedResults.filter((result) => {
                  const key = `${result.type}:${result.start}:${result.end}`;
                  return !privateRangeKeys.has(key);
                })
              : enrichedResults;

          const filteredOpenings =
            privateRangeKeys.size > 0
              ? transcriptCommitOpenings.filter((opening: any) => {
                  const dir = String(opening.direction).toUpperCase();
                  return !(opening.ranges ?? []).some((r: { start: number; end: number }) =>
                    privateRangeKeys.has(`${dir}:${r.start}:${r.end}`),
                  );
                })
              : transcriptCommitOpenings;

          const proveResponse: ProveResponse = {
            results: filteredResults,
            transcriptCommitments: response?.transcriptCommitments ?? [],
            verifierTranscript: response?.verifierTranscript,
            verifierSignature: response?.verifierSignature,
            serverName: response?.serverName,
            structuredFields: response?.structuredFields,
            transcriptCommitOpenings: filteredOpenings,
            timing: {
              connectionMs,
              requestMs,
              proofGenerationMs,
              verificationMs,
              totalProtocolMs,
              verifierServerMs,
            },
          };

          proveResponse.commitmentSelfCheck = runSelfCheck
            ? runTranscriptCommitmentRuntimeTest(proveResponse)
            : skippedSelfCheck('Runtime self-check is disabled by transcriptCommitDebug');

          return proveResponse;
        } finally {
          // Always clean up prover resources to prevent memory leaks
          this.proveManager.cleanupProver(proverId);
        }
      },
      onRenderPluginUi: (windowId: number, result: DomJson) => {
        const chromeRuntime = (
          global as unknown as { chrome?: { runtime?: any } }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) {
          throw new Error('Chrome runtime not available');
        }
        chromeRuntime.sendMessage({
          type: 'RENDER_PLUGIN_UI',
          json: result,
          windowId: windowId,
        });
      },
      onCloseWindow: (windowId: number) => {
        const chromeRuntime = (
          global as unknown as { chrome?: { runtime?: any } }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) {
          throw new Error('Chrome runtime not available');
        }
        logger.debug('onCloseWindow', windowId);
        return chromeRuntime.sendMessage({
          type: 'CLOSE_WINDOW',
          windowId,
        });
      },
      onOpenWindow: async (
        url: string,
        options?: { width?: number; height?: number; showOverlay?: boolean },
      ) => {
        // Validate permissions before proceeding
        validateOpenWindowPermission(url, this.currentConfig);

        const chromeRuntime = (
          global as unknown as { chrome?: { runtime?: any } }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) {
          throw new Error('Chrome runtime not available');
        }
        return chromeRuntime.sendMessage({
          type: 'OPEN_WINDOW',
          url,
          width: options?.width,
          height: options?.height,
          showOverlay: options?.showOverlay,
        });
      },
    });
    this.proveManager = new ProveManager();
    this.initPromise = new Promise(async (resolve) => {
      await this.proveManager.init();
      resolve();
    });
  }

  async awaitInit(): Promise<SessionManager> {
    await this.initPromise;
    return this;
  }

  async executePlugin(code: string): Promise<unknown> {
    const chromeRuntime = (global as unknown as { chrome?: { runtime?: any } })
      .chrome?.runtime;
    if (!chromeRuntime?.onMessage) {
      throw new Error('Chrome runtime not available');
    }

    // Extract and store plugin config before execution for permission validation
    this.currentConfig = await this.extractConfig(code);
    logger.debug(
      '[SessionManager] Extracted plugin config:',
      this.currentConfig,
    );

    return this.host.executePlugin(code, {
      eventEmitter: {
        addListener: (listener: (message: any) => void) => {
          chromeRuntime.onMessage.addListener(listener);
        },
        removeListener: (listener: (message: any) => void) => {
          chromeRuntime.onMessage.removeListener(listener);
        },
        emit: (message: any) => {
          chromeRuntime.sendMessage(message);
        },
      },
    });
  }

  /**
   * Extract plugin config using QuickJS sandbox (more reliable than regex)
   */
  async extractConfig(code: string): Promise<any> {
    return this.host.getPluginConfig(code);
  }
}
