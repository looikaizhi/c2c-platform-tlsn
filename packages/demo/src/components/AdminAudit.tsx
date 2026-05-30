// packages/demo/src/components/AdminAudit.tsx
// Admin-facing wrapper around <ProofsList mode="admin" /> + <ProofDetail />.
// Gates the initial fetch on Admin Key presence so we don't fire a doomed 401
// on first render (key is set via AdminPanel's verifierAuth.loginAsAdmin).

import { useEffect, useState, type CSSProperties } from 'react';
import { ProofsList } from './ProofsList';
import { ProofDetail } from './ProofDetail';
import type { ListItem } from '../utils/proof';

const C = { text: '#0F172A', muted: '#64748B' } as const;

const S: Record<string, CSSProperties> = {
    wrap: { display: 'grid', gap: 14 },
    header: { display: 'flex', alignItems: 'center', gap: 8 },
    h: { margin: 0, fontSize: 14, fontWeight: 700, color: C.text },
    hint: { fontSize: 12, color: C.muted },
};

function readAdminKey(): boolean {
    if (typeof window === 'undefined') return false;
    return !!sessionStorage.getItem('tlsn:adminKey');
}

export function AdminAudit() {
    const [selected, setSelected] = useState<ListItem | null>(null);
    const [keyPresent, setKeyPresent] = useState(readAdminKey);
    // Bump every transition false→true so ProofsList re-fetches when the key arrives.
    const [keyEpoch, setKeyEpoch] = useState(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const tick = () => {
            const now = readAdminKey();
            setKeyPresent((prev) => {
                if (prev !== now) {
                    if (now) setKeyEpoch((n) => n + 1);
                    return now;
                }
                return prev;
            });
        };
        // window storage event doesn't fire for same-tab writes, so we poll cheaply.
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, []);

    return (
        <div style={S.wrap}>
            <div style={S.header}>
                <h3 style={S.h}>All TLSN Proofs (Admin)</h3>
                <span style={S.hint}>
                    {keyPresent ? 'Admin Key active — free filtering.' : 'Set Admin Key above to unlock.'}
                </span>
            </div>
            <ProofsList
                mode="admin"
                onSelect={(it) => setSelected(it)}
                enabled={keyPresent}
                reloadKey={keyEpoch}
                disabledMessage="Set Admin Key above to load proofs."
            />
            {selected && (
                <ProofDetail
                    attestationId={selected.attestationId}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
