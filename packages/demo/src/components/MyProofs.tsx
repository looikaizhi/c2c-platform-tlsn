// packages/demo/src/components/MyProofs.tsx
// User-facing wrapper around <ProofsList mode="user" /> + <ProofDetail />.
//
// Owns the SIWE login lifecycle for the active wallet, so the proof list does
// NOT fire /proofs until the JWT lands in sessionStorage. Without this gate the
// list races SIWE and shows a transient 401.

import { useEffect, useState, type CSSProperties } from 'react';
import type { Hex, WalletClient } from 'viem';
import { ProofsList } from './ProofsList';
import { ProofDetail } from './ProofDetail';
import type { ListItem } from '../utils/proofsApi';
import { loginAsUser } from '../utils/verifierAuth';
import { getUserClientByAddress } from '../utils/hardhatAccounts';

export interface MyProofsProps {
    /** Active wallet address whose proofs to show. Required — backend forces owner=this. */
    activeUserAddr: Hex;
    /** Optional reload trigger (e.g. parent increments after a new payment) */
    reloadKey?: number;
}

const C = { border: '#E2E8F0', text: '#0F172A', muted: '#64748B', error: '#DC2626' } as const;

const S: Record<string, CSSProperties> = {
    wrap: { display: 'grid', gap: 14 },
    header: { display: 'flex', alignItems: 'center', gap: 8 },
    h: { margin: 0, fontSize: 14, fontWeight: 700, color: C.text },
    hint: { fontSize: 12, color: C.muted },
    hintErr: { fontSize: 12, color: C.error },
};

type LoginStatus = 'idle' | 'pending' | 'ok' | 'failed';

function jwtKey(addr: string) {
    return `tlsn:jwt:${addr.toLowerCase()}`;
}

function hasFreshJwt(addr: string): boolean {
    try {
        const raw = sessionStorage.getItem(jwtKey(addr));
        if (!raw) return false;
        const t = JSON.parse(raw) as { expiresAt: number };
        return t.expiresAt - Math.floor(Date.now() / 1000) > 60;
    } catch {
        return false;
    }
}

export function MyProofs({ activeUserAddr, reloadKey }: MyProofsProps) {
    const [selected, setSelected] = useState<ListItem | null>(null);
    const [loginStatus, setLoginStatus] = useState<LoginStatus>('idle');
    const [loginError, setLoginError] = useState<string | null>(null);
    // Increments every time SIWE login resolves OK, so ProofsList re-fetches with auth.
    const [loginEpoch, setLoginEpoch] = useState(0);

    useEffect(() => {
        let cancelled = false;

        // Fast-path: cached JWT still valid → mark OK without bothering the wallet.
        if (hasFreshJwt(activeUserAddr)) {
            setLoginStatus('ok');
            setLoginError(null);
            setLoginEpoch((n) => n + 1);
            return () => { cancelled = true; };
        }

        const wc = getUserClientByAddress(activeUserAddr) as WalletClient | undefined;
        if (!wc) {
            setLoginStatus('failed');
            setLoginError(`No local wallet client for ${activeUserAddr}.`);
            return () => { cancelled = true; };
        }

        setLoginStatus('pending');
        setLoginError(null);
        loginAsUser(wc)
            .then(() => {
                if (cancelled) return;
                setLoginStatus('ok');
                setLoginEpoch((n) => n + 1);
            })
            .catch((err) => {
                if (cancelled) return;
                setLoginStatus('failed');
                setLoginError((err as any)?.message ?? String(err));
            });

        return () => { cancelled = true; };
    }, [activeUserAddr]);

    const enabled = loginStatus === 'ok';
    const composedReloadKey = (reloadKey ?? 0) * 1_000_000 + loginEpoch;

    let hintNode: JSX.Element;
    if (loginStatus === 'pending') {
        hintNode = <span style={S.hint}>Signing in with wallet… (SIWE)</span>;
    } else if (loginStatus === 'failed') {
        hintNode = <span style={S.hintErr}>SIWE login failed: {loginError}</span>;
    } else {
        hintNode = (
            <span style={S.hint}>
                Auto-scoped to the active wallet ({activeUserAddr.slice(0, 8)}…{activeUserAddr.slice(-6)}).
            </span>
        );
    }

    return (
        <div style={S.wrap}>
            <div style={S.header}>
                <h3 style={S.h}>My TLSN Proofs</h3>
                {hintNode}
            </div>
            <ProofsList
                mode="user"
                activeUserAddr={activeUserAddr}
                onSelect={(it) => setSelected(it)}
                reloadKey={composedReloadKey}
                enabled={enabled}
                disabledMessage={
                    loginStatus === 'failed'
                        ? 'SIWE login failed — see hint above.'
                        : 'Waiting for SIWE login…'
                }
            />
            {selected && (
                <ProofDetail
                    attestationId={selected.attestationId}
                    activeUserAddr={activeUserAddr}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
