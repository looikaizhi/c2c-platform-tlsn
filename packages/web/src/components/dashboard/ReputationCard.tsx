"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { ReputationData } from '@/hooks/useReputation';

interface ReputationCardProps {
    data: ReputationData | null;
    loading: boolean;
    error: string | null;
    refetch?: () => void;
    /** Compact mode collapses the card to ~120px for sidebar use (merchant panel). */
    compact?: boolean;
}

function riskColor(riskLabel: ReputationData['riskLabel']): string {
    switch (riskLabel) {
        case 'Low':         return 'var(--status-success)';
        case 'Medium':      return 'var(--status-warning)';
        case 'High':        return '#f97316';
        case 'Critical':    return 'var(--status-danger)';
        case 'Frozen':      return 'var(--status-info)';
        case 'Blacklisted': return 'var(--status-danger)';
    }
}

function riskBadgeVariant(riskLabel: ReputationData['riskLabel']): 'success' | 'warning' | 'danger' | 'info' {
    switch (riskLabel) {
        case 'Low':         return 'success';
        case 'Medium':      return 'warning';
        case 'High':        return 'warning';
        case 'Critical':    return 'danger';
        case 'Frozen':      return 'info';
        case 'Blacklisted': return 'danger';
    }
}

function progressColor(level: number): string {
    if (level <= 1) return 'var(--status-success)';
    if (level <= 4) return 'var(--status-warning)';
    if (level <= 7) return '#f97316';
    return 'var(--status-danger)';
}

function FrozenCountdown({ frozenUntil }: { frozenUntil: number }) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        const update = () => {
            const diff = frozenUntil * 1000 - Date.now();
            if (diff <= 0) { setRemaining('Thawed'); return; }
            const d = Math.floor(diff / 86_400_000);
            const h = Math.floor((diff % 86_400_000) / 3_600_000);
            const m = Math.floor((diff % 3_600_000) / 60_000);
            setRemaining(d > 0 ? `${d}d ${h}h remaining` : `${h}h ${m}m remaining`);
        };
        update();
        const id = setInterval(update, 60_000);
        return () => clearInterval(id);
    }, [frozenUntil]);

    return <span style={{ fontSize: '12px', color: 'var(--status-info)' }}>{remaining}</span>;
}

function SkeletonRow({ width }: { width: string }) {
    return (
        <div style={{
            height: '14px', borderRadius: '4px', width,
            background: 'var(--border-default)',
            animation: 'pulse 1.5s ease-in-out infinite',
        }} />
    );
}

