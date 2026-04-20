import { RowDataPacket } from 'mysql2/promise';
import pool from '@/server/database';
import * as dbTypes from '@/server/db_types';

export const POST = async(req: Request) =>{
    const {wallet_address} = await req.json() as dbTypes.UserDashboardRequest;
    if (!wallet_address) {
        return Response.json({ error: 'Missing wallet_address parameter.' }, { status: 400 });
    }
    try{
        const query = `
            SELECT
                oc.id AS order_id,
                oc.contract_address,
                oc.fiat_asset_name,
                oc.crypto_asset_name,
                oc.fiat_to_crypto,
                oc.create_time AS order_create_time,
                fba.currency AS bank_currency,
                fba.bank_name,
                fba.account_number_hash,
                fba.account_last4,
                fba.bank_verified
            FROM
                order_contract oc
            JOIN
                order_index oi ON oc.id = oi.order_id AND oc.wallet_address = oi.wallet_address
            JOIN
                fiat_bank_accounts fba ON oi.bank_id = fba.id AND oi.wallet_address = fba.wallet_address
            WHERE
                oc.wallet_address = ?
            ORDER BY
                oc.create_time DESC
        `;
        const [rows] = await pool.query<dbTypes.UserDashboard[] & RowDataPacket[]>(
            query,
            [wallet_address]
        );
        return Response.json(rows, { status: 200 });
    }catch(error){
        console.error(error);
        return Response.json({ error: error || 'Internal Server Error' }, { status: 500 });
    }
};
