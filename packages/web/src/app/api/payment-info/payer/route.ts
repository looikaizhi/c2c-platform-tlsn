import 'server-only';
import { eq } from 'drizzle-orm';
import type { Address, Hex } from 'viem';
import { extractSignedHeaders, verifySignedRequest } from '@/lib/walletAuth';
import { getDb } from '@/server/db/client';
import { walletPaymentBinding } from '@/server/db/schema';
import { getBuyerPaymentInfo } from '@/chain/server/readers/orderReader';

interface Body {
    merchant: Address;
    productId: string;
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

    // Only the merchant of the order may view the payer (buyer)'s plaintext —
    // FIAT path only.
    if (caller.wallet !== body.merchant.toLowerCase()) {
        return Response.json({ error: 'not_order_merchant' }, { status: 403 });
    }

    let buyerInfo;
    try {
        buyerInfo = await getBuyerPaymentInfo(
            body.merchant,
            BigInt(body.productId),
            BigInt(body.orderId),
        );
    } catch (err: unknown) {
        console.error('[payment-info/payer] buyerPaymentInfo read failed', err);
        return Response.json({ error: 'buyer_payment_info_read_failed' }, { status: 502 });
    }
    if (!buyerInfo.isSet) {
        return Response.json({ error: 'order_has_no_buyer_payment_info' }, { status: 404 });
    }

    const onchainNameCommit = buyerInfo.nameHash as Hex;
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
        bindingStatus: row.status,
        anchor: {
            nameHash: buyerInfo.nameHash,
            idHash: buyerInfo.idHash,
        },
    });
}
