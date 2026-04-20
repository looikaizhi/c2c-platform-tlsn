import { RowDataPacket } from 'mysql2/promise';
import pool from '@/server/database';
import type { SupportFiatAsset, SyncFiatRequest } from '@/server/db_types';

export const GET = async () => {
    try {
        const [rows] = await pool.query<SupportFiatAsset[] & RowDataPacket[]>(
            'SELECT * FROM support_fiat_assets ORDER BY fiat_id ASC',
        );
        return Response.json(rows, { status: 200 });
    } catch (error) {
        console.error('[admin/fiat GET]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const POST = async (req: Request) => {
    const body = await req.json() as SyncFiatRequest;
    const { fiat_id, fiat_name, is_active } = body;

    if (fiat_id === undefined || !fiat_name) {
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        await pool.execute(
            'INSERT INTO support_fiat_assets (fiat_id, fiat_name, is_active) VALUES (?, ?, ?)',
            [fiat_id, fiat_name, is_active ? 1 : 0],
        );
        return Response.json({ ok: true }, { status: 201 });
    } catch (error) {
        console.error('[admin/fiat POST]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
