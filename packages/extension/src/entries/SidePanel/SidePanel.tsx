import React, { useState, useEffect, useRef } from 'react';
import { logger, LogLevel } from '@tlsn/common';
import { setStoredLogLevel, getStoredLogLevel } from '../../utils/logLevelStorage';

logger.init(LogLevel.DEBUG);

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimingRecord {
  round: number;
  run: number;
  proveIndex: number;
  coldStart: boolean;
  connectionMs: number;
  requestMs: number;
  proofGenerationMs: number;
  verificationMs: number;
  verifierServerMs: number | null;
  totalProtocolMs: number;
  recvBytes: number;
  sentBytes: number;
  revealedRecvBytes: number;
  error: boolean;
}

interface RoundSummary {
  round: number;
  completedAt: Date;
  warmCount: number;
  avgConnectionMs: number;
  avgRequestMs: number;
  avgProofGenMs: number;
  avgVerificationMs: number;
  avgTotalMs: number;
}

type BenchmarkMode = 'burst' | 'interval';
type BurstState = 'idle' | 'running' | 'done';
type IntervalState = 'idle' | 'running' | 'waiting' | 'stopped';

// ── CSV ───────────────────────────────────────────────────────────────────────

function toCSV(records: TimingRecord[], includeRound: boolean): string {
  const header = [
    ...(includeRound ? ['round'] : []),
    'run',
    'prove_index',
    'cold_start',
    'connectionMs',
    'requestMs',
    'proofGenerationMs',
    'verificationMs',
    'verifierServerMs',
    'totalProtocolMs',
    'recvBytes',
    'sentBytes',
    'revealedRecvBytes',
    'revealRatioPct',
    'error',
  ].join(',');

  const rows = records.map((r) => {
    const revealRatioPct =
      r.recvBytes > 0
        ? ((r.revealedRecvBytes / r.recvBytes) * 100).toFixed(1)
        : '';
    return [
      ...(includeRound ? [r.round] : []),
      r.run,
      r.proveIndex,
      r.coldStart ? 'true' : 'false',
      r.connectionMs,
      r.requestMs,
      r.proofGenerationMs,
      r.verificationMs,
      r.verifierServerMs ?? '',
      r.totalProtocolMs,
      r.recvBytes,
      r.sentBytes,
      r.revealedRecvBytes,
      revealRatioPct,
      r.error ? 'true' : 'false',
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  chrome.downloads.download({ url: dataUrl, filename });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function fetchBenchmarkRound(
  runsCount: number,
  round: number,
  onProgress?: (current: number, total: number) => void,
): Promise<TimingRecord[]> {
  const prevLevel = await getStoredLogLevel();
  await setStoredLogLevel(LogLevel.WARN);

  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'benchmark' });
    let settled = false;

    // Send a no-op KEEPALIVE every 20 s so the Background service worker
    // receives an event and resets its 30-second idle timer.  This prevents
    // Chrome from terminating the SW during long-running benchmarks even
    // when progress messages are infrequent (e.g. each TLS proof > 30 s).
    const keepaliveTimer = setInterval(() => {
      if (settled) return;
      try { port.postMessage({ type: 'KEEPALIVE' }); } catch { /* port gone */ }
    }, 20_000);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(keepaliveTimer);
      try { port.disconnect(); } catch { /* already disconnected */ }
      setStoredLogLevel(prevLevel).catch(() => {}).finally(fn);
    };

    port.onMessage.addListener((msg: any) => {
      if (msg.type === 'BENCHMARK_PROGRESS') {
        onProgress?.(msg.current, msg.total);
      } else if (msg.type === 'BENCHMARK_RESULT') {
        if (msg.success && msg.timings) {
          const pc: number = msg.proveCount ?? 1;
          const records: TimingRecord[] = (msg.timings as any[]).map((t, i) => ({
            round,
            run: Math.floor(i / pc) + 1,
            proveIndex: i % pc,
            coldStart: Math.floor(i / pc) === 0,
            connectionMs: t.connectionMs ?? -1,
            requestMs: t.requestMs ?? -1,
            proofGenerationMs: t.proofGenerationMs ?? -1,
            verificationMs: t.verificationMs ?? -1,
            verifierServerMs: t.verifierServerMs ?? null,
            totalProtocolMs: t.totalProtocolMs ?? -1,
            recvBytes: t.recvBytes ?? 0,
            sentBytes: t.sentBytes ?? 0,
            revealedRecvBytes: t.revealedRecvBytes ?? 0,
            error: t.totalProtocolMs === -1,
          }));
          settle(() => resolve(records));
        } else {
          settle(() => reject(new Error(msg.error ?? 'Benchmark failed')));
        }
      }
    });

    port.onDisconnect.addListener(() => {
      const runtimeErr = chrome.runtime.lastError;
      settle(() =>
        reject(new Error(runtimeErr?.message ?? 'Benchmark connection lost')),
      );
    });

    port.postMessage({ type: 'BENCHMARK_RUN', runs: runsCount });
  });
}

