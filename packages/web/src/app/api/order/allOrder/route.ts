import { RowDataPacket } from 'mysql2/promise';
import pool from '@/server/database';
import * as dbTypes from '@/server/db_types';

export const POST = async(req: Request) =>{
    const { wallet_address, fiat_to_crypto, fiat_asset_name, crypto_asset_name} = await req.json() as dbTypes.OrderListRequest;
    if (!wallet_address) {
        return Response.json({ error: 'Missing wallet_address parameter.' }, { status: 400 });
    }
    try{
        const query = `
            SELECT
                OC.id AS order_id,
                OC.fiat_asset_name,
                OC.crypto_asset_name,
                UD.wallet_address,
                UD.close_rate AS success_rate,
                UD.trading_volume,
                UD.user_level,
                UD.minimum_amount AS min_order_amount,
                UD.maximum_amount AS max_order_amount,
                GROUP_CONCAT(DISTINCT PM.method_name ORDER BY PM.method_name SEPARATOR ', ') AS supported_methods
            FROM
                order_contract AS OC
            INNER JOIN
                userdata AS UD
                ON OC.wallet_address = UD.wallet_address
            INNER JOIN
                order_index AS OI
                ON OC.id = OI.order_id AND OC.wallet_address = OI.wallet_address
            INNER JOIN
                fiat_bank_accounts AS FBA
                ON OI.bank_id = FBA.id AND OI.wallet_address = FBA.wallet_address
            INNER JOIN
                payment_method AS PM
                ON FBA.method_id_fk = PM.method_id
            WHERE
                UD.wallet_address != ? and
                OC.fiat_to_crypto = ? and
                OC.fiat_asset_name = ? and
                OC.crypto_asset_name = ?
            GROUP BY
                OC.id, UD.wallet_address, UD.close_rate, UD.trading_volume, UD.user_level, UD.minimum_amount, UD.maximum_amount
            ORDER BY
                UD.user_level DESC,
                UD.trading_volume DESC,
                UD.close_rate DESC;
        `;
        const [rows] = await pool.query<dbTypes.OrderList[] & RowDataPacket[]>(
            query,
            [wallet_address, fiat_to_crypto, fiat_asset_name, crypto_asset_name]
        );
        return Response.json(rows, { status: 200 });
    }catch(error){
        console.error(error);
        return Response.json({ error: error || 'Internal Server Error' }, { status: 500 });
    }
};
