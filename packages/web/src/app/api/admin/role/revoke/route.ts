import 'server-only';
import { eq } from 'drizzle-orm';
import type { Address } from 'viem';
import { extractSignedHeaders, verifySignedRequest } from '@/lib/walletAuth';
import { normalizeWallet } from '@/lib/payeeCrypto';
import { getDb } from '@/server/db/client';
import { userProfile, adminActionLog } from '@/server/db/schema';
import { getAdminAddress } from '@/chain/server/readers/adminReader';

interface Body {
    wallet: Address;
    notes?: string;
}

function isAddress(s: unknown): s is Address {
    return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

export async function POST(req: Request) {
    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return Response.json({ error: 'invalid_json' }, { status: 400 });
    }
    if (!isAddress(body.wallet)) {
        return Response.json({ error: 'invalid_input' }, { status: 400 });
    }

    const url = new URL(req.url);
    let caller;
    try {
        const { signature, timestamp } = extractSignedHeaders(req.headers);
        caller = await verifySignedRequest({
            domain: 'admin',
            method: 'POST',
            path: url.pathname + url.search,
            body,
            signature,
            timestamp,
        });
    } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : 'auth_failed' }, { status: 401 });
    }

    let adminAddr: Address;
    try {
        adminAddr = await getAdminAddress();
    } catch (err: unknown) {
        console.error('[admin/role/revoke] admin read failed', err);
        return Response.json({ error: 'admin_read_failed' }, { status: 502 });
    }
    if (caller.wallet !== adminAddr.toLowerCase()) {
        return Response.json({ error: 'not_admin' }, { status: 403 });
    }

    const target = normalizeWallet(body.wallet);
    const ts = Math.floor(Date.now() / 1000);
    const db = getDb();

    try {
    db.transaction((tx) => {
        // admin_action_log has FKs into user_profile for both admin_wallet and
        // target_wallet — ensure both rows exist before logging.
        const adminExists = tx
            .select({ wallet: userProfile.walletAddress })
            .from(userProfile)
            .where(eq(userProfile.walletAddress, caller.wallet))
            .get();
        if (!adminExists) {
            tx.insert(userProfile)
                .values({
                    walletAddress: caller.wallet,
                    role: 'buyer',
                    createdAt: ts,
                    updatedAt: ts,
                })
                .run();
        }

        // Demote target to 'buyer'. If the wallet has no profile row, create
        // one as buyer.
        const existing = tx
            .select()
            .from(userProfile)
            .where(eq(userProfile.walletAddress, target))
            .get();
        if (existing) {
            tx.update(userProfile)
                .set({
                    role: 'buyer',
                    grantedBy: caller.wallet,
                    grantedAt: ts,
                    updatedAt: ts,
                })
                .where(eq(userProfile.walletAddress, target))
                .run();
        } else {
            tx.insert(userProfile)
                .values({
                    walletAddress: target,
                    role: 'buyer',
                    grantedBy: caller.wallet,
                    grantedAt: ts,
                    createdAt: ts,
                    updatedAt: ts,
                })
                .run();
        }
        tx.insert(adminActionLog)
            .values({
                adminWallet: caller.wallet,
                targetWallet: target,
                action: 'revoke_merchant',
                notes: body.notes ?? null,
                createdAt: ts,
            })
            .run();
    });
    } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[admin/role/revoke] tx failed:', detail);
        return Response.json({ error: 'db_tx_failed', detail }, { status: 500 });
    }

    return Response.json({ ok: true, wallet: target, role: 'buyer' });
}