function computeRoundSummary(
  round: number,
  records: TimingRecord[],
): RoundSummary {
  const warm = records.filter((r) => !r.coldStart && !r.error);
  const n = warm.length;
  const avg = (key: keyof TimingRecord) =>
    n === 0
      ? 0
      : Math.round(warm.reduce((s, t) => s + (t[key] as number), 0) / n);
  return {
    round,
    completedAt: new Date(),
    warmCount: n,
    avgConnectionMs: avg('connectionMs'),
    avgRequestMs: avg('requestMs'),
    avgProofGenMs: avg('proofGenerationMs'),
    avgVerificationMs: avg('verificationMs'),
    avgTotalMs: avg('totalProtocolMs'),
  };
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function msToSec(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

// ── SidePanel component ───────────────────────────────────────────────────────

const SidePanel: React.FC = () => {
  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<BenchmarkMode>('burst');

  // ── Burst state ───────────────────────────────────────────────────────────
  const [runs, setRuns] = useState(20);
  const [burstState, setBurstState] = useState<BurstState>('idle');
  const [burstTimings, setBurstTimings] = useState<TimingRecord[]>([]);
  const [burstErrorMsg, setBurstErrorMsg] = useState<string | null>(null);

  // ── Interval state ────────────────────────────────────────────────────────
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [runsPerInterval, setRunsPerInterval] = useState(20);
  const [intervalState, setIntervalState] = useState<IntervalState>('idle');
  const [currentRound, setCurrentRound] = useState(0);
  const [countdownSec, setCountdownSec] = useState(0);
  const [allTimings, setAllTimings] = useState<TimingRecord[]>([]);
  const [roundSummaries, setRoundSummaries] = useState<RoundSummary[]>([]);
  const [intervalErrorMsg, setIntervalErrorMsg] = useState<string | null>(null);

  // ── Shared progress ───────────────────────────────────────────────────────
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // ── Refs: avoid stale closures in async interval callbacks ────────────────
  const stoppedRef = useRef(false);
  const nextRoundTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const currentRoundRef = useRef(0);
  const intervalMinutesRef = useRef(intervalMinutes);
  const runsPerIntervalRef = useRef(runsPerInterval);
  // True while fetchBenchmarkRound is in flight; used to detect timeout-before-done
  const isRunningRoundRef = useRef(false);
  // True when the interval timer fired while a round was still executing
  const pendingNextRoundRef = useRef(false);

  useEffect(() => {
    intervalMinutesRef.current = intervalMinutes;
  }, [intervalMinutes]);

  useEffect(() => {
    runsPerIntervalRef.current = runsPerInterval;
  }, [runsPerInterval]);

  // ── Burst: start ──────────────────────────────────────────────────────────
  const startBurst = async () => {
    setBurstErrorMsg(null);
    setBurstState('running');
    setProgress({ current: 0, total: runs });
    setBurstTimings([]);

    try {
      const records = await fetchBenchmarkRound(runs, 1, (c, t) =>
        setProgress({ current: c, total: t }),
      );
      setBurstTimings(records);
      setBurstState('done');
    } catch (err) {
      setBurstErrorMsg(err instanceof Error ? err.message : String(err));
      setBurstState('idle');
    }
  };

  // ── Interval: single round (recursive via setTimeout) ─────────────────────
  const runIntervalRound = async () => {
    if (stoppedRef.current) {
      setIntervalState('stopped');
      return;
    }

    // Start the full-cycle countdown immediately at the top of this round
    const totalSec = intervalMinutesRef.current * 60;
    setCountdownSec(totalSec);
    pendingNextRoundRef.current = false;
    isRunningRoundRef.current = true;

    if (countdownTimerRef.current !== null) clearInterval(countdownTimerRef.current);
    if (nextRoundTimerRef.current !== null) clearTimeout(nextRoundTimerRef.current);

    countdownTimerRef.current = window.setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    nextRoundTimerRef.current = window.setTimeout(() => {
      nextRoundTimerRef.current = null;
      if (isRunningRoundRef.current) {
        // Round still in flight — mark pending; will fire immediately when done
        pendingNextRoundRef.current = true;
      } else {
        runIntervalRound();
      }
    }, totalSec * 1000);

    // Execute the round (timer is already ticking)
    setIntervalState('running');
    setProgress({ current: 0, total: runsPerIntervalRef.current });

    let newRecords: TimingRecord[] = [];
    try {
      newRecords = await fetchBenchmarkRound(
        runsPerIntervalRef.current,
        currentRoundRef.current + 1,
        (c, t) => setProgress({ current: c, total: t }),
      );
      setIntervalErrorMsg(null);
    } catch (err) {
      // Record the error but don't stop the interval — continue to next round
      setIntervalErrorMsg(err instanceof Error ? err.message : String(err));
    }

    isRunningRoundRef.current = false;
    currentRoundRef.current += 1;
    setCurrentRound(currentRoundRef.current);

    if (newRecords.length > 0) {
      setAllTimings((prev) => [...prev, ...newRecords]);
      setRoundSummaries((prev) => [
        ...prev,
        computeRoundSummary(currentRoundRef.current, newRecords),
      ]);
    }

    if (stoppedRef.current) {
      if (nextRoundTimerRef.current !== null) {
        clearTimeout(nextRoundTimerRef.current);
        nextRoundTimerRef.current = null;
      }
      if (countdownTimerRef.current !== null) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setIntervalState('stopped');
      return;
    }

    if (pendingNextRoundRef.current) {
      // Timer already expired while we were running — start next round immediately
      pendingNextRoundRef.current = false;
      runIntervalRound();
    } else {
      // Countdown still ticking — switch UI to 'waiting'
      setIntervalState('waiting');
    }
  };

  const startInterval = () => {
    stoppedRef.current = false;
    currentRoundRef.current = 0;
    isRunningRoundRef.current = false;
    pendingNextRoundRef.current = false;
    setCurrentRound(0);
    setAllTimings([]);
    setRoundSummaries([]);
    setIntervalErrorMsg(null);
    setCountdownSec(0);
    runIntervalRound();
  };

  const stopInterval = () => {
    stoppedRef.current = true;
    if (nextRoundTimerRef.current !== null) {
      clearTimeout(nextRoundTimerRef.current);
      nextRoundTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    // If currently running a round, let it finish then stop (stoppedRef check above handles it)
    if (intervalState !== 'running') {
      setIntervalState('stopped');
    }
  };

  // ── Burst: statistics ─────────────────────────────────────────────────────
  const burstWarm = burstTimings.filter((t) => !t.coldStart && !t.error);

  const avgMs = (key: keyof TimingRecord) =>
    burstWarm.length === 0
      ? '—'
      : Math.round(
          burstWarm.reduce((s, t) => s + (t[key] as number), 0) / burstWarm.length,
        ) + 'ms';

  const stddevMs = (key: keyof TimingRecord) => {
    if (burstWarm.length < 2) return '—';
    const mean =
      burstWarm.reduce((s, t) => s + (t[key] as number), 0) / burstWarm.length;
    const variance =
      burstWarm.reduce(
        (s, t) => s + Math.pow((t[key] as number) - mean, 2),
        0,
      ) /
      (burstWarm.length - 1);
    return '±' + Math.round(Math.sqrt(variance)) + 'ms';
  };

  const avgRecvKB =
    burstWarm.length === 0
      ? null
      : burstWarm.reduce((s, t) => s + t.recvBytes, 0) / burstWarm.length / 1024;

  const avgSentKB =
    burstWarm.length === 0
      ? null
      : burstWarm.reduce((s, t) => s + t.sentBytes, 0) / burstWarm.length / 1024;

  const avgRevealRatioPct =
    burstWarm.length === 0
      ? null
      : (burstWarm.reduce(
          (s, t) =>
            s + (t.recvBytes > 0 ? t.revealedRecvBytes / t.recvBytes : 0),
          0,
        ) /
          burstWarm.length) *
        100;

  const fmt1 = (v: number | null, unit: string) =>
    v === null ? '—' : v.toFixed(1) + unit;

  const intervalActive =
    intervalState === 'running' || intervalState === 'waiting';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 font-sans text-sm bg-white min-h-screen">
      <h1 className="text-base font-bold text-gray-800 mb-3">TLSN Benchmark</h1>

      <p className="text-xs text-gray-500 mb-3">
        ① Trigger one Prove in the Alipay/Wise window first.
        <br />② Set config, then start benchmark.
      </p>

      {/* ── Mode Tabs ── */}
      <div className="flex mb-4 border border-gray-200 rounded overflow-hidden text-xs">
        {(['burst', 'interval'] as BenchmarkMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 font-semibold capitalize ${
              mode === m
                ? 'bg-primary text-white'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ═══════════════════ BURST MODE ═══════════════════ */}
      {mode === 'burst' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-gray-600 text-xs w-10">Runs:</label>
            <input
              type="number"
              min={5}
              max={200}
              value={runs}
              onChange={(e) => setRuns(Math.max(5, parseInt(e.target.value) || 20))}
              disabled={burstState === 'running'}
              className="input border border-gray-300 rounded w-20"
            />
          </div>

          {burstState !== 'running' && (
            <button
              onClick={startBurst}
              className="button button--primary w-full py-1"
            >
              {burstState === 'done'
                ? `Re-run Benchmark (${runs}×)`
                : `Start Benchmark (${runs}×)`}
            </button>
          )}

          {burstState === 'running' && (
            <ProgressBar progress={progress} label="Running..." />
          )}

          {burstErrorMsg && (
            <p className="text-xs text-red-500">{burstErrorMsg}</p>
          )}

          {burstState === 'done' && burstTimings.length > 0 && (
            <div className="space-y-3">
              {/* Timing table */}
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-1 border border-gray-200">Phase</th>
                    <th className="text-right p-1 border border-gray-200">Mean</th>
                    <th className="text-right p-1 border border-gray-200">Std Dev</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      { label: 'Connection (A)', key: 'connectionMs' },
                      { label: 'Send Request (B)', key: 'requestMs' },
                      { label: 'Proof Gen (C)', key: 'proofGenerationMs' },
                      { label: 'Verification (D)', key: 'verificationMs' },
                      { label: 'Total', key: 'totalProtocolMs' },
                    ] as { label: string; key: keyof TimingRecord }[]
                  ).map(({ label, key }) => (
                    <tr key={key as string}>
                      <td className="p-1 border border-gray-200">{label}</td>
                      <td className="text-right p-1 border border-gray-200">
                        {avgMs(key)}
                      </td>
                      <td className="text-right p-1 border border-gray-200">
                        {stddevMs(key)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Data metrics */}
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-1 border border-gray-200">Metric</th>
                    <th className="text-right p-1 border border-gray-200">Avg (warm)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1 border border-gray-200">Response Size</td>
                    <td className="text-right p-1 border border-gray-200">
                      {fmt1(avgRecvKB, ' KB')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border border-gray-200">Sent Size</td>
                    <td className="text-right p-1 border border-gray-200">
                      {fmt1(avgSentKB, ' KB')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border border-gray-200">Reveal Ratio</td>
                    <td className="text-right p-1 border border-gray-200">
                      {fmt1(avgRevealRatioPct, '%')}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="text-xs text-gray-500">
                N={burstWarm.length} warm runs (run #1 cold start excluded)
              </p>

              <button
                onClick={() => {
                  const csv = toCSV(burstTimings, false);
                  const ts = new Date().toISOString().replace(/[:.]/g, '-');
                  downloadCSV(csv, `tlsn-burst-${ts}.csv`);
                }}
                className="button w-full py-1"
              >
                Download CSV
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ INTERVAL MODE ═══════════════════ */}
      {mode === 'interval' && (
        <div className="space-y-2">
          {/* Config */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-gray-600 text-xs w-20">Interval:</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={intervalMinutes}
                onChange={(e) =>
                  setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 30))
                }
                disabled={intervalActive}
                className="input border border-gray-300 rounded w-16"
              />
              <span className="text-xs text-gray-500">min</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-gray-600 text-xs w-20">Runs/cycle:</label>
              <input
                type="number"
                min={5}
                max={200}
                value={runsPerInterval}
                onChange={(e) =>
                  setRunsPerInterval(Math.max(5, parseInt(e.target.value) || 20))
                }
                disabled={intervalActive}
                className="input border border-gray-300 rounded w-16"
              />
            </div>
          </div>

          {/* Start button */}
          {!intervalActive && (
            <button
              onClick={startInterval}
              className="button button--primary w-full py-1"
            >
              {intervalState === 'stopped'
                ? 'Restart Interval Benchmark'
                : 'Start Interval Benchmark'}
            </button>
          )}

          {/* Stop + status */}
          {intervalActive && (
            <div className="space-y-1">
              <button
                onClick={stopInterval}
                className="button w-full py-1"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
              >
                ■ Stop
              </button>
              <p className="text-xs text-center text-gray-600">
                {intervalState === 'running' ? (
                  <>Running round {currentRound + 1}...</>
                ) : (
                  <>
                    Round {currentRound} done · Next in{' '}
                    <span className="font-mono font-semibold">
                      {formatCountdown(countdownSec)}
                    </span>
                  </>
                )}
              </p>
            </div>
          )}

          {/* Progress bar (during active round) */}
          {intervalState === 'running' && (
            <ProgressBar
              progress={progress}
              label={`Round ${currentRound + 1}`}
            />
          )}

          {/* Stopped notice */}
          {intervalState === 'stopped' && roundSummaries.length > 0 && (
            <p className="text-xs text-gray-500">
              Stopped after {currentRound} round{currentRound !== 1 ? 's' : ''}.
            </p>
          )}

          {intervalErrorMsg && (
            <p className="text-xs text-red-500">{intervalErrorMsg}</p>
          )}

          {/* Per-round summary table */}
          {roundSummaries.length > 0 && (
            <div className="space-y-2 mt-1">
              <p className="text-xs font-semibold text-gray-700">
                Per-round Summary
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-1 border border-gray-200">Rnd</th>
                    <th className="text-right p-1 border border-gray-200">N</th>
                    <th className="text-right p-1 border border-gray-200">Conn</th>
                    <th className="text-right p-1 border border-gray-200">Req</th>
                    <th className="text-right p-1 border border-gray-200">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {roundSummaries.map((s) => (
                    <tr key={s.round}>
                      <td className="p-1 border border-gray-200">{s.round}</td>
                      <td className="text-right p-1 border border-gray-200">
                        {s.warmCount}
                      </td>
                      <td className="text-right p-1 border border-gray-200">
                        {msToSec(s.avgConnectionMs)}
                      </td>
                      <td className="text-right p-1 border border-gray-200">
                        {msToSec(s.avgRequestMs)}
                      </td>
                      <td className="text-right p-1 border border-gray-200">
                        {msToSec(s.avgTotalMs)}
                      </td>
                    </tr>
                  ))}
                  {intervalState === 'running' && (
                    <tr>
                      <td className="p-1 border border-gray-200 text-gray-400">
                        {currentRound + 1}
                      </td>
                      <td
                        colSpan={4}
                        className="text-center p-1 border border-gray-200 text-gray-400 italic"
                      >
                        running...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <button
                onClick={() => {
                  const csv = toCSV(allTimings, true);
                  const ts = new Date().toISOString().replace(/[:.]/g, '-');
                  downloadCSV(csv, `tlsn-interval-${ts}.csv`);
                }}
                className="button w-full py-1"
              >
                Download Full CSV ({allTimings.length} records)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ProgressBar: React.FC<{
  progress: { current: number; total: number };
  label: string;
}> = ({ progress, label }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-gray-600">
      <span>{label}</span>
      <span>
        {progress.current} / {progress.total}
      </span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-500 h-2 rounded-full transition-all"
        style={{
          width:
            progress.total > 0
              ? `${(progress.current / progress.total) * 100}%`
              : '0%',
        }}
      />
    </div>
  </div>
);

export default SidePanel;
