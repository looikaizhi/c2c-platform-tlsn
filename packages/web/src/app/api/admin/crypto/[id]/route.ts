import pool from '@/server/database';
import type { UpdateAssetStatusRequest } from '@/server/db_types';

export const PATCH = async (
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) => {
    const { id } = await params;
    const cryptoId = parseInt(id, 10);

    if (isNaN(cryptoId)) {
        return Response.json({ error: 'Invalid id' }, { status: 400 });
    }

    const body = await req.json() as UpdateAssetStatusRequest;

    if (body.is_active === undefined) {
        return Response.json({ error: 'Missing is_active' }, { status: 400 });
    }

    try {
        const [result] = await pool.execute(
            'UPDATE support_crypto_assets SET is_active = ?, edit_time = NOW() WHERE crypto_id = ?',
            [body.is_active ? 1 : 0, cryptoId],
        ) as any[];

        if (result.affectedRows === 0) {
            return Response.json({ error: 'Record not found' }, { status: 404 });
        }

        return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
        console.error('[admin/crypto/[id] PATCH]', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
