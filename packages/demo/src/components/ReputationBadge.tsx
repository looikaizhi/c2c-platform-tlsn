// packages/demo/src/components/ReputationBadge.tsx
// Pure display component — renders a user's V4 reputation status badge.

export interface ReputationView {
  completedCount: number;
  timeoutCount: number;
  consecutiveTimeouts: number;
  completedSinceLastTimeout: number;
  riskLevel: number;
  temporarilyFrozen: boolean;
  blacklisted: boolean;
  frozenUntil: bigint;
  lastTimeoutAt: bigint;
}

interface ReputationBadgeProps {
  reputation: ReputationView;
  bondBps?: number | null;
  bondBpsError?: string | null;
  compact?: boolean;
}

function formatFrozenUntil(ts: bigint): string {
  if (ts === 0n) return '';
  return new Date(Number(ts) * 1000).toLocaleString();
}

function getBadgeConfig(rep: ReputationView): {
  bg: string;
  color: string;
  border: string;
  label: string;
} {
  const now = Math.floor(Date.now() / 1000);
  if (rep.blacklisted) {
    return { bg: '#fff1f0', color: '#cf1322', border: '#ffa39e', label: 'BLACKLISTED' };
  }
  if (rep.temporarilyFrozen && Number(rep.frozenUntil) > now) {
    return {
      bg: '#f9f0ff',
      color: '#531dab',
      border: '#d3adf7',
      label: `FROZEN 至 ${formatFrozenUntil(rep.frozenUntil)}`,
    };
  }
  if (rep.riskLevel >= 8) {
    return { bg: '#fff1f0', color: '#cf1322', border: '#ffa39e', label: `HIGH RISK (L${rep.riskLevel})` };
  }
  if (rep.riskLevel >= 4) {
    return { bg: '#fff7e6', color: '#d46b08', border: '#ffd591', label: `RISKY (L${rep.riskLevel})` };
  }
  if (rep.riskLevel >= 1) {
    return { bg: '#fffbe6', color: '#d48806', border: '#ffe58f', label: `FAIR (L${rep.riskLevel})` };
  }
  return { bg: '#f6ffed', color: '#389e0d', border: '#b7eb8f', label: 'GOOD' };
}

export function ReputationBadge({ reputation, bondBps, bondBpsError, compact = false }: ReputationBadgeProps) {
  const badge = getBadgeConfig(reputation);

  const badgeEl = (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: 4,
      background: badge.bg,
      color: badge.color,
      border: `1px solid ${badge.border}`,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      {badge.label}
    </span>
  );

  if (compact) return badgeEl;

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ marginBottom: 6 }}>{badgeEl}</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#595959', marginBottom: 4 }}>
        <span>✅ {reputation.completedCount} 笔完成</span>
        <span>⏱ {reputation.timeoutCount} 次超时</span>
        {reputation.consecutiveTimeouts > 0 && (
          <span style={{ color: '#d46b08' }}>⚠ 连续 {reputation.consecutiveTimeouts} 次超时</span>
        )}
      </div>

      {bondBps != null && !bondBpsError && (
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
          当前保证金比率：{(bondBps / 100).toFixed(1)}%
        </div>
      )}

      {bondBpsError && (
        <div style={{ fontSize: 12, color: '#cf1322', marginTop: 4 }}>
          ⚠ {bondBpsError}
        </div>
      )}
    </div>
  );
}
