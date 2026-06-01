import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import type { OrderDetail } from '@/server/db_types';

interface Row extends Omit<OrderDetail, 'create_time'> {
    create_time: number;  // unix seconds in SQLite
}

export const GET = async (req: Request) => {
    const { searchParams } = new URL(req.url);
    const orderIdParam = searchParams.get('orderId');
    const orderId = Number(orderIdParam);
    if (!orderIdParam || !Number.isFinite(orderId)) {
        return Response.json({ error: 'Invalid orderId parameter.' }, { status: 400 });
    }
    try {
        const rows = getDb().all<Row>(sql`
            SELECT
                OC.id AS order_id,
                OC.wallet_address,
                OC.contract_address,
                OC.fiat_to_crypto,
                OC.fiat_asset_name,
                OC.crypto_asset_name,
                OC.create_time,
                UD.user_level,
                UD.close_rate,
                UD.trading_volume,
                UD.minimum_amount,
                UD.maximum_amount
            FROM order_contract AS OC
            INNER JOIN userdata AS UD ON OC.wallet_address = UD.wallet_address
            WHERE OC.id = ${orderId}
            LIMIT 1;
        `);
        if (rows.length === 0) {
            return Response.json(null, { status: 200 });
        }
        const r = rows[0];
        const detail: OrderDetail = {
            ...r,
            create_time: new Date(r.create_time * 1000).toISOString(),
        };
        return Response.json(detail, { status: 200 });
    } catch (error) {
        console.error('[order/detail GET]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
