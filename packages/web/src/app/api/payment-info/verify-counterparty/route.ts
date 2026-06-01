import 'server-only';
import type { Address, Hex } from 'viem';
import { extractSignedHeaders, verifySignedRequest } from '@/lib/walletAuth';
import { computeCommit } from '@/lib/payeeCrypto';
import { findBindingByNameCommit, logVerifyAttempt } from '@/server/db/bindingRepo';
import { getOrder, getBuyerPaymentInfo } from '@/chain/server/readers/orderReader';

interface Body {
    merchant: Address;
    productId: string;
    assetType: 0 | 1;
    orderId: string;
    role: 'payee' | 'payer';
    /**
     * Disclosed plaintext extracted from the TLSN proof transcript by the
     * frontend (see lib/tlsnParse.ts for the MVP rationale). The chain anchor
     * + DB salt + commit recompute below catches any client-side lying.
     */
    disclosed: { name: string; handle: string };
}

function isAddress(s: unknown): s is Address {
    return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

function orderKeyOf(b: Body): string {
    return `${b.merchant.toLowerCase()}:${b.productId}:${b.assetType}:${b.orderId}`;
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
        typeof body.orderId !== 'string' ||
        (body.role !== 'payee' && body.role !== 'payer') ||
        !body.disclosed ||
        typeof body.disclosed.name !== 'string' ||
        typeof body.disclosed.handle !== 'string'
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

    // (a) Pull the CHAIN anchor (always — never trust DB-stored commits here).
    let onchainNameCommit: Hex;
    let onchainIdCommit: Hex;
    try {
        if (body.role === 'payee') {
            const order = await getOrder(
                body.merchant,
                BigInt(body.productId),
                body.assetType,
                BigInt(body.orderId),
            );
            onchainNameCommit = order.merchantNameHash;
            onchainIdCommit = order.merchantIdHash;
        } else {
            const buyerInfo = await getBuyerPaymentInfo(
                body.merchant,
                BigInt(body.productId),
                BigInt(body.orderId),
            );
            if (!buyerInfo.isSet) {
                return Response.json(
                    { ok: false, reason: 'order_has_no_buyer_payment_info' },
                    { status: 404 },
                );
            }
            onchainNameCommit = buyerInfo.nameHash;
            onchainIdCommit = buyerInfo.idHash;
        }
    } catch (err: unknown) {
        console.error('[verify-counterparty] chain read failed', err);
        return Response.json({ ok: false, reason: 'chain_read_failed' }, { status: 502 });
    }

    const orderKey = orderKeyOf(body);

    // (b) Reverse-lookup binding by chain commit. DB row's salt is the only
    // off-chain secret needed to recompute the commit.
    const row = findBindingByNameCommit(onchainNameCommit);
    if (!row) {
        logVerifyAttempt({
            callerWallet: caller.wallet,
            orderKey,
            role: body.role,
            onchainCommit: onchainNameCommit,
            result: 'no_matching_binding',
        });
        return Response.json({ ok: false, reason: 'no_matching_binding' });
    }

    // (c) Recompute commits with the disclosed plaintext + the DB salt.
    const computedName = computeCommit(body.disclosed.name, row.salt as Hex);
    const computedId = computeCommit(body.disclosed.handle, row.salt as Hex);

    // (d) Compare to CHAIN values, NOT to DB row's stored commit. If a server
    // bug or malicious admin poisoned `row.name_commit`, this check still
    // catches it because the anchor is on-chain.
    if (computedName.toLowerCase() !== onchainNameCommit.toLowerCase()) {
        logVerifyAttempt({
            callerWallet: caller.wallet,
            orderKey,
            role: body.role,
            onchainCommit: onchainNameCommit,
            result: 'name_mismatch',
        });
        return Response.json({
            ok: false,
            reason: 'name_mismatch',
            expected: onchainNameCommit,
            computed: computedName,
        });
    }
    if (computedId.toLowerCase() !== onchainIdCommit.toLowerCase()) {
        logVerifyAttempt({
            callerWallet: caller.wallet,
            orderKey,
            role: body.role,
            onchainCommit: onchainIdCommit,
            result: 'id_mismatch',
        });
        return Response.json({
            ok: false,
            reason: 'id_mismatch',
            expected: onchainIdCommit,
            computed: computedId,
        });
    }

    logVerifyAttempt({
        callerWallet: caller.wallet,
        orderKey,
        role: body.role,
        onchainCommit: onchainNameCommit,
        result: 'ok',
    });
    return Response.json({ ok: true });
}
