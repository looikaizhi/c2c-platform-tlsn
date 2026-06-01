import 'server-only';
import { eq } from 'drizzle-orm';
import type { Address, Hex } from 'viem';
import { extractSignedHeaders, verifySignedRequest } from '@/lib/walletAuth';
import { getDb } from '@/server/db/client';
import { walletPaymentBinding } from '@/server/db/schema';
import { getOrder } from '@/chain/server/readers/orderReader';

interface Body {
    merchant: Address;
    productId: string;
    assetType: 0 | 1;
    orderId: string;
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
    if (
        !isAddress(body.merchant) ||
        typeof body.productId !== 'string' ||
        (body.assetType !== 0 && body.assetType !== 1) ||
        typeof body.orderId !== 'string'
    ) {
        return Response.json({ error: 'invalid_input' }, { status: 400 });
    }

    const url = new URL(req.url);
    let caller;
    try {
        const { signature, timestamp } = extractSignedHeaders(req.headers);
        caller = await verifySignedRequest({
            domain: 'user',
            method: 'POST',
            path: url.pathname + url.search,
            body,
            signature,
            timestamp,
        });
    } catch (err: unknown) {
        return Response.json({ error: err instanceof Error ? err.message : 'auth_failed' }, { status: 401 });
    }

    let order;
    try {
        order = await getOrder(
            body.merchant,
            BigInt(body.productId),
            body.assetType,
            BigInt(body.orderId),
        );
    } catch (err: unknown) {
        console.error('[payment-info/payee] order read failed', err);
        return Response.json({ error: 'order_read_failed' }, { status: 502 });
    }

    // R7: caller must be the buyer of the order (only buyer needs payee info).
    if (caller.wallet !== order.buyer.toLowerCase()) {
        return Response.json({ error: 'not_order_buyer' }, { status: 403 });
    }

    // Chain anchor lookup: find DB row whose name_commit matches the frozen
    // Order.merchantNameHash. This survives merchant rebind (old superseded
    // row is still queryable because we lookup by commit, not by status).
    const onchainNameCommit = order.merchantNameHash as Hex;
    const row = getDb()
        .select({
            plaintextName: walletPaymentBinding.plaintextName,
            plaintextHandle: walletPaymentBinding.plaintextHandle,
            platformId: walletPaymentBinding.platformId,
            status: walletPaymentBinding.status,
        })
        .from(walletPaymentBinding)
        .where(eq(walletPaymentBinding.nameCommit, onchainNameCommit))
        .get();

    if (!row) {
        return Response.json({ error: 'no_matching_binding' }, { status: 404 });
    }

    return Response.json({
        plaintextName: row.plaintextName,
        plaintextHandle: row.plaintextHandle,
        platformId: row.platformId,
        bindingStatus: row.status, // 'active' or 'superseded' — informational
        anchor: {
            nameHash: order.merchantNameHash,
            idHash: order.merchantIdHash,
        },
    });
}
