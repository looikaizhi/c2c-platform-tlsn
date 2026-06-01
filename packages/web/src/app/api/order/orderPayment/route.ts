import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import type { OrderPayment, OrderPaymentRequest } from '@/server/db_types';

interface Row extends Omit<OrderPayment, 'account_number_hash'> {
    account_number_hash: Buffer | string;
}

export const POST = async (req: Request) => {
    const { order_id } = (await req.json()) as OrderPaymentRequest;
    if (!order_id) {
        return Response.json({ error: 'Missing order id parameter.' }, { status: 400 });
    }
    try {
        const rows = getDb().all<Row>(sql`
            SELECT
                PM.method_name,
                FBA.account_holder_name,
                FBA.account_last4,
                FBA.currency,
                FBA.account_number_hash,
                PM.icon_url,
                PM.url
            FROM order_index AS OI
            INNER JOIN fiat_bank_accounts AS FBA
                ON OI.bank_id = FBA.id AND OI.wallet_address = FBA.wallet_address
            INNER JOIN payment_method AS PM ON FBA.method_id_fk = PM.method_id
            WHERE OI.order_id = ${order_id};
        `);
        // Normalize Buffer (BLOB) → hex string for JSON transport.
        const normalized: OrderPayment[] = rows.map((r) => ({
            ...r,
            account_number_hash: Buffer.isBuffer(r.account_number_hash)
                ? r.account_number_hash.toString('hex')
                : r.account_number_hash,
        }));
        return Response.json(normalized, { status: 200 });
    } catch (error) {
        console.error('[order/orderPayment POST]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