export default function ReputationCard({ data, loading, error, refetch, compact = false }: ReputationCardProps) {
    const [showSkeleton, setShowSkeleton] = useState(false);

    useEffect(() => {
        if (!loading) { setShowSkeleton(false); return; }
        const id = setTimeout(() => setShowSkeleton(true), 300);
        return () => clearTimeout(id);
    }, [loading]);

    // ── Compact variant: Bond% as hero number + segmented bar + micro-stats. ~180px.
    if (compact) {
        const segments = 10;
        return (
            <Card padding="none" className="card-glow p-4" style={{ minWidth: 0, minHeight: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <ShieldCheck size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Reputation
                    </span>
                    {refetch && (
                        <button
                            type="button"
                            onClick={refetch}
                            aria-label="Refresh reputation"
                            style={{
                                marginLeft: 'auto', minWidth: 28, minHeight: 28, padding: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', fontSize: 13,
                                borderRadius: 6,
                                transition: 'color var(--motion-fast)',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                        >↻</button>
                    )}
                </div>

                {showSkeleton && <SkeletonRow width="80%" />}
                {!loading && error && (
                    <p style={{ fontSize: 12, color: 'var(--status-danger)', margin: 0 }}>{error}</p>
                )}
                {!loading && !error && !data && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Connect wallet.</p>
                )}
                {!loading && data && (
                    <>
                        {/* Hero: Bond% (big) + Risk level (secondary, right-aligned) */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                            <div>
                                <div style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 28,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    color: 'var(--text-primary)',
                                    letterSpacing: '-0.02em',
                                }}>
                                    {(data.bondBps / 100).toFixed(1)}<span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}>%</span>
                                </div>
                                <div style={{ marginTop: 2, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    Required bond
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: riskColor(data.riskLabel), lineHeight: 1 }}>
                                        {data.riskLevel}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 10</span>
                                </div>
                                <div style={{ marginTop: 4 }}>
                                    <Badge variant={riskBadgeVariant(data.riskLabel)} size="sm">
                                        {data.blacklisted ? <><Ban style={{ width: 9, height: 9, marginRight: 2 }} />{data.riskLabel}</> : data.riskLabel}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Segmented bar — 10 discrete blocks, fills based on risk level */}
                        <div style={{ display: 'flex', gap: 3, marginBottom: 12 }} aria-hidden>
                            {Array.from({ length: segments }).map((_, i) => {
                                const filled = i < data.riskLevel;
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            flex: 1,
                                            height: 6,
                                            borderRadius: 2,
                                            background: filled ? progressColor(data.riskLevel) : 'var(--bg-surface-3)',
                                            transition: 'background 0.3s ease',
                                        }}
                                    />
                                );
                            })}
                        </div>

                        {/* Micro-stats row */}
                        <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 4, background: 'var(--bg-surface-2)' }}>
                                <CheckCircle2 size={11} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{data.completedCount}</span>
                                <span style={{ color: 'var(--text-muted)' }}>done</span>
                            </span>
                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 4, background: 'var(--bg-surface-2)' }}>
                                <AlertTriangle size={11} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{data.timeoutCount}</span>
                                <span style={{ color: 'var(--text-muted)' }}>t/o</span>
                            </span>
                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 4, background: 'var(--bg-surface-2)' }}>
                                <ShieldAlert size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{data.consecutiveTimeouts}</span>
                                <span style={{ color: 'var(--text-muted)' }}>cons</span>
                            </span>
                        </div>

                        {data.temporarilyFrozen && !data.blacklisted && (
                            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--status-info)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <AlertTriangle size={11} />
                                Frozen{data.frozenUntil > 0 && <> · <FrozenCountdown frozenUntil={data.frozenUntil} /></>}
                            </div>
                        )}
                        {data.blacklisted && (
                            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--status-danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Ban size={11} /> Blacklisted — trading disabled
                            </div>
                        )}
                    </>
                )}
            </Card>
        );
    }

    return (
        <Card padding="none" className="p-4" style={{ minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck style={{ width: '16px', height: '16px', color: 'var(--text-subtle)' }} />
                    <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500 }}>
                        Reputation
                    </span>
                </div>
                {refetch && (
                    <button
                        type="button"
                        onClick={refetch}
                        aria-label="Refresh reputation"
                        style={{
                            minWidth: '44px', minHeight: '44px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: '11px',
                            borderRadius: 'var(--radius-sm)',
                            transition: 'color var(--motion-fast)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                    >
                        Refresh
                    </button>
                )}
            </div>

            {/* Skeleton */}
            {showSkeleton && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <SkeletonRow width="40%" />
                    <SkeletonRow width="100%" />
                    <SkeletonRow width="60%" />
                    <SkeletonRow width="80%" />
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div role="alert" style={{
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                    fontSize: '13px', color: 'var(--status-danger)',
                }}>
                    {error}
                </div>
            )}

            {/* No data */}
            {!loading && !error && !data && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Connect wallet to view reputation.</p>
            )}

            {/* Content */}
            {!loading && data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

                    {/* Risk level header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <p style={{ fontSize: '28px', fontWeight: 700, color: riskColor(data.riskLabel), margin: 0, fontFamily: 'var(--font-mono)' }}>
                                {data.riskLevel}<span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 400 }}> / 10</span>
                            </p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Risk Level</p>
                        </div>
                        <Badge variant={riskBadgeVariant(data.riskLabel)}>
                            {data.blacklisted ? <><Ban style={{ width: '10px', height: '10px', marginRight: '3px' }} />{data.riskLabel}</> : data.riskLabel}
                        </Badge>
                    </div>

                    {/* Progress bar */}
                    <div>
                        <div style={{
                            height: '6px', borderRadius: '3px',
                            background: 'var(--border-default)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${(data.riskLevel / 10) * 100}%`,
                                background: progressColor(data.riskLevel),
                                borderRadius: '3px',
                                transition: 'width 0.4s ease',
                            }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Low</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Critical</span>
                        </div>
                    </div>

                    {/* Bond rate */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                    }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Required Bond Rate</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {(data.bondBps / 100).toFixed(1)}%
                        </span>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                        <div style={{
                            flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        }}>
                            <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--status-success)' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {data.completedCount}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Completed</span>
                        </div>
                        <div style={{
                            flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        }}>
                            <AlertTriangle style={{ width: '14px', height: '14px', color: 'var(--status-warning)' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {data.timeoutCount}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Timeouts</span>
                        </div>
                        <div style={{
                            flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-base)', border: '1px solid var(--border-default)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        }}>
                            <ShieldAlert style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {data.consecutiveTimeouts}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Consecutive</span>
                        </div>
                    </div>

                    {/* Frozen warning */}
                    {data.temporarilyFrozen && !data.blacklisted && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                            background: 'var(--status-info-bg)', border: '1px solid var(--status-info)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle style={{ width: '14px', height: '14px', color: 'var(--status-info)', flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: 'var(--status-info)', fontWeight: 500 }}>Account Temporarily Frozen</span>
                            </div>
                            {data.frozenUntil > 0 && <FrozenCountdown frozenUntil={data.frozenUntil} />}
                        </div>
                    )}

                    {/* Blacklisted warning */}
                    {data.blacklisted && (
                        <div role="alert" style={{
                            padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
                            background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger)',
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}>
                            <Ban style={{ width: '14px', height: '14px', color: 'var(--status-danger)', flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', color: 'var(--status-danger)', fontWeight: 500 }}>
                                Account Permanently Blacklisted — trading disabled
                            </span>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}
