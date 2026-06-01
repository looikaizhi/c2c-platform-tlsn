import 'server-only';
import type { Hex } from 'viem';
import {
    extractSignedHeaders,
    verifySignedRequest,
} from '@/lib/walletAuth';
import { findActiveBinding } from '@/server/db/bindingRepo';

function isHex32(s: unknown): s is Hex {
    return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const platformId = url.searchParams.get('platformId');
    if (!isHex32(platformId)) {
        return Response.json({ error: 'invalid_platform_id' }, { status: 400 });
    }

    let caller;
    try {
        const { signature, timestamp } = extractSignedHeaders(req.headers);
        caller = await verifySignedRequest({
            domain: 'user',
            method: 'GET',
            // include query string so signed message matches client's
            // signApiRequest(path: `/api/binding/me?platformId=...`)
            path: url.pathname + url.search,
            signature,
            timestamp,
        });
    } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'auth_failed';
        return Response.json({ error: reason }, { status: 401 });
    }

    const row = findActiveBinding(caller.wallet, platformId);
    if (!row) {
        return Response.json({ binding: null });
    }
    return Response.json({
        binding: {
            id: row.id,
            platformId: row.platformId,
            plaintextName: row.plaintextName,
            plaintextHandle: row.plaintextHandle,
            nameCommit: row.nameCommit,
            idCommit: row.idCommit,
            createdAt: row.createdAt,
        },
    });
}
