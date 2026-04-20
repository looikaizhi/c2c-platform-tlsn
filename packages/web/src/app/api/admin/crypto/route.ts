import { RowDataPacket } from 'mysql2/promise';
import pool from '@/server/database';
import type { SupportCryptoAsset, SyncCryptoRequest } from '@/server/db_types';

export const GET = async () => {
    try {
        const [rows] = await pool.query<SupportCryptoAsset[] & RowDataPacket[]>(
            'SELECT * FROM support_crypto_assets ORDER BY crypto_id ASC',
        );
        return Response.json(rows, { status: 200 });
    } catch (error) {
        console.error('[admin/crypto GET]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const POST = async (req: Request) => {
    const body = await req.json() as SyncCryptoRequest;
    const { crypto_id, token_symbol, token_address, is_active } = body;

    if (crypto_id === undefined || !token_symbol || !token_address) {
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        await pool.execute(
            'INSERT INTO support_crypto_assets (crypto_id, token_symbol, token_address, is_active) VALUES (?, ?, ?, ?)',
            [crypto_id, token_symbol, token_address, is_active ? 1 : 0],
        );
        return Response.json({ ok: true }, { status: 201 });
    } catch (error) {
        console.error('[admin/crypto POST]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
