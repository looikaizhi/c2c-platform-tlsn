// packages/demo/src/components/ProofDetail.tsx
// Detail view for one proof: header + travelRuleFields + accountChecks +
// redactedTranscript + local signature re-verification + on-chain reconciliation.

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { Hex } from 'viem';
import { getProof, type ProofExportResponse } from '../utils/proofsApi';
import { verifyVerifierSignature, type VerifyResult } from '../utils/verifySignature';
import { reconcileOnChain, type ReconcileResult } from '../utils/reconcileOnChain';

export interface ProofDetailProps {
    attestationId: string;
    activeUserAddr?: Hex;
    onClose?: () => void;
}

const C = {
    primary: '#2563EB',
    success: '#16A34A',
    error: '#DC2626',
    warning: '#F97316',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    bg: '#F8FAFC',
} as const;

const S: Record<string, CSSProperties> = {
    panel: { background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' },
    header: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg,
    },
    title: { fontWeight: 700, fontSize: 14, color: C.text, margin: 0 },
    section: { padding: '14px 16px', borderBottom: `1px solid ${C.border}` },
    sectionTitle: { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
    kv: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: '6px 12px', fontSize: 12 },
    mono: { fontFamily: '"Fira Code", monospace', fontSize: 11, color: C.text, wordBreak: 'break-all' },
    badge: {
        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    },
    tableHead: { display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 2fr', gap: 8, fontSize: 11, color: C.muted, fontWeight: 700, padding: '6px 0', borderBottom: `1px dashed ${C.border}` },
    tableRow:  { display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 2fr', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: `1px dashed ${C.border}` },
    closeBtn: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: C.muted },
    pre: {
        background: '#0f172a', color: '#e2e8f0', padding: 10, borderRadius: 6,
        fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.5,
        maxHeight: 220, overflow: 'auto',
    },
};

function badgeOk(ok: boolean): CSSProperties {
    return ok
        ? { ...S.badge, background: '#dcfce7', color: '#166534' }
        : { ...S.badge, background: '#fee2e2', color: '#991b1b' };
}

function badgeNeutral(): CSSProperties {
    return { ...S.badge, background: '#e2e8f0', color: '#334155' };
}

export function ProofDetail({ attestationId, activeUserAddr, onClose }: ProofDetailProps) {
    const [proof, setProof] = useState<ProofExportResponse | null>(null);
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
    const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setProof(null);
        setVerifyResult(null);
        setReconcile(null);
        try {
            const p = await getProof(attestationId, activeUserAddr);
            setProof(p);
            // Run local re-verify and on-chain reconcile in parallel.
            const [vr, rr] = await Promise.all([
                verifyVerifierSignature(p).catch((e) => ({
                    commitmentsHashMatch: false,
                    recovered: '0x0' as Hex,
                    addressMatch: false,
                    _err: e?.message,
                })),
                reconcileOnChain(p).catch((e) => ({
                    status: 'no_tx' as const,
                    error: e?.message,
                })),
            ]);
            setVerifyResult(vr as VerifyResult);
            setReconcile(rr as ReconcileResult);
        } catch (err) {
            setError((err as any)?.message ?? String(err));
        } finally {
            setLoading(false);
        }
    }, [attestationId, activeUserAddr]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return <div style={S.panel}><div style={S.section}>Loading proof {attestationId}…</div></div>;
    }
    if (error) {
        return (
            <div style={S.panel}>
                <div style={S.header}>
                    <h3 style={S.title}>Proof detail</h3>
                    <div style={{ flex: 1 }} />
                    {onClose && <button style={S.closeBtn} onClick={onClose} aria-label="Close">×</button>}
                </div>
                <div style={{ ...S.section, color: C.error, fontSize: 12 }}>{error}</div>
            </div>
        );
    }
    if (!proof) return null;

    const sigOk = !!verifyResult?.addressMatch && !!verifyResult?.commitmentsHashMatch;
    const txOk = reconcile?.status === 'success';

    return (
        <div style={S.panel}>
            <div style={S.header}>
                <h3 style={S.title}>Proof {proof.attestationId}</h3>
                <span style={sigOk ? badgeOk(true) : badgeOk(false)} title="Local signature re-verification">
                    sig {sigOk ? '✓' : '✗'}
                </span>
                {proof.txHash ? (
                    <span style={txOk ? badgeOk(true) : badgeOk(false)} title="On-chain reconciliation">
                        chain {txOk ? '✓' : '✗'}
                    </span>
                ) : (
                    <span style={badgeNeutral()}>no tx</span>
                )}
                <div style={{ flex: 1 }} />
                {onClose && <button style={S.closeBtn} onClick={onClose} aria-label="Close">×</button>}
            </div>

            {/* ── Header card ─────────────────────────────────────────────────── */}
            <div style={S.section}>
                <div style={S.kv}>
                    <div style={{ color: C.muted }}>server</div><div>{proof.serverName}</div>
                    <div style={{ color: C.muted }}>tenant</div><div>{(proof.sessionData as any)?.__tlsn_tenant_id ?? '—'}</div>
                    <div style={{ color: C.muted }}>policyVersion</div><div>{proof.policyVersion}</div>
                    <div style={{ color: C.muted }}>chainId</div><div>{proof.chainId ?? '—'}</div>
                    <div style={{ color: C.muted }}>timestamp</div><div>{proof.timestamp}</div>
                    <div style={{ color: C.muted }}>verifierAddress</div><div style={S.mono}>{proof.verifierAddress}</div>
                    <div style={{ color: C.muted }}>orderBindingHash</div><div style={S.mono}>{proof.orderBindingHash ?? '—'}</div>
                    <div style={{ color: C.muted }}>commitmentsHash</div><div style={S.mono}>{proof.commitmentsHash}</div>
                    <div style={{ color: C.muted }}>txHash</div><div style={S.mono}>{proof.txHash ?? '—'}</div>
                </div>
            </div>

            {/* ── Local signature re-verification ─────────────────────────────── */}
            <div style={S.section}>
                <div style={S.sectionTitle}>Local signature re-verification</div>
                {verifyResult ? (
                    <div style={S.kv}>
                        <div style={{ color: C.muted }}>commitmentsHash recompute</div>
                        <div><span style={badgeOk(verifyResult.commitmentsHashMatch)}>{verifyResult.commitmentsHashMatch ? 'match' : 'mismatch'}</span></div>
                        <div style={{ color: C.muted }}>recovered signer</div>
                        <div style={S.mono}>{verifyResult.recovered}</div>
                        <div style={{ color: C.muted }}>address match</div>
                        <div><span style={badgeOk(verifyResult.addressMatch)}>{verifyResult.addressMatch ? 'match' : 'mismatch'}</span></div>
                    </div>
                ) : (
                    <div style={{ fontSize: 12, color: C.muted }}>—</div>
                )}
            </div>

            {/* ── On-chain reconciliation ─────────────────────────────────────── */}
            <div style={S.section}>
                <div style={S.sectionTitle}>On-chain reconciliation</div>
                {reconcile ? (
                    <div style={S.kv}>
                        <div style={{ color: C.muted }}>status</div>
                        <div><span style={reconcile.status === 'success' ? badgeOk(true) : badgeOk(false)}>{reconcile.status}</span></div>
                        {reconcile.txStatus && (<>
                            <div style={{ color: C.muted }}>receipt</div>
                            <div>{reconcile.txStatus}</div>
                        </>)}
                        {reconcile.orderBindingMatch !== undefined && (<>
                            <div style={{ color: C.muted }}>orderBindingMatch</div>
                            <div><span style={badgeOk(reconcile.orderBindingMatch)}>{String(reconcile.orderBindingMatch)}</span></div>
                        </>)}
                        {reconcile.onChainOrderId && (<>
                            <div style={{ color: C.muted }}>onChain orderId</div>
                            <div style={S.mono}>{reconcile.onChainOrderId}</div>
                        </>)}
                        {reconcile.onChainOrderStatus !== undefined && (<>
                            <div style={{ color: C.muted }}>onChain orderStatus</div>
                            <div>{reconcile.onChainOrderStatus}</div>
                        </>)}
                        {reconcile.error && (<>
                            <div style={{ color: C.muted }}>error</div>
                            <div style={{ color: C.error }}>{reconcile.error}</div>
                        </>)}
                    </div>
                ) : (
                    <div style={{ fontSize: 12, color: C.muted }}>—</div>
                )}
            </div>

            {/* ── Travel-rule fields ──────────────────────────────────────────── */}
            <div style={S.section}>
                <div style={S.sectionTitle}>travelRuleFields</div>
                <div style={S.tableHead}>
                    <div>field</div><div>commit#</div><div>value</div>
                </div>
                {Object.entries(proof.travelRuleFields ?? {}).map(([k, v]) => (
                    <div key={k} style={S.tableRow}>
                        <div>{k}</div>
                        <div>{v.commitmentIndex}</div>
                        <div style={S.mono}>{v.value}</div>
                    </div>
                ))}
                {(!proof.travelRuleFields || Object.keys(proof.travelRuleFields).length === 0) && (
                    <div style={{ padding: '8px 0', color: C.muted, fontSize: 12 }}>—</div>
                )}
            </div>

            {/* ── Account checks ──────────────────────────────────────────────── */}
            <div style={S.section}>
                <div style={S.sectionTitle}>accountChecks</div>
                {(proof.accountChecks?.length ?? 0) > 0 ? (
                    <div style={S.tableHead}>
                        <div>field</div><div>matched</div><div>raw</div>
                    </div>
                ) : (
                    <div style={{ fontSize: 12, color: C.muted }}>—</div>
                )}
                {(proof.accountChecks ?? []).map((c: any, i) => (
                    <div key={i} style={S.tableRow}>
                        <div>{c.field ?? c.label ?? `#${i}`}</div>
                        <div><span style={badgeOk(!!c.matched)}>{String(c.matched)}</span></div>
                        <div style={S.mono}>{JSON.stringify(c)}</div>
                    </div>
                ))}
            </div>

            {/* ── Redacted transcript (debug) ────────────────────────────────── */}
            {proof.redactedTranscript && (
                <div style={S.section}>
                    <div style={S.sectionTitle}>redactedTranscript</div>
                    <div style={{ ...S.kv, gridTemplateColumns: '60px 1fr' }}>
                        <div style={{ color: C.muted }}>sent</div>
                        <pre style={S.pre}>{proof.redactedTranscript.sent}</pre>
                        <div style={{ color: C.muted }}>recv</div>
                        <pre style={S.pre}>{proof.redactedTranscript.recv}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
