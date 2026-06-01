import 'server-only';
import type { Hex } from 'viem';
import {
    extractSignedHeaders,
    verifySignedRequest,
} from '@/lib/walletAuth';
import {
    computeCommit,
    randomSalt,
} from '@/lib/payeeCrypto';
import { maskForProof } from '@/lib/proofMask';
import {
    upsertUserProfile,
    insertBinding,
} from '@/server/db/bindingRepo';

const PATH = '/api/binding/register';
const MAX_COLLISION_RETRIES = 3;

interface RegisterBody {
    platformId: Hex;
    name: string;
    handle: string;
}

function isHex32(s: unknown): s is Hex {
    return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);
}

export async function POST(req: Request) {
    let body: RegisterBody;
    try {
        body = (await req.json()) as RegisterBody;
    } catch {
        return Response.json({ error: 'invalid_json' }, { status: 400 });
    }
    if (
        !isHex32(body.platformId) ||
        typeof body.name !== 'string' ||
        typeof body.handle !== 'string' ||
        body.name.trim().length === 0 ||
        body.handle.trim().length === 0
    ) {
        return Response.json({ error: 'invalid_input' }, { status: 400 });
    }

    let caller;
    try {
        const { signature, timestamp } = extractSignedHeaders(req.headers);
        caller = await verifySignedRequest({
            domain: 'user',
            method: 'POST',
            path: PATH,
            body,
            signature,
            timestamp,
        });
    } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'auth_failed';
        return Response.json({ error: reason }, { status: 401 });
    }

    upsertUserProfile(caller.wallet);

    // `body.name`/`body.handle` are the FULL identity (stored for display). The
    // on-chain commit is computed over the platform-MASKED form, because that is
    // what the payment-detail proof reveals (e.g. Alipay returns "* LIM HOOI
    // YEN"). For platforms that return the full identity (Wise), maskForProof is
    // the identity transform, so the commit is over the full value.
    const masked = maskForProof(body.platformId, { name: body.name, handle: body.handle });

    for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
        const salt = randomSalt();
        const nameCommit = computeCommit(masked.name, salt);
        const idCommit = computeCommit(masked.handle, salt);
        try {
            const res = insertBinding({
                wallet: caller.wallet,
                platformId: body.platformId,
                name: body.name,
                handle: body.handle,
                salt,
                nameCommit,
                idCommit,
            });
            return Response.json({
                bindingId: res.id,
                supersededId: res.supersededId,
                nameCommit,
                idCommit,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '';
            if (/UNIQUE constraint failed.*(name_commit|id_commit)/i.test(msg)) {
                continue;
            }
            console.error('[binding/register] insert failed', err);
            return Response.json({ error: 'insert_failed' }, { status: 500 });
        }
    }

    return Response.json({ error: 'commit_collision' }, { status: 500 });
}
