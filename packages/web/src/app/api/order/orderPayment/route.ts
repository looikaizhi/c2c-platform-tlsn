import { RowDataPacket } from 'mysql2/promise';
import pool from '@/server/database';
import * as dbTypes from '@/server/db_types';

export const POST = async(req: Request) =>{
    const { order_id } = await req.json() as dbTypes.OrderPaymentRequest;
    if (!order_id) {
        return Response.json({ error: 'Missing order id parameter.' }, { status: 400 });
    }
    try{
        const query = `
            SELECT
                FBA.id AS bank_account_id,
                PM.method_name,
                FBA.account_holder_name,
                FBA.account_last4,
                FBA.currency,
                FBA.account_number_hash,
                PM.icon_url,
                PM.url
            FROM
                order_index AS OI
            INNER JOIN
                fiat_bank_accounts AS FBA
                ON OI.bank_id = FBA.id AND OI.wallet_address = FBA.wallet_address
            INNER JOIN
                payment_method AS PM
                ON FBA.method_id_fk = PM.method_id
            WHERE
                OI.order_id = ?;
        `;
        const [rows] = await pool.query<dbTypes.OrderPayment[] & RowDataPacket[]>(
            query,
            [order_id]
        );
        return Response.json(rows, { status: 200 });
    }catch(error){
        console.error(error);
        return Response.json({ error: error || 'Internal Server Error' }, { status: 500 });
    }
};
