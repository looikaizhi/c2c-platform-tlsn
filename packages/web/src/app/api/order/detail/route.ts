import { RowDataPacket } from 'mysql2/promise';
import pool from '@/server/database';
import * as dbTypes from '@/server/db_types';

export const GET = async (req: Request) => {
    const { searchParams } = new URL(req.url);
    const orderIdParam = searchParams.get('orderId');
    const orderId = Number(orderIdParam);

    if (!orderIdParam || !Number.isFinite(orderId)) {
        return Response.json({ error: 'Invalid orderId parameter.' }, { status: 400 });
    }

    try {
        const query = `
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
            FROM
                order_contract AS OC
            INNER JOIN
                userdata AS UD
                ON OC.wallet_address = UD.wallet_address
            WHERE
                OC.id = ?
            LIMIT 1;
        `;

        const [rows] = await pool.query<dbTypes.OrderDetail[] & RowDataPacket[]>(
            query,
            [orderId],
        );

        return Response.json(rows[0] ?? null, { status: 200 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: error || 'Internal Server Error' }, { status: 500 });
    }
};
